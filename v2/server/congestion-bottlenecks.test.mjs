import test from 'node:test';
import assert from 'node:assert/strict';
import {bottleneckDetourSpecs} from './congestion-bottlenecks.mjs';
import {calculateMapboxV1Candidates} from './mapbox-v1-fallback.mjs';

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

test('finds upstream 1km/500m/300m exclusions before a measured long traffic jam',()=>{
  const probes=bottleneckDetourSpecs([route(2000)],8);
  assert.ok(probes.length>=3&&probes.length<=4);
  assert.ok(probes.every(p=>p.kind==='bottleneck-early-escape'));
  const first=probes[0];
  assert.ok(first.leadMeters>=900);
  assert.ok(first.points[0][0]<coords[25][0]);
  assert.ok(first.points[1][0]>coords[25][0]);
  assert.ok(first.bottleneckEndMeters-first.bottleneckStartMeters>1000);
  assert.equal(new Set(probes.map(p=>JSON.stringify(p.points))).size,probes.length);
});

test('does not invent bottlenecks when traffic is green or evidence is missing',()=>{
  assert.deepEqual(bottleneckDetourSpecs([route(2000,{traffic:false})]),[]);
  const without=route(2000);
  without.legs[0].annotation={distance:Array(69).fill(70)};
  assert.deepEqual(bottleneckDetourSpecs([without]),[]);
  const veryShort=route(2000);
  veryShort.legs[0].annotation.congestion_numeric=veryShort.legs[0].annotation.congestion_numeric
    .map((v,i)=>i===30?95:5);
  assert.deepEqual(bottleneckDetourSpecs([veryShort]),[]);
});

test('only valid provider full routes with better ETA become V2 fast',async()=>{
  const urls=[];
  const fetcher=async input=>{
    const url=new URL(input);urls.push(url);
    if(!url.searchParams.has('exclude'))return response([route(2000)]);
    return response([route(1740,{shift:.003})]);
  };
  const result=await calculateMapboxV1Candidates(origin,destination,'carro',{},'pt-BR',
    {adaptive:true,bottleneckRouting:true,variantBudget:8},'test-token',fetcher);
  assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,1740);
  assert.equal(result.routes.find(r=>r.id==='safe').durationSeconds,2000);
  assert.ok(result.candidateEngine.bottleneckProbes>0);
  assert.ok(result.candidateEngine.bottleneckImproved);
  assert.ok(result.candidateEngine.additionalRequests<=4);
  assert.equal(result.candidateEngine.additionalRequests,urls.length-1);
  assert.ok(urls.slice(1).every(u=>u.searchParams.get('exclude')?.includes('point(')));
  assert.ok(result.candidateEngine.pipeline.includes('priority-bottleneck-detours'));
});

test('rejects provider access violations and preserves baseline on probe errors',async()=>{
  let calls=0;
  const result=await calculateMapboxV1Candidates(
    [-46.71993,-23.58001],[-46.67167,-23.58001],'carro',{},'pt-BR',
    {adaptive:true,bottleneckRouting:true,variantBudget:4},'test-token',async input=>{
      calls++;
      if(!new URL(input).searchParams.has('exclude'))return response([route(2100)]);
      if(calls%2===0)return response([route(1400,{shift:.003,violation:true})]);
      throw Error('Provider unavailable');
    });
  assert.equal(result.routes.find(r=>r.id==='fast').durationSeconds,2100);
  assert.equal(result.candidateEngine.bottleneckImproved,false);
  assert.ok(calls<=21);
});

test('live reroute does not initiate extra bottleneck probes',async()=>{
  let calls=0;
  const data=await calculateMapboxV1Candidates(
    [-46.71983,-23.5801],[-46.67153,-23.5801],'carro',{},'pt-BR',
    {reroute:true,adaptive:false,bottleneckRouting:true},'test-token',async()=>{
      calls++;return response([route(2100)]);
    });
  assert.equal(calls,1);
  assert.equal(data.candidateEngine.bottleneckProbes,0);
});
