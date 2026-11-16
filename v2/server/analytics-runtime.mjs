import {Pool} from 'pg';
import {createAnalyticsQueue} from './analytics-queue.mjs';
export function startAnalyticsRuntime(env=process.env){
 if(env.VANO_ANALYTICS_ENABLED!=='1')return {enabled:false,ready:Promise.resolve(null)};
 const ready=(async()=>{
  const raw=env.DATABASE_URL?.trim().replace(/^["']|["']$/g,'').replace(/^postgres(?:ql)?\+[a-z0-9_-]+:\/\//i,'postgresql://');
  const url=new URL(raw);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('analytics_database_required');
  if(url.searchParams.get('sslmode')==='require'&&!url.searchParams.has('uselibpqcompat'))url.searchParams.set('uselibpqcompat','true');
  const pool=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:5000,
   query_timeout:5000,idleTimeoutMillis:10000,application_name:'vano-observability'});
  pool.on('error',()=>console.error('VANO observability: database unavailable.'));
  const queue=createAnalyticsQueue(pool,{onFailure:code=>console.error('VANO observability:',code)});
  try{await queue.initialize();queue.start();return queue;}
  catch(error){await pool.end().catch(()=>{});throw error;}
 })().catch(()=>{console.error('VANO observability: initialization failed; collection disabled.');return null;});
 return {enabled:true,ready};
}
