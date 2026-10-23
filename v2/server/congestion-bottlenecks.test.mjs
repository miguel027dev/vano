import test from 'node:test';
import assert from 'node:assert/strict';
import {bottleneckDetourSpecs,trafficCorridors,candidateUsesForbiddenCorridor,hasTrafficEvidence} from './congestion-bottlenecks.mjs';
import {calculateMapboxV1Candidates} from './mapbox-v1-fallback.mjs';
import {meters} from './v1-candidates.mjs';

const coords=Array.from({length:70},(_,i)=>[-46.72+i*.0007,-23.58]);
const origin=coords[0],destination=coords.at(-1);
function route(seconds,{traffic=true,shift=0,violation=false}={}){
 const levels=Array.from({length:coords.length-1},(_,i)=>traffic&&i>=25&&i<46?92:8);
 const shifted=coords.map(([lon,lat],i)=>[lon,lat+(i>0&&i<69?shift:0)]);
 return {duration:seconds,distance:4900,geometry:{type:'LineString',coordinates:shifted},
  legs:[{annotation:{distance:levels.map(()=>70),congestion_numeric:levels},
    steps:[],...(violation?{notifications:[{type:'violation',subtype:'access'}]}:{})}]};
}
const response=routes=>({ok:true,json:async()=>({code:'Ok',routes})});
const pointCount=url=>(url.searchParams.get('exclude')||'').split('point(').length-1;

test('defines 500m before and after the real congested stretch, not its midpoint',()=>{
 const corridor=trafficCorridors(route(2000))[0];
 assert.ok(corridor,'known heavy traffic must produce a guarded stretch');
 assert.equal(corridor.marginMeters,500);
 assert.equal(corridor.startMeters,1750);
 assert.equal(corridor.endMeters,3220);
 assert.equal(corridor.forbiddenStartMeters,1250);
 assert.equal(corridor.forbiddenEndMeters,3720);
 assert.ok(corridor.guard.length>=5);
 assert.ok(meters(corridor.startPoint,origin)>1100);
 assert.ok(meters(corridor.endPoint,destination)>1000);
 const specs=bottleneckDetourSpecs([route(2000)],8);
 assert.ok(specs.length>=2&&specs.length<=3);
 assert.ok(specs.every(x=>x.kind==='bottleneck-corridor-500m'));
 assert.ok(specs.every(x=>x.marginBeforeMeters===500&&x.marginAfterMeters===500));
 assert.ok(specs.every(x=>x.points.length>=4));
 assert.equal(new Set(specs.map(x=>JSON.stringify(x.points))).size,specs.length);
});

test('rejects a shorter detour that still passes through ANY part of the forbidden corridor',()=>{
 const jam=route(2000),corridor=trafficCorridors(jam)[0];
 assert.equal(candidateUsesForbiddenCorridor(jam,corridor),true);
 assert.equal(candidateUsesForbiddenCorridor(route(1700,{shift:.003,traffic:false}),corridor),false);
 const shiftedBack=route(1600,{traffic:false});
 assert.equal(candidateUsesForbiddenCorridor(shiftedBack,corridor),true);
});

test('missing traffic evidence, weak jams and terminal-only jams cannot assert a 500m exclusion',()=>{
 assert.equal(hasTrafficEvidence(route(2000)),true);
 assert.deepEqual(trafficCorridors(route(2000,{traffic:false})),[]);
 const unknown=route(2000);
 unknown.legs[0].annotation={distance:Array(69).fill(70)};
 assert.equal(hasTrafficEvidence(unknown),false);
 assert.deepEqual(trafficCorridors(unknown),[]);
 const partiallyKnown=route(2000,{traffic:false});
 partiallyKnown.legs[0].annotation.congestion_numeric=partiallyKnown.legs[0].annotation.congestion_numeric
  .map((score,i)=>i<15?score:null);
 assert.equal(hasTrafficEvidence(partiallyKnown),false,'sparse samples cannot be called traffic-free');
 const terminalHeavy=route(2000,{traffic:false});
 terminalHeavy.legs[0].annotation.congestion_numeric=terminalHeavy.legs[0].annotation.congestion_numeric
  .map((v,i)=>i<8?94:8);
 assert.ok(trafficCorridors(terminalHeavy,{marginMeters:0}).length>0,
  'candidate validation also checks jams near origin');
 const weak=route(2000);
 weak.legs[0].annotation.congestion_numeric=weak.legs[0].annotation.congestion_numeric
  .map((v,i)=>i===30?95:5);
 assert.deepEqual(trafficCorridors(weak),[]);
 const terminal=route(2000);
 terminal.legs[0].annotation.congestion_numeric=terminal.legs[0].annotation.congestion_numeric
  .map((v,i)=>i<7?95:5);
 assert.deepEqual(trafficCorridors(terminal),[],'never ban the user origin');
});

test('gets real A-to-B candidates first; only a traffic-free faster full detour can win',async()=>{
 const urls=[];
 const fetcher=async input=>{
  const url=new URL(input);urls.push(url);
  if(!url.searchParams.has('exclude'))return response([route(2000)]);
  if(pointCount(url)>=4)return response([route(1740,{shift:.003,traffic:false})]);
  return response([route(2000)]);
 };
 const result=await calculateMapboxV1Candidates(origin,destination,'carro',{},'pt-BR',
  {adaptive:true,bottleneckRouting:true,variantBudget:8},'test-token-500m',fetcher);
 assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,1740);
 assert.equal(result.routes.find(r=>r.id==='safe').durationSeconds,2000);
 assert.ok(result.candidateEngine.bottleneckProbes>0);
 assert.ok(result.candidateEngine.bottleneckAccepted>0);
 assert.ok(result.candidateEngine.bottleneckImproved);
 assert.ok(result.candidateEngine.additionalRequests<=20);
 assert.equal(result.candidateEngine.additionalRequests,urls.length-1);
 assert.ok(urls.some(u=>pointCount(u)>=4));
 assert.ok(result.candidateEngine.pipeline.includes('five-initial-provider-candidates'));
 assert.ok(result.candidateEngine.pipeline.includes('500m-before-after-corridor-validation'));
 assert.equal(result.candidateEngine.verifiedCorridorAvoidance,true);
});

test('ignores Mapbox point exclusions only if verified route actually avoids the 500m zone',async()=>{
 const result=await calculateMapboxV1Candidates(
  [-46.71991,-23.58001],[-46.67161,-23.58001],'carro',{},'pt-BR',
  {adaptive:true,bottleneckRouting:true,variantBudget:4},'test-token-500m',async input=>{
   const u=new URL(input);
   if(!u.searchParams.has('exclude'))return response([route(2100)]);
   // The provider pretends to accept point exclusions but returns the SAME jam.
   return response([route(1600)]);
  });
 assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,2100);
 assert.equal(result.candidateEngine.bottleneckAccepted,0);
 assert.equal(result.candidateEngine.verifiedCorridorAvoidance,false);
});

test('provider violations/failures preserve legal original route',async()=>{
 let calls=0;
 const result=await calculateMapboxV1Candidates(
  [-46.71993,-23.58001],[-46.67167,-23.58001],'carro',{},'pt-BR',
  {adaptive:true,bottleneckRouting:true,variantBudget:4},'test-token-500m',async input=>{
   calls++;
   if(!new URL(input).searchParams.has('exclude'))return response([route(2100)]);
   if(calls%2===0)return response([route(1400,{shift:.003,traffic:false,violation:true})]);
   throw Error('Provider unavailable');
  });
 assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,2100);
 assert.equal(result.candidateEngine.bottleneckImproved,false);
 assert.ok(calls<=21);
});

test('live reroute never launches extra requests',async()=>{
 let calls=0;
 const data=await calculateMapboxV1Candidates(
  [-46.71983,-23.5801],[-46.67153,-23.5801],'carro',{},'pt-BR',
  {reroute:true,adaptive:false,bottleneckRouting:true},'test-token-500m',async()=>{
    calls++;return response([route(2100)]);
  });
 assert.equal(calls,1);
 assert.equal(data.candidateEngine.bottleneckProbes,0);
});
