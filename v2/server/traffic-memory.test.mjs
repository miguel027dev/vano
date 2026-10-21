import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTrafficMemory,assessTrafficMemory,createTrafficMemoryReader} from './traffic-memory.mjs';

const now=Date.parse('2026-10-21T22:00:00.000Z'); // Wednesday, 19:00 Sao Paulo.
const a=[-46.73,-23.62],b=[-46.729,-23.62],far=[-46.74,-23.61];
const observation=(overrides={})=>({
 id:'segment-test-001',coordinates:[a,b],weekday:3,quarter:76,
 speedKmh:4,freeFlowKmh:45,samples:180,
 lastObservedAt:new Date(now-86400000).toISOString(),
 source:'sptrans-olhovivo',licenseVerified:true,...overrides
});
const route=(id,coords,seconds)=>({
 id,geometry:{type:'LineString',coordinates:coords},
 durationSeconds:seconds,duration:Math.round(seconds/60),distance:1,
 trafficDataStatus:'degraded',verifiedSafety:false
});
const result=()=>({source:'mapbox-v1-candidates',
 routes:[route('safe',[a,b],700),route('fast',[a,b],600)],
 safeCandidatePool:[route('candidate-1',[far,[-46.739,-23.61]],625)]});
test('only licensed, recent, sufficiently sampled, SP direction observations enter index',()=>{
 const samples=[observation(),observation({id:'old',lastObservedAt:new Date(now-90*86400000).toISOString()}),
  observation({id:'unlicensed',licenseVerified:false}),
  observation({id:'tiny',samples:2}),observation({id:'reverse',coordinates:[b,a]})];
 const memory=buildTrafficMemory({records:samples},{now});
 assert.equal(memory.recordCount,2);
 assert.equal(memory.sourceCount,1);
 assert.equal(buildTrafficMemory({records:[observation({weekday:9})]},{now}).recordCount,0);
 assert.throws(()=>buildTrafficMemory({records:Array(20001).fill(observation())},{now}),/too-large/);
});
test('off/shadow never change the selected route or provider ETA',()=>{
 const memory=buildTrafficMemory({records:[observation()]},{now});
 const input=result();
 assert.strictEqual(assessTrafficMemory(input,memory,{mode:'off',now,departAt:now}),input);
 const scored=assessTrafficMemory(input,memory,{mode:'shadow',now,departAt:now});
 assert.equal(scored.routes[0].durationSeconds,700);
 assert.equal(scored.routes[1].durationSeconds,600);
 assert.equal(scored.trafficMemory.mode,'shadow');
 assert.equal(scored.trafficMemory.selectedAlternative,false);
});
test('opt-in ranking may choose provider-validated side road without changing fastest ETA',()=>{
 const memory=buildTrafficMemory({records:[observation()]},{now});
 const scored=assessTrafficMemory(result(),memory,{mode:'on',now,departAt:now});
 assert.equal(scored.routes[0].id,'safe');
 assert.equal(scored.routes[0].durationSeconds,625);
 assert.equal(scored.routes[0].verifiedSafety,false);
 assert.equal(scored.routes[1].durationSeconds,600);
 assert.equal(scored.trafficMemory.selectedAlternative,true);
});
test('reverse traffic direction, near-term Mapbox traffic and stale data never add guessed delay',()=>{
 const reverse=buildTrafficMemory({records:[observation({coordinates:[b,a]})]},{now});
 const backwards=assessTrafficMemory(result(),reverse,{mode:'on',now,departAt:now});
 assert.equal(backwards.trafficMemory.selectedAlternative,false);
 const recent=buildTrafficMemory({records:[observation()]},{now});
 const live=result();
 for(const r of [...live.routes,...live.safeCandidatePool])r.trafficDataStatus='traffic-aware';
 const score=assessTrafficMemory(live,recent,{mode:'on',now,departAt:now});
 assert.equal(score.trafficMemory.selectedAlternative,false);
 const outdated=buildTrafficMemory({records:[observation({lastObservedAt:new Date(now-61*86400000).toISOString()})]},{now});
 assert.equal(outdated.recordCount,0);
 assert.equal(assessTrafficMemory(result(),outdated,{mode:'on',now,departAt:now}).trafficMemory,undefined);
});
test('empty snapshot reader degrades without I/O blocking /api/route',()=>{
 const reader=createTrafficMemoryReader('');
 assert.equal(reader.get().recordCount,0);
});
test('V2 route handler is gated and does not connect historical memory to V1',()=>{
 const index=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(index,/VANO_TRAFFIC_MEMORY_MODE/);
 assert.match(index,/createTrafficMemoryReader/);
 assert.match(index,/assessTrafficMemory/);
 assert.match(index,/VANO_TRAFFIC_MEMORY_FILE/);
});
