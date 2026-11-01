import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEDULED_PUBLIC_ROUTES,scheduledBenchmarkSlot,scheduledBenchmarkRecord,
  scheduledBenchmarkId,startScheduledPublicBenchmarks} from './benchmark-autopublish.mjs';
import {validatedPublicBenchmarks,publicBenchmarkPayload} from './benchmark-public-results.mjs';

const sample=scenario=>({
  source:'mapbox',routes:[
    {id:'fast',duration:32,distance:13,routingProvider:'mapbox',geometry:{type:'LineString',coordinates:[scenario.origin.coords,scenario.destination.coords]}},
    {id:'safe',duration:36,distance:14,routingProvider:'mapbox',geometry:{type:'LineString',coordinates:[scenario.origin.coords,scenario.destination.coords]}}
  ]
});
test('peak-hour slots use Sao Paulo wall time, not UTC',()=>{
  assert.deepEqual(scheduledBenchmarkSlot(new Date('2026-11-02T11:05:00Z')),
    {hour:8,minute:5,key:'20261102T08'});
  assert.deepEqual(scheduledBenchmarkSlot(new Date('2026-11-02T19:00:00Z')),
    {hour:16,minute:0,key:'20261102T16'});
});
test('auto-published VANO internal measurements are real, source-labelled and valid',()=>{
  const scenario=SCHEDULED_PUBLIC_ROUTES[0],now='2026-11-02T11:00:05.000Z';
  const record=scheduledBenchmarkRecord({scenario,result:sample(scenario),
    slot:'20261102T08',measuredAt:now,latencyMs:100});
  assert.equal(record.id,scheduledBenchmarkId('20261102T08',scenario.id));
  assert.equal(record.reference.source,'vano_fastest');
  assert.equal(record.reference.etaMin,32);
  assert.equal(record.vano.etaMin,36);
  assert.equal(record.vano.provider,'mapbox');
  assert.equal(validatedPublicBenchmarks([record]).length,1);
  const p=publicBenchmarkPayload({now:new Date(now),records:[record]});
  assert.equal(p.total,1);
  assert.equal(p.records[0].delta.etaMin,-4);
  assert.match(p.provenance,/NOT Google Maps/);
});
test('never publish demonstrations, provider failures or incomplete pairs',()=>{
  const scenario=SCHEDULED_PUBLIC_ROUTES[0],result=sample(scenario);
  const input={scenario,result,slot:'20261102T08',measuredAt:'2026-11-02T11:00:05Z',latencyMs:50};
  assert.equal(scheduledBenchmarkRecord({...input,result:{...result,source:'demonstracao'}}),null);
  assert.equal(scheduledBenchmarkRecord({...input,result:{...result,routes:[result.routes[0]]}}),null);
  assert.equal(scheduledBenchmarkRecord({...input,result:{...result,degraded:true,routes:result.routes.map(r=>({...r,engineMetadata:{degraded:true}}))}}),null);
});
test('scheduler saves four public routes exactly once per wall-clock slot',async()=>{
  const db={benchmarkResults:[]};
  let calls=0,saves=0;
  const job=startScheduledPublicBenchmarks({
    db,persist:async()=>{saves++},
    directions:async(start,end)=>{calls++;const found=SCHEDULED_PUBLIC_ROUTES.find(s=>s.origin.coords===start);return sample(found);},
    now:()=>new Date('2026-11-02T11:02:00Z'),pollMs:3600000,
    logger:{info(){},warn(msg){throw Error('Unexpected warning: '+msg)}}
  });
  try{
    await job.ready;
    assert.equal(calls,4);
    assert.equal(saves,4);
    assert.equal(db.benchmarkResults.length,4);
    await job.runCheck();
    assert.equal(calls,4);
  }finally{job.stop();}
});
test('scheduler is inert outside traffic slots',async()=>{
  let called=0;
  const job=startScheduledPublicBenchmarks({db:{benchmarkResults:[]},persist:async()=>{},
    directions:async()=>{called++},now:()=>new Date('2026-11-02T15:15:00Z'),pollMs:3600000});
  try{await job.ready;assert.equal(called,0);}finally{job.stop();}
});
