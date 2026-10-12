/** PostgreSQL-backed VANO V2 state, isolated from any legacy V1 tables.
 * Single writer, serializable writes with optimistic revision guards.
 * Never copy the legacy V1 user tables or infer account equivalence.
 */
import { emptyData } from './storage.mjs';

function validate(data){
  if(!data || typeof data!=='object' || Array.isArray(data))throw Error('Estado PostgreSQL inválido.');
  for(const key of Object.keys(emptyData()))if(!Array.isArray(data[key]))throw Error('Coleção PostgreSQL inválida: '+key);
  return { ...emptyData(), ...data };
}
export async function openPostgresStore(connectionString){
  if(!/^postgres(ql)?:\/\//.test(connectionString||''))throw Error('DATABASE_URL deve ser um endereço PostgreSQL.');
  const { default: pg } = await import('pg');
  const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
  try{
    await pool.query(`CREATE TABLE IF NOT EXISTS vano_v2_store_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('INSERT INTO vano_v2_store_state (id,data) VALUES ($1,$2::jsonb) ON CONFLICT (id) DO NOTHING',['main',JSON.stringify(emptyData())]);
    const result=await pool.query('SELECT data,revision FROM vano_v2_store_state WHERE id=$1',['main']);
    if(result.rowCount!==1)throw Error('Estado PostgreSQL não encontrado.');
    const data=validate(result.rows[0].data);
    let revision=BigInt(result.rows[0].revision),queue=Promise.resolve();
    function save(){
      const snapshot=JSON.stringify(data);
      if(snapshot.length>16*1024*1024)throw Error('Limite de armazenamento VANO excedido.');
      queue=queue.then(async()=>{
        const updated=await pool.query(`UPDATE vano_v2_store_state
          SET data=$1::jsonb,revision=revision+1,updated_at=NOW()
          WHERE id=$2 AND revision=$3 RETURNING revision`,[snapshot,'main',revision.toString()]);
        if(updated.rowCount!==1)throw Error('Outra instância alterou a base VANO; reinicie para evitar conflito de dados.');
        revision=BigInt(updated.rows[0].revision);
      });
      return queue;
    }
    return {data,save,kind:'postgres',close:()=>pool.end()};
  }catch(e){await pool.end().catch(()=>{});throw e;}
}
