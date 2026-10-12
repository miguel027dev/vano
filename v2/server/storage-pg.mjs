/** Durable single-instance snapshot store. A dedicated schema avoids touching VANO V1 tables.
 * DATABASE_URL is never logged. This backend MUST NOT run as multiple V2 replicas.
 */
import {Client} from 'pg';
import {emptyData} from './storage.mjs';

function validate(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Estado VANO V2 inválido no PostgreSQL.');
  const clean={...emptyData(),...data};
  for(const key of Object.keys(emptyData()))if(!Array.isArray(clean[key]))throw Error('Coleção VANO V2 inválida: '+key);
  return clean;
}
export async function openPostgresStore(connectionString, ClientType=Client){
  // Flask/SQLAlchemy exports can use a dialect suffix; the Node driver needs a libpq URI.
  // Never log the full URL because it may contain database credentials.
  const original=String(connectionString||'').trim().replace(/^["']|["']$/g,'');
  const normalized=original.replace(/^postgres(?:ql)?\+[a-z0-9_-]+:\/\//i,'postgresql://').replace(/^jdbc:postgresql:\/\//i,'postgresql://');
  if(!/^postgres(?:ql)?:\/\//i.test(normalized)){
    const scheme=original.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]||'ausente';
    throw Error('DATABASE_URL não é uma conexão PostgreSQL. Esquema configurado: '+scheme.slice(0,32));
  }
  const client=new ClientType({connectionString:normalized,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'vano-v2-node'});
  let broken=null;
  client.on('error',error=>{broken=error;console.error('VANO V2 PostgreSQL: conexão perdida.');});
  await client.connect();
  try{
    await client.query('CREATE SCHEMA IF NOT EXISTS vano_v2');
    await client.query('CREATE TABLE IF NOT EXISTS vano_v2.app_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    await client.query('INSERT INTO vano_v2.app_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(emptyData())]);
    const row=await client.query('SELECT data FROM vano_v2.app_state WHERE id=1');
    if(row.rowCount!==1)throw Error('Estado persistente indisponível.');
    const data=validate(row.rows[0].data);
    let pending=Promise.resolve();
    return {
      data,kind:'postgres',persistent:true,
      assertHealthy(){if(broken)throw Error('PostgreSQL indisponível. Aguarde a reconexão do serviço.');},
      save(){
        if(broken)return Promise.reject(new Error('PostgreSQL indisponível.'));
        const snapshot=JSON.stringify(data);
        if(Buffer.byteLength(snapshot)>64*1024*1024)return Promise.reject(new Error('Estado VANO V2 excedeu 64 MiB.'));
        pending=pending.then(async()=>{
          if(broken)throw broken;
          await client.query('UPDATE vano_v2.app_state SET data=$1::jsonb, updated_at=now() WHERE id=1',[snapshot]);
        }).catch(e=>{broken=e;console.error('VANO V2 PostgreSQL: falha ao salvar estado.');throw e;});
        return pending;
      }
    };
  }catch(e){await client.end().catch(()=>{});throw e;}
}
