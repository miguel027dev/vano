/** Dedicated PostgreSQL transactions; never write the application snapshot.
 * Only enabled explicitly. No external exporter, user ID, IP, URL or location.
 */
import {validateAnalyticsBatch} from './analytics-events.mjs';
export function createAnalyticsQueue(pool,{clock=Date.now,onFailure=()=>{}}={}){
 let busy=false,stopped=false,timer=null,failures=0,lastPrune=0,lastFailure=null;
 const schema=`CREATE SCHEMA IF NOT EXISTS vano_observability;
 CREATE TABLE IF NOT EXISTS vano_observability.events (
  event_id uuid PRIMARY KEY, session_id uuid NOT NULL, name varchar(40) NOT NULL,
  version varchar(16) NOT NULL, occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), params jsonb NOT NULL,
  processed_at timestamptz);
 CREATE INDEX IF NOT EXISTS observability_pending ON vano_observability.events(received_at) WHERE processed_at IS NULL;
 CREATE INDEX IF NOT EXISTS observability_expiry ON vano_observability.events(received_at);
 CREATE TABLE IF NOT EXISTS vano_observability.daily (
  day date NOT NULL, name varchar(40) NOT NULL, version varchar(16) NOT NULL,
  count bigint NOT NULL DEFAULT 0, duration_ms double precision NOT NULL DEFAULT 0,
  duration_count bigint NOT NULL DEFAULT 0, PRIMARY KEY(day,name,version));`;
 async function initialize(){await pool.query(schema);}
 async function ingest(body){
  const rows=validateAnalyticsBatch(body,{now:clock()});
  if(!rows)return {status:400,error:'invalid_events'};
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Serializes bounded admission across instances without table-locking navigation.
   await client.query('SELECT pg_advisory_xact_lock(194011733,49)');
   const size=await client.query('SELECT count(*)::int AS count FROM vano_observability.events');
   const ids=[...new Set(rows.map(row=>row.event_id))];
   const known=await client.query('SELECT count(*)::int AS count FROM vano_observability.events WHERE event_id=ANY($1::uuid[])',[ids]);
   if(size.rows[0].count+ids.length-known.rows[0].count>100000){await client.query('ROLLBACK');return {status:429,error:'capacity',retry_after:60};}
   let accepted=0;
   for(const row of rows){
    const result=await client.query(`INSERT INTO vano_observability.events
     (event_id,session_id,name,version,occurred_at,params) VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT(event_id) DO NOTHING`,[row.event_id,row.session_id,row.name,row.version,row.occurred_at,JSON.stringify(row.params)]);
    accepted+=result.rowCount;
   }
   // ACK only after durable commit. Retries reuse event IDs.
   await client.query('COMMIT');
   return {status:202,accepted,duplicates:rows.length-accepted};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 async function processPending(){
  if(busy||stopped)return;
  busy=true;
  let client;
  try{
   client=await pool.connect();await client.query('BEGIN');
   const rows=await client.query(`SELECT event_id,name,version,occurred_at,params FROM vano_observability.events
    WHERE processed_at IS NULL ORDER BY received_at LIMIT 100 FOR UPDATE SKIP LOCKED`);
   for(const row of rows.rows){
    const duration=row.params?.duration_ms;
    await client.query(`INSERT INTO vano_observability.daily(day,name,version,count,duration_ms,duration_count)
     VALUES(($1::timestamptz AT TIME ZONE 'UTC')::date,$2,$3,1,$4,$5)
     ON CONFLICT(day,name,version) DO UPDATE SET count=daily.count+1,
     duration_ms=daily.duration_ms+EXCLUDED.duration_ms,duration_count=daily.duration_count+EXCLUDED.duration_count`,
     [row.occurred_at,row.name,row.version,typeof duration==='number'?duration:0,typeof duration==='number'?1:0]);
    await client.query('UPDATE vano_observability.events SET processed_at=now() WHERE event_id=$1',[row.event_id]);
   }
   if(clock()-lastPrune>3600000){
    await client.query("DELETE FROM vano_observability.events WHERE received_at<now()-interval '30 days'");
    await client.query("DELETE FROM vano_observability.daily WHERE day<(now() AT TIME ZONE 'UTC')::date-120");
   }
   await client.query('COMMIT');
   if(clock()-lastPrune>3600000)lastPrune=clock();
   failures=0;lastFailure=null;
  }catch(error){
   if(client)await client.query('ROLLBACK').catch(()=>{});
   failures=Math.min(6,failures+1);lastFailure=new Date(clock()).toISOString();onFailure('analytics_worker_failure');
  }finally{client?.release();busy=false;}
 }
 async function snapshot(){
  const [daily,recent,health]=await Promise.all([
   pool.query("SELECT day,name,version,count,duration_ms,duration_count FROM vano_observability.daily WHERE day>=(now() AT TIME ZONE 'UTC')::date-30 ORDER BY day DESC,name"),
   pool.query('SELECT name,version,occurred_at,received_at,params FROM vano_observability.events ORDER BY received_at DESC LIMIT 100'),
   pool.query(`SELECT count(*) FILTER (WHERE processed_at IS NULL)::int AS pending,
    count(DISTINCT session_id) FILTER (WHERE received_at>now()-interval '60 seconds')::int AS active_sessions_60s,
    min(received_at) FILTER (WHERE processed_at IS NULL) AS oldest_pending FROM vano_observability.events`)
  ]);
  return {source:'vano_observability',as_of:new Date(clock()).toISOString(),
   health:{...health.rows[0],consecutive_failures:failures,last_failure:lastFailure},
   daily:daily.rows,recent:recent.rows,
   official_installs:null,official_uninstalls:null,active_users:null,retention:null,
   caveats:['Eventos consentidos de contas autenticadas; não representam todos os usuários.',
    'Sessões com evento nos últimos 60 s não equivalem a usuários ativos Firebase.',
    'Instalações oficiais exigem fonte Play; first_open é evento automático Firebase.',
    'Histórico limitado a 100 eventos; dados brutos 30 dias, agregados até 120 dias.']};
 }
 function schedule(){if(stopped)return;timer=setTimeout(async()=>{await processPending();schedule();},Math.min(60000,2000*2**failures));timer.unref?.();}
 return {initialize,ingest,processPending,snapshot,start(){if(!timer&&!stopped)schedule();},async close(){stopped=true;clearTimeout(timer);await pool.end();}};
}
