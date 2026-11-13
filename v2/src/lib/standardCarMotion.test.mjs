import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteTimeline,sampleRoute} from './routeAnimation.js';
import {metersBetween} from './navigationMotion.js';
import {smoothStandardCarDrive} from './standardCarMotion.mjs';
const start=[-46.68,-23.58],east=m=>m/(111320*Math.cos(start[1]*Math.PI/180)),north=m=>m/111320;
const timeline=buildRouteTimeline({type:'LineString',coordinates:[start,[start[0]+east(80),start[1]],[start[0]+east(80),start[1]+north(100)]]});
const point=m=>sampleRoute(timeline,m).point;
const step=(previous,meters,options={})=>smoothStandardCarDrive({
 previous,point:point(meters),timeline,speed:13.8889,dtMs:1000/60,
 sourceAt:1000,now:1300,entryHeld:false,bearing:90,...options
});
test('50 km/h has continuous ~pixel-size forward increments at 60fps without a 14m GPS jump',()=>{
 let car=step(null,0,{now:1000}),last=car.point;
 const deltas=[],progress=[];
 for(let frame=1;frame<=60;frame++){
  const elapsed=frame*1000/60;
  car=step(car,14,{now:1000+elapsed,sourceAt:1000});
  const displacement=metersBetween(car.point,last);
  deltas.push(displacement);progress.push(car.meters);
  assert.ok(displacement>=0&&displacement<.38,'at 60fps car must glide instead of teleporting');
  last=car.point;
 }
 assert.ok(progress[0]>0&&progress[0]<.37);
 assert.ok(progress[59]>8,'visual motor follows highway speed, not a fixed slow animation');
 assert.ok(progress.every((v,i)=>i===0||v>=progress[i-1]),'no backwards jitter');
 assert.ok(deltas.filter(d=>d>.05).length>40,'smooth movement throughout 1Hz GPS interval');
});
test('15fps and 120fps travel similar distances for the same measured 50 km/h drive',()=>{
 const simulate=fps=>{
  let car=step(null,0,{now:1000});
  for(let i=1;i<=fps;i++)car=step(car,16,{
   dtMs:1000/fps,sourceAt:1000,now:1000+i*1000/fps
  });
  return car.meters;
 };
 const fifteen=simulate(15),sixty=simulate(60),oneTwenty=simulate(120);
 assert.ok(Math.abs(fifteen-sixty)<2.0);
 assert.ok(Math.abs(sixty-oneTwenty)<2.0);
});
test('road turns remain on route polyline, never diagonally through buildings',()=>{
 let car=step(null,74,{sourceAt:1000,now:1000});
 for(let i=1;i<=100;i++){
  car=step(car,110,{sourceAt:1100,now:1100+i*15,dtMs:15});
  const expected=sampleRoute(timeline,car.meters).point;
  assert.ok(metersBetween(car.point,expected)<.05,'all rendered points belong to street geometry');
  assert.ok(Number.isFinite(car.bearing));
 }
 assert.ok(car.meters>80,'crosses the turn while remaining road-bound');
});
test('at a red light GPS jitter cannot make the compact car creep, reverse or spin',()=>{
 let car=step(null,43,{speed:0,sourceAt:1000,now:1000,bearing:90});
 const saved=car.point;
 for(let i=0;i<100;i++){
  car=step(car,i%2?44:42,{speed:0,sourceAt:1000+i*16,now:1000+i*16,bearing:90});
  assert.ok(metersBetween(car.point,saved)<.05);
 }
});
test('no continued dead reckoning after stale GPS; reduced motion and relocalization snap safely',()=>{
 let car=step(null,20,{now:1000});
 const original=car.point;
 for(let i=0;i<35;i++)car=step(car,40,{sourceAt:1000,now:4100+i*16});
 assert.ok(metersBetween(car.point,original)<.05,'no ghost driving without fresh location');
 car=step(car,40,{sourceAt:5000,now:5000,reducedMotion:true});
 assert.ok(metersBetween(car.point,point(40))<.05);
 car=step(car,230,{sourceAt:6000,now:6000});
 assert.ok(metersBetween(car.point,point(230))<.05,'large true re-localizations should not animate through city blocks');
});
test('entrance stays fixed while GPS is indoors; on new drive frames only visual pose changes',()=>{
 let car=step(null,0,{speed:0,entryHeld:true,sourceAt:1000,now:1000});
 for(let i=0;i<30;i++){
  car=step(car,0,{speed:0,entryHeld:true,sourceAt:1000,now:1000+i*16});
  assert.deepEqual(car.point,start);
 }
 const moving=step(car,18,{speed:13.8889,entryHeld:false,sourceAt:2000,now:2000});
 assert.ok(moving.meters>0&&moving.meters<1);
});
