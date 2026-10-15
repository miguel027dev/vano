import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteFailover} from './route-failover.mjs';
const route={routes:[{id:'fast',duration:10,distance:3,verifiedSafety:false}],source:'mapbox-v1-candidates'};
test('original success does not call fallback',async()=>{
  let calls=0;const run=createRouteFailover();
  const result=await run({original:async()=>({routes:[1],source:'original'}),alternate:async()=>{calls++;return route}});
  assert.equal(result.source,'original');assert.equal(calls,0);
});
test('offline original falls back to real candidates; repeated calls avoid slow dead original',async()=>{
  let clock=1000,originalCalls=0,alternateCalls=0,alerts=0;
  const run=createRouteFailover({clock:()=>clock,cooldownMs:45000,onFallback:()=>alerts++});
  const original=async()=>{originalCalls++;throw Error('V1 503')};
  const alternate=async()=>{alternateCalls++;return route};
  assert.equal((await run({original,alternate})).source,'mapbox-v1-candidates');
  assert.equal((await run({original,alternate})).source,'mapbox-v1-candidates');
  assert.equal(originalCalls,1);assert.equal(alternateCalls,2);assert.equal(alerts,1);
  clock+=45_001;
  assert.equal((await run({original:async()=>{originalCalls++;return{source:'original'}},alternate})).source,'original');
  assert.equal(originalCalls,2);
});
test('cannot fake success when no alternate provider exists',async()=>{
  const run=createRouteFailover();
  await assert.rejects(run({original:async()=>{throw Error('offline')}}),/sem provedor|provedor alternativo/i);
});
test('alternate empty and failed responses are rejected',async()=>{
  const run=createRouteFailover();
  await assert.rejects(run({original:async()=>{throw Error('offline')},alternate:async()=>({routes:[]})}),/Não foi possível calcular/);
  await assert.rejects(run({original:async()=>({routes:[{}]}),alternate:async()=>{throw Error('broken')}}).then(()=>{throw Error('unexpected alternate call')}),/unexpected alternate/);
});
