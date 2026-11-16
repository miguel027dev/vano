import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateAnalyticsBatch} from './analytics-events.mjs';
const now=Date.parse('2026-11-16T12:00:00.000Z');
const event=()=>({event_id:randomUUID(),session_id:randomUUID(),name:'route_calculation_completed',version:'3.1.8',occurred_at:new Date(now).toISOString(),params:{duration_ms:342}});
test('never retains identity, GPS, exception messages or URLs',()=>{
 const source=event();source.user_id='secret';source.coords=[-46,-23];
 Object.assign(source.params,{url:'https://private/?token=x',message:'address',name:'person',email:'person@example.test'});
 const result=validateAnalyticsBatch({events:[source]},{now});
 assert.deepEqual(result[0].params,{duration_ms:342});
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal('coords' in result[0],false);
});
test('rejects spoofed automatic events, skewed timestamps and unbounded dimensions',()=>{
 for(const bad of [{name:'first_open'},{name:'session_start'},{version:'random-cardinality'},
  {occurred_at:'2026-11-16T12:00:00-03:00'},{occurred_at:'2026-01-01T00:00:00.000Z'},
  {occurred_at:'2027-01-01T00:00:00.000Z'},{event_id:'../path'}]){
  assert.equal(validateAnalyticsBatch({events:[{...event(),...bad}]},{now}),null);
 }
 assert.equal(validateAnalyticsBatch({events:Array.from({length:21},event)},{now}),null);
 assert.equal(validateAnalyticsBatch({events:[]},{now}),null);
});
test('rejects impossible numbers and arbitrary error codes without losing valid counters',()=>{
 const source=event();source.params={duration_ms:Infinity,status_code:600,error_code:'private exception',vehicle:'moto'};
 assert.deepEqual(validateAnalyticsBatch({events:[source]},{now})[0].params,{vehicle:'moto'});
});
