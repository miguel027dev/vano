import test from 'node:test';
import assert from 'node:assert/strict';
import {walkingDirectionsUrl,calculateWalkingRoute} from './walking-route.mjs';

const origin=[-46.6557,-23.5615],destination=[-46.65,-23.56];
const providerRoute={duration:720,distance:950,geometry:{type:'LineString',coordinates:[origin,destination]},legs:[{steps:[{distance:950,name:'Passagem',maneuver:{instruction:'Siga pela passagem',location:origin,type:'depart',modifier:'straight'}}]}]};

test('walking request uses pedestrian network without motor vehicle restrictions',()=>{
  const url=walkingDirectionsUrl(origin,destination,'test-token','fr-FR',{avoidTolls:true,avoidUnpaved:true,avoidFerries:true,reroute:true,departAt:'2030-01-01T12:00'});
  assert.match(url.pathname,/\/mapbox\/walking\//);
  assert.equal(url.searchParams.get('language'),'fr-FR');
  assert.equal(url.searchParams.get('exclude'),'ferry');
  for(const key of ['annotations','bearings','continue_straight','avoid_maneuver_radius','depart_at','notifications'])assert.equal(url.searchParams.has(key),false,key);
});
test('walking route preserves pedestrian geometry, provider ETA and maneuver instructions',async()=>{
  let calls=0;
  const result=await calculateWalkingRoute(origin,destination,'pt-BR',{},'test-token',async url=>{calls++;assert.match(url.pathname,/walking/);return {ok:true,json:async()=>({code:'Ok',routes:[providerRoute]})};});
  assert.equal(calls,1);
  assert.equal(result.source,'mapbox-walking');
  assert.equal(result.routes.length,1);
  assert.equal(result.routes[0].duration,12);
  assert.deepEqual(result.routes[0].geometry,providerRoute.geometry);
  assert.equal(result.routes[0].steps[0].instruction,'Siga pela passagem');
  assert.equal(result.routes[0].verifiedSafety,false);
});
test('walking provider failure never falls back to a driving or demonstration route',async()=>{
  let calls=0;
  await assert.rejects(calculateWalkingRoute(origin,destination,'pt-BR',{},'test-token',async()=>{calls++;return {ok:false,status:503};}),/503/);
  assert.equal(calls,1);
});
test('walking rejects missing routes and malformed provider geometry',async()=>{
  for(const body of [{code:'NoRoute',routes:[]},{routes:[]},{routes:[{...providerRoute,geometry:{type:'LineString',coordinates:[origin,[999,0]]}}]}]){
    await assert.rejects(calculateWalkingRoute(origin,destination,'pt-BR',{},'test-token',async()=>({ok:true,json:async()=>body})));
  }
});
