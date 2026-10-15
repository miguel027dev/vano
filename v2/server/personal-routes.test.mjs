import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretRouteStyle,discoverRoutine} from './personal-routes.mjs';
import {calculateMapboxViaStop} from './mapbox-v1-fallback.mjs';

test('free text changes real supported routing flags',()=>{
  const p=interpretRouteStyle('Quero chegar mais rápido, evitar pedágios e estrada de terra');
  assert.equal(p.preferredRoute,'fast');
  assert.equal(p.avoidTolls,true);
  assert.equal(p.avoidUnpaved,true);
  assert.equal(p.needsReview,false);
});
test('negation and unknown preference are never mistaken for hard exclusions',()=>{
  assert.equal(interpretRouteStyle('Não quero evitar pedágios').avoidTolls,false);
  assert.equal(interpretRouteStyle('Gosto de avenidas movimentadas').needsReview,true);
  assert.throws(()=>interpretRouteStyle('a'.repeat(501)),/500/);
});
test('routine appears only after 15 actual completed journeys',()=>{
  const now=Date.now(),items=Array.from({length:17},(_,i)=>({
    id:String(i),owner:'u1',createdAt:new Date(now-(i+1)*86400000).toISOString(),
    completedAt:new Date(now-(i+1)*86400000+240000).toISOString(),
    origin:[-46.7+(i%2)*0.0001,-23.5],
    destination:{name:'Academia',coords:[-46.65,-23.55]},
    localWeekday:i%7,localHour:18
  }));
  assert.equal(discoverRoutine(items.slice(0,14),'u1',{now}).candidate,null);
  assert.equal(discoverRoutine(items,'u2',{now}).candidate,null);
  const found=discoverRoutine(items,'u1',{now});
  assert.equal(found.completed,17);assert.ok(found.candidate?.count>=4);
});
test('never infer routines from planned-only trips',()=>{
  const now=Date.now(),items=Array.from({length:22},(_,i)=>({
    owner:'u1',createdAt:new Date(now-i*86400000).toISOString(),
    origin:[-46.7,-23.5],destination:{coords:[-46.65,-23.55]}}));
  assert.equal(discoverRoutine(items,'u1',{now}).candidate,null);
});
test('via-stop route contains all waypoints and never silently returns a direct route',async()=>{
  let observed='';
  const fetcher=async url=>{
    observed=String(url);
    return {ok:true,json:async()=>({code:'Ok',routes:[{
      distance:2400,duration:500,geometry:{type:'LineString',coordinates:[[-46.7,-23.5],[-46.69,-23.51],[-46.68,-23.52]]},
      legs:[{steps:[]},{steps:[]}]
    }]})};
  };
  const r=await calculateMapboxViaStop([-46.7,-23.5],[-46.69,-23.51],[-46.68,-23.52],'carro',{},'pt-BR',{},'pk.testing',fetcher);
  assert.match(observed,/-46.7,-23.5;-46.69,-23.51;-46.68,-23.52/);
  assert.match(observed,/alternatives=false/);
  assert.equal(r.stopIncluded,true);assert.equal(r.routes.length,1);
});
test('invalid provider response fails instead of ignoring stop',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({code:'Ok',routes:[{geometry:{coordinates:[[1,2]]},legs:[{}]}]})});
  await assert.rejects(calculateMapboxViaStop([-46.7,-23.5],[-46.69,-23.51],[-46.68,-23.52],'carro',{},'pt-BR',{},'pk.test',fetcher),/parada/);
});
