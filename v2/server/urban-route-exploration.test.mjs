import test from 'node:test';
import assert from 'node:assert/strict';
import {blockExploreSpecs,validExploredVariant,chooseStableFastRoute,hasProviderRouteViolation} from './urban-route-exploration.mjs';
import {calculateMapboxV1Candidates} from './mapbox-v1-fallback.mjs';
const coords=Array.from({length:90},(_,i)=>[-46.72+i*.001,-23.585]);
const mk=(seconds=1300,shift=0)=>({
 duration:seconds,distance:9150,
 geometry:{type:'LineString',coordinates:coords.map(([x,y],i)=>[x,y+(i>0&&i<89?shift:0)])},
 legs:[{steps:[{distance:9150,duration:seconds,name:'Avenida Principal',
  maneuver:{instruction:'Continue em frente',location:coords[0],modifier:'straight'}}],
 annotation:{distance:Array(89).fill(9150/89),duration:Array(89).fill(seconds/89),
  congestion_numeric:Array(89).fill(8)}}]
});
const reply=routes=>({ok:true,json:async()=>({code:'Ok',routes})});
test('block exploration samples distinct provider route geometry even on green traffic',()=>{
 const proposals=blockExploreSpecs([mk()],5);
 assert.ok(proposals.length>=3);
 assert.ok(proposals.length<=5);
 for(const spec of proposals){
  assert.equal(spec.kind,'urban-corridor-exclusion');
  assert.equal(spec.points.length,1);
  assert.ok(spec.points[0][0]>-46.72&&spec.points[0][0]<-46.631);
 }
 assert.deepEqual(blockExploreSpecs([mk(1300)],0),[]);
});
test('never accept same geometry, excessive detour or provider restriction violation',()=>{
 const base=mk();
 assert.equal(validExploredVariant(mk(1100),base,[base]),false);
 assert.equal(validExploredVariant(mk(1100,.0024),base,[base]),true);
 assert.equal(validExploredVariant(mk(1100,.0024),base,[mk(1200,.0024)]),false);
 assert.equal(validExploredVariant(mk(3000,.003),base,[base]),false);
 const denied=mk(1100,.003);
 denied.legs[0].notifications=[{type:'violation',subtype:'pointExclusion'}];
 assert.equal(validExploredVariant(denied,base,[base]),false);
});
test('traffic-low routes still probe city blocks and preserve genuine legal provider alternative',async()=>{
 const origin=[-46.72011,-23.585],dest=[-46.63011,-23.585];
 let probes=0,calls=0;
 const fetcher=async url=>{
  calls++;
  const u=new URL(url);
  if(!u.searchParams.has('exclude'))return reply([mk(1300)]);
  probes++;
  const y=probes===1?.0024:probes===2?-.0025:.004;
  return reply([mk(1300+probes*32,y)]);
 };
 const data=await calculateMapboxV1Candidates(origin,dest,'carro',{},'pt-BR',
  {adaptive:true,variantBudget:4,routeDiagnostics:true},'test-token',fetcher);
 assert.equal(data.candidateEngine.provider,'driving-traffic');
 assert.equal(data.candidateEngine.urbanProbes>0,true);
 assert.ok(data.candidateEngine.additionalRequests<=20);
 assert.equal(data.candidateEngine.additionalRequests,20);
 assert.equal(data.candidateEngine.urbanProbes,20);
 assert.deepEqual(data.candidateEngine.searchZones,['inicio','meio','fim']);
 assert.equal(calls,1+data.candidateEngine.additionalRequests);
 assert.equal(data.candidateEngine.candidateCount>1,true);
 assert.ok(data.candidateEngine.urbanAccepted>0);
 assert.equal(data.candidateEngine.pipeline.includes('lateral-branches-and-paired-blocks'),true);
 assert.equal(data.routes.some(r=>r.verifiedSafety===true),false);
 assert.ok(data.routes.find(r=>r.id==='fast').durationSeconds<=data.routes.find(r=>r.id==='safe').durationSeconds);
});
test('reroute or explicit no-adaptive never spends additional block exploration requests',async()=>{
 let calls=0;
 const origin=[-46.71055,-23.585],dest=[-46.62055,-23.585];
 const fetcher=async()=>{calls++;return reply([mk()]);};
 const route=await calculateMapboxV1Candidates(origin,dest,'carro',{},'pt-BR',
  {adaptive:false},'test-token',fetcher);
 assert.equal(route.candidateEngine.urbanProbes,0);
 assert.equal(calls,1);
 const reroute=await calculateMapboxV1Candidates(origin,dest,'carro',{},'pt-BR',
  {adaptive:true,reroute:true},'test-token',fetcher);
 assert.equal(reroute.candidateEngine.urbanProbes,0);
 assert.equal(calls,2);
});

test('20-probe planning has first, middle, last blocks plus provider-lateral second wave',()=>{
 const base=mk(1300),side=mk(1280,.0028);
 const phase1=blockExploreSpecs([base],10,{phase:1});
 assert.equal(phase1.length,10);
 const zones=new Set(phase1.map(p=>p.zone));
 assert.deepEqual([...zones].sort(),['fim','inicio','meio']);
 const phase2=blockExploreSpecs([base,side],10,{phase:2,seen:phase1});
 assert.equal(phase2.length,10);
 assert.ok(phase2.some(x=>x.kind==='two-block-corridor'||x.routeNumber===1));
 const unique=new Set([...phase1,...phase2].map(x=>x.points.map(p=>p.join(',')).join('|')));
 assert.equal(unique.size,20);
});
test('tiny ETA advantage is not allowed to add 500m to a stable route',async()=>{
 const from=[-46.70263,-23.585],to=[-46.61363,-23.585];
 const short=mk(1100),long=mk(1099);
 long.distance=9650;
 long.geometry.coordinates=long.geometry.coordinates.map(([x,y],i)=>[x,y+(i>0&&i<89?.0025:0)]);
 const data=await calculateMapboxV1Candidates(from,to,'carro',{},'pt-BR',
  {adaptive:false,skipCandidateProbes:true},'test-token',async()=>reply([long,short]));
 const selected=data.routes.find(r=>r.id==='fast');
 assert.equal(selected.distance,9.2);
 assert.equal(selected.durationSeconds,1100);
 assert.equal(data.candidateEngine.minimumSwitchSavingsSeconds,5);
});

test('fastest route rejects Mapbox-declared access violations without guessed traffic',()=>{
 const baseline=mk(1250);
 const dubious=mk(790,.003);
 dubious.legs[0].notifications=[{type:'violation',subtype:'restricted-road'}];
 const legal=mk(1080,-.003);
 assert.equal(hasProviderRouteViolation(dubious),true);
 const selected=chooseStableFastRoute([baseline,dubious,legal],baseline);
 assert.equal(selected,legal);
 assert.equal(validExploredVariant(dubious,baseline,[baseline]),false);
 assert.equal(hasProviderRouteViolation(legal),false);
});

test('fast route cannot be 27 seconds slower solely to save distance',()=>{
 const fastest=mk(1000,.0012);fastest.distance=9200;
 const longerTime=mk(1027,.003);longerTime.distance=8000;
 assert.strictEqual(chooseStableFastRoute([longerTime,fastest]),fastest);
});
test('fast route honors only five-second technical tie if 450m shorter',()=>{
 const best=mk(1000,.001);best.distance=9000;
 const near=mk(1004,.002);near.distance=8480;
 const out=mk(1006,.003);out.distance=7800;
 assert.strictEqual(chooseStableFastRoute([best,near]),near);
 assert.strictEqual(chooseStableFastRoute([best,out]),best);
});
