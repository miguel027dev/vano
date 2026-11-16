/** Separate durable event inbox. Disabled until explicitly configured. No app_state writes. */
import {Pool} from 'pg';
import {sanitizeObservabilityBatch} from './observability-policy.mjs';
export async function openObservability({connectionString,secret,PoolType=Pool}){
 const uri=new URL(String(connectionString).replace(/^postgres(?:ql)?\+[a-z0-9_-]+:\/\//i,'postgresql://'));
 if(uri.searchParams.get('sslmode')==='require'&&!uri.searchParams.has('uselibpqcompat'))uri.searchParams.set('uselibpqcompat','true');
 let working=false,lastFailure=null,lastProcessedAt=null,failures=0,nextAttempt=0;
 const pool=new PoolType({connectionString:uri.toString(),max:2,connectionTimeoutMillis:5000,query_timeout:5000,application_name:'vano-observability'});
 pool.on?.('error',()=>{lastFailure='database_unavailable';});
 try{
 await pool.query(`CREATE SCHEMA IF NOT EXISTS vano_observability`);
 await pool.query(`CREATE TABLE IF NOT EXISTS vano_observability.events (
  id uuid PRIMARY KEY, subject char(64) NOT NULL, session char(64) NOT NULL,
  name varchar(40) NOT NULL, version varchar(16) NOT NULL,
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  params jsonb NOT NULL, processed boolean NOT NULL DEFAULT false)`);
 await pool.query(`CREATE INDEX IF NOT EXISTS obs_received ON vano_observability.events(received_at)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS vano_observability.daily (
  day date NOT NULL,name varchar(40) NOT NULL,version varchar(16) NOT NULL,
  events bigint NOT NULL DEFAULT 0,total_duration_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(day,name,version))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS vano_observability.budget (day date PRIMARY KEY,events integer NOT NULL)`);
 await pool.query(`CREATE INDEX IF NOT EXISTS obs_pending ON vano_observability.events(received_at) WHERE processed=false`);
 }catch(error){await pool.end().catch(()=>{});throw error;}
 async function process(){
  if(working||Date.now()<nextAttempt)return;working=true;
  const client=await pool.connect().catch(()=>null);
  if(!client){working=false;lastFailure='database_unavailable';failures++;nextAttempt=Date.now()+Math.min(60000,2000*2**Math.min(failures,5));return;}
  try{
   await client.query('BEGIN');
   await client.query(`WITH selected AS MATERIALIZED (
    SELECT id,name,version,occurred_at,params FROM vano_observability.events
    WHERE processed=false ORDER BY received_at LIMIT 100 FOR UPDATE SKIP LOCKED
   ), aggregated AS (
    INSERT INTO vano_observability.daily(day,name,version,events,total_duration_ms)
    SELECT (occurred_at AT TIME ZONE 'UTC')::date,name,version,count(*),
     sum(coalesce((params->>'duration_ms')::bigint,0)) FROM selected GROUP BY 1,2,3
    ON CONFLICT(day,name,version) DO UPDATE SET
     events=vano_observability.daily.events+EXCLUDED.events,
     total_duration_ms=vano_observability.daily.total_duration_ms+EXCLUDED.total_duration_ms
    RETURNING 1
   ) UPDATE vano_observability.events SET processed=true
    WHERE id IN (SELECT id FROM selected) AND EXISTS(SELECT 1 FROM aggregated)`);
   // Bounded retention work; raw history 7 days, aggregates 90 days.
   await client.query(`DELETE FROM vano_observability.events WHERE id IN (SELECT id FROM vano_observability.events WHERE received_at<now()-interval '7 days' LIMIT 1000)`);
   await client.query(`DELETE FROM vano_observability.daily WHERE day<(now() AT TIME ZONE 'UTC')::date-90`);
   await client.query(`DELETE FROM vano_observability.budget WHERE day<(now() AT TIME ZONE 'UTC')::date-7`);
   await client.query('COMMIT');lastFailure=null;failures=0;nextAttempt=0;lastProcessedAt=new Date().toISOString();
  }catch{await client.query('ROLLBACK').catch(()=>{});lastFailure='processing_failed';failures++;nextAttempt=Date.now()+Math.min(60000,2000*2**Math.min(failures,5));}
  finally{client.release();working=false;}
 }
 const timer=setInterval(()=>void process(),2000);timer.unref();
 return {
  async ingest(body){
   const events=sanitizeObservabilityBatch(body,secret);
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    // Atomic daily cap includes retries, so duplicates cannot exhaust disk or billing.
    const budget=await client.query(`INSERT INTO vano_observability.budget(day,events) VALUES ((now() AT TIME ZONE 'UTC')::date,$1)
     ON CONFLICT(day) DO UPDATE SET events=vano_observability.budget.events+$1
     WHERE vano_observability.budget.events+$1<=30000 RETURNING events`,[events.length]);
    if(!budget.rowCount)throw Error('daily_limit');
    let accepted=0;
    for(const e of events){const result=await client.query(`INSERT INTO vano_observability.events(id,subject,session,name,version,occurred_at,params) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`,[e.id,e.subject,e.session,e.name,e.version,e.occurredAt,JSON.stringify(e.params)]);accepted+=result.rowCount;}
    await client.query('COMMIT');return {accepted,duplicates:events.length-accepted};
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
   finally{client.release();}
  },
  async report(){
   const daily=await pool.query(`SELECT day,name,version,events,total_duration_ms FROM vano_observability.daily ORDER BY day DESC LIMIT 1000`);
   const history=await pool.query(`SELECT id,name,version,occurred_at,received_at,params FROM vano_observability.events ORDER BY received_at DESC LIMIT 100`);
   const active=await pool.query(`SELECT count(DISTINCT subject)::integer AS active FROM vano_observability.events WHERE received_at>now()-interval '5 minutes'`);
   return {source:'vano_first_party',activeInstallations5m:active.rows[0]?.active||0,daily:daily.rows,history:history.rows,
    queue:{lastFailure,lastProcessedAt},officialInstalls:null,firebaseFirstOpens:null,retention:null,
    caveats:['Atividade observada com consentimento; não representa todos os usuários nem instalações oficiais.','Identificador aleatório rotaciona no cliente; histórico bruto retido por 7 dias.','Sessões e retenção GA4 e instalações Play exigem importação oficial separada.']};
  },
  async close(){clearInterval(timer);await pool.end();}
 };
}
