import test from 'node:test';
import assert from 'node:assert/strict';
import {mapboxDirectionsUrl,calculateMapboxV1Candidates} from './mapbox-v1-fallback.mjs';

const origin=[-46.68,-23.58],destination=[-46.669,-23.58];
const coords=Array.from({length:12},(_,i)=>[-46.68+i*.001,-23.58]);
const makeRoute=(duration,shift=0,congestion=80)=>({
  duration,distance:1300,
  geometry:{type:'LineString',coordinates:coords.map(([lon,lat],i)=>[lon,lat+(i>0&&i<11?shift:0)])},
  legs:[{steps:[{maneuver:{instruction:'Continue em frente',location:origin,modifier:'straight'},distance:1300,name:'Rua Exemplo'}],
    annotation:{distance:Array(11).fill(118),congestion_numeric:Array(11).fill(congestion)}}]
});
const response=routes=>({ok:true,json:async()=>({code:'Ok',routes})});

test('Mapbox V1-compatible request preserves traffic annotations, original heading and preferences',()=>{
  const u=mapboxDirectionsUrl(origin,destination,'test-token','pt-BR','moto',{bearing:86,speed:4},
    {avoidTolls:true,reroute:true},{points:[[-46.676,-23.58]],alternatives:false});
  assert.match(u.pathname,/mapbox\/driving-traffic/);
  assert.equal(u.searchParams.get('alternatives'),'false');
  assert.match(u.searchParams.get('annotations'),/congestion_numeric/);
  assert.equal(u.searchParams.get('bearings'),'86,70;');
  assert.ok(u.searchParams.get('exclude').includes('unpaved'));
  assert.ok(u.searchParams.get('exclude').includes('toll'));
  assert.ok(u.searchParams.get('exclude').includes('point('));
  assert.equal(u.searchParams.get('continue_straight'),'true');
});
test('base, adaptive and micro-route probes rank by provider ETA, never fabricated safety',async()=>{
  const calls=[];let probes=0;
  const fetcher=async input=>{
    const u=new URL(input);calls.push(u);
    if(!u.searchParams.get('exclude'))return response([makeRoute(720,0),makeRoute(810,.004)]);
    probes++;
    return response([makeRoute(probes<=2?695-probes*12:608-probes,.006+probes*.001)]);
  };
  const result=await calculateMapboxV1Candidates(origin,destination,'carro',{},'pt-BR',
    {adaptive:true,variantBudget:4},'test-token',fetcher);
  assert.equal(result.source,'mapbox-v1-candidates');
  assert.equal(result.routes.length,2);
  assert.equal(result.routes[0].id,'safe');
  assert.equal(result.routes[1].id,'fast');
  assert.equal(result.routes[0].verifiedSafety,false);
  assert.equal(result.routes[1].verifiedSafety,false);
  assert.ok(result.routes[1].duration<=result.routes[0].duration);
  assert.ok(result.candidateEngine.candidateCount>=2);
  assert.equal(result.candidateEngine.pipeline[0],'traffic-alternatives');
  assert.equal(calls[0].searchParams.get('alternatives'),'true');
  assert.ok(calls.slice(1).every(u=>u.searchParams.get('alternatives')==='false'));
  assert.ok(probes>=2);
  // Calls for a shared route must not repeat provider exploration during the live-traffic TTL.
  const second=await calculateMapboxV1Candidates(origin,destination,'carro',{},'pt-BR',
    {adaptive:true,variantBudget:4},'test-token',fetcher);
  assert.equal(calls.length,1+probes);
  second.routes[1].proof='not-shared';
  assert.equal(result.routes[1].proof,undefined);
});
test('uncongested trips do not spend Mapbox quota on micro-route probes',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return response([makeRoute(400,0,10),makeRoute(430,.003,10)]);};
  const result=await calculateMapboxV1Candidates([-46.681,-23.58],destination,'carro',{},'pt-BR',
    {adaptive:true,variantBudget:8},'test-token',fetcher);
  assert.equal(calls,1);
  assert.equal(result.candidateEngine.additionalRequests,0);
  assert.equal(result.microRoutingActive,false);
});
test('missing traffic mode falls back to driving without pretending to have congestion',async()=>{
  const calls=[];
  const fetcher=async input=>{
    const u=new URL(input);calls.push(u);
    if(u.pathname.includes('/driving-traffic/'))throw Error('Traffic provider unavailable');
    return response([makeRoute(500,0,0)]);
  };
  const result=await calculateMapboxV1Candidates(origin,[-46.669,-23.581],'moto',{},'pt-BR',
    {adaptive:false},'test-token',fetcher);
  assert.equal(result.candidateEngine.provider,'driving');
  assert.equal(result.candidateEngine.additionalRequests,0);
});

test('exact Mapbox ETA and step seconds survive into navigation, with traffic origin explicitly labeled',async()=>{
 const r=makeRoute(1670,0,40);r.legs[0].steps[0].duration=1670;
 const responseData=await calculateMapboxV1Candidates([-46.688,-23.58],[-46.669,-23.58],
   'carro',{},'pt-BR',{adaptive:false,skipCandidateProbes:true},'test-token',async()=>response([r]));
 const selected=responseData.routes.find(x=>x.id==='fast');
 assert.equal(selected.durationSeconds,1670);
 assert.equal(selected.duration,28);
 assert.equal(selected.steps[0].duration,1670);
 assert.equal(selected.trafficDataStatus,'traffic-aware');
 assert.equal(selected.routingProfile,'driving-traffic');
 assert.ok(Number.isFinite(selected.etaUpdatedAt));
});
