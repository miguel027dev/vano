import test from 'node:test';
import assert from 'node:assert/strict';
import {dryRunSafeRouting} from './safe-routing/adapter.mjs';
const input={routes:[
 {id:'A',duration:10,geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},
 {id:'B',duration:12,geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}}
],source:'mapbox'};
test('unconfigured evidence provider keeps Mapbox response unchanged',async()=>{
 const r=await dryRunSafeRouting(input);
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'not-configured');
});
test('data service timeout keeps provider route',async()=>{
 const r=await dryRunSafeRouting(input,{timeoutMs:15,evidenceProvider:async()=>new Promise(()=>{})});
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'evidence-unavailable');
});
test('evidence failure is isolated and does not throw',async()=>{
 const r=await dryRunSafeRouting(input,{evidenceProvider:async()=>{throw Error('database unavailable')}});
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'evidence-unavailable');
});
