/** Run against a disposable local PostgreSQL, never the production DATABASE_URL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAnalyticsQueue} from './analytics-queue.mjs';
const connection=process.env.VANO_ANALYTICS_TEST_DATABASE_URL;
test('durable analytics: restart deduplication, exactly-once aggregation, UTC and TTL', {skip:!connection},async()=>{
 const url=new URL(connection);
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
 assert.equal(url.pathname,'/vano_analytics_test');
 const {Pool}=await import('pg');
 const pool=new Pool({connectionString:connection,max:3});
 const q=createAnalyticsQueue(pool);
 try{
  await q.initialize();
  await pool.query('TRUNCATE vano_observability.events,vano_observability.daily');
  const event={event_id:randomUUID(),session_id:randomUUID(),name:'route_calculation_completed',version:'3.1.8',
   occurred_at:new Date().toISOString(),params:{duration_ms:321,coordinates:[1,2],email:'private@example.test'}};
  assert.equal((await q.ingest({events:[event]})).accepted,1);
  const afterRestart=createAnalyticsQueue(pool);
  await afterRestart.initialize();
  assert.equal((await afterRestart.ingest({events:[event]})).duplicates,1);
  await Promise.all([q.processPending(),afterRestart.processPending()]);
  await afterRestart.processPending();
  const state=await q.snapshot();
  assert.equal(state.daily.length,1);assert.equal(Number(state.daily[0].count),1);
  assert.equal(Number(state.daily[0].duration_ms),321);assert.equal(state.health.pending,0);
  assert.deepEqual(state.recent[0].params,{duration_ms:321});
  assert.equal(state.official_installs,null);
  await pool.query("UPDATE vano_observability.events SET received_at=now()-interval '31 days'");
  await pool.query("UPDATE vano_observability.daily SET day=(now() AT TIME ZONE 'UTC')::date-121");
  const cleanup=createAnalyticsQueue(pool);
  await cleanup.processPending();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM vano_observability.events')).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM vano_observability.daily')).rows[0].n,0);
 }finally{await q.close();}
});
