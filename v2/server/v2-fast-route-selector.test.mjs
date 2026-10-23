import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseV2FastCorridor} from './v2-fast-route-selector.mjs';

const python=()=>({source:'vano-original-python',routes:[
 {id:'safe',duration:25,durationSeconds:1500,verifiedSafety:true,routingProvider:'python',geometry:{type:'LineString',coordinates:[[0,0],[1,0]]}},
 {id:'fast',duration:20,durationSeconds:1200,routingProvider:'python'},
 {id:'smart',duration:22,durationSeconds:1320,routingProvider:'python'}
 ],safetyMessage:'Original safety evidence'});
const mapbox=()=>({source:'mapbox-v1-candidates',
 routes:[{id:'safe',durationSeconds:1000,verifiedSafety:false},
 {id:'fast',duration:18,durationSeconds:1080,routingProfile:'driving-traffic',routingProvider:'mapbox',microStrategy:'bottleneck-corridor-500m'}],
 candidateEngine:{verifiedCorridorAvoidance:true,bottleneckProbes:3,initialCandidates:2}});

test('V2 replaces ONLY Fast with verified Mapbox alternative, preserves Python Safe',async()=>{
 const result=await chooseV2FastCorridor({original:async()=>python(),mapbox:async()=>mapbox()});
 assert.equal(result.source,'vano-v2-corridor-fast-python-safe');
 assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,1080);
 assert.equal(result.routes.find(r=>r.id==='safe').verifiedSafety,true);
 assert.equal(result.routes.find(r=>r.id==='safe').routingProvider,'python');
 assert.equal(result.routes.find(r=>r.id==='smart').routingProvider,'python');
 assert.equal(result.fastEngineStatus,'500m-corridor-avoided');
 assert.equal(result.candidateEngine.bottleneckProbes,3);
});
test('Python faster: V2 executes probe engine but keeps the existing Fast route',async()=>{
 const result=await chooseV2FastCorridor({original:async()=>python(),
  mapbox:async()=>({...mapbox(),routes:[{id:'fast',durationSeconds:1280,routingProfile:'driving-traffic'}]})});
 assert.equal(result.source,'vano-original-python');
 assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,1200);
 assert.equal(result.fastEngineStatus,'corridor-checked-python-faster');
 assert.ok(result.fastCandidateEngine);
});
test('no false claims from Mapbox without traffic profile',async()=>{
 const result=await chooseV2FastCorridor({original:async()=>python(),
  mapbox:async()=>({...mapbox(),routes:[{id:'fast',durationSeconds:800,routingProfile:'driving'}]})});
 assert.equal(result.routes.find(r=>r.id==='fast').routingProvider,'python');
 assert.equal(result.fastEngineStatus,'corridor-unverified');
});
test('Python outage falls back to a real traffic-aware Mapbox route',async()=>{
 const result=await chooseV2FastCorridor({original:async()=>{throw Error('offline');},mapbox:async()=>mapbox()});
 assert.equal(result.source,'mapbox-v1-candidates');
 assert.equal(result.fastRouteEngine,'v2-500m-traffic-corridor');
});
test('Mapbox outage cannot erase Python Safe or Fast route',async()=>{
 const result=await chooseV2FastCorridor({original:async()=>python(),mapbox:async()=>{throw Error('down');}});
 assert.equal(result.source,'vano-original-python');
 assert.equal(result.fastEngineStatus,'corridor-provider-unavailable');
});
test('both providers failing returns error instead of fictional route',async()=>{
 await assert.rejects(()=>chooseV2FastCorridor({
  original:async()=>{throw Error('python down');},mapbox:async()=>{throw Error('mapbox down');}
 }),/python down/);
});
test('V2 UI opts in; backend protects opt-in and preserves reroutes and V1',()=>{
 const page=readFileSync(new URL('../src/pages/MapPage.jsx',import.meta.url),'utf8');
 const index=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(page,/routeOptions:\{v2FastCorridor:location\.pathname==='\/v2'\}/);
 assert.match(index,/provided\.v2FastCorridor===true&&currentUser\(req\)\?\.isAdmin===true/);
 assert.match(index,/options\.v2FastCorridor===true/);
 assert.match(index,/return chooseV2FastCorridor\(\{/);
 assert.match(index,/provided\.reroute!==true/);
 assert.match(index,/return resilientOriginalRouting\(\{/);
});
