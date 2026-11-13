import test from 'node:test';
import assert from 'node:assert/strict';
import {metersBetween} from './navigationMotion.js';
import {standardMapCarPose} from './standardMapCar.mjs';
const origin=[-46.68,-23.58],north=m=>m/111320;
const east=m=>m/(111320*Math.cos(origin[1]*Math.PI/180));
const route={geometry:{type:'LineString',coordinates:[origin,[origin[0]+east(150),origin[1]]]}};
const house=[origin[0]+east(10),origin[1]+north(48)];
const run=(previous,position=house,more={})=>standardMapCarPose({
 previous,position,route,trackingPoint:position,trackingBearing:90,
 accuracy:12,speed:0,heading:null,sourceAt:1000,now:1000,
 navigation:true,vehicle:'carro',...more});
test('/mapa immediately begins with compact car at nearby street entrance, without replacing GPS',()=>{
 const original=[...house];
 const car=run(null);
 assert.equal(car.visible,true);
 assert.equal(car.entryHeld,true);
 assert.deepEqual(car.point,origin);
 assert.ok(metersBetween(car.point,house)>40);
 assert.deepEqual(house,original,'GPS input is never rewritten');
 assert.equal(run(null,house,{navigation:false}).visible,false);
 assert.equal(run(null,house,{vehicle:'moto'}).visible,false);
 assert.equal(run(null,house,{simulation:true}).visible,false);
});
test('no arbitrary street jumps on distant or stale GPS',()=>{
 const far=[origin[0]+east(145),origin[1]+north(100)];
 assert.equal(run(null,far).visible,false);
 assert.equal(run(null,house,{sourceAt:1000,now:12000}).visible,false);
 assert.equal(run(null,house,{accuracy:78}).visible,false);
 assert.equal(run(null,house,{speed:8,heading:90}).visible,false);
});
test('one GPS fix and jitter cannot oscillate between car and arrow or move it back into buildings',()=>{
 let car=run(null);
 for(let i=0;i<90;i++){
  car=run(car,[house[0]+east(i%3),house[1]+north(i%2)],{now:1100+i*20,sourceAt:1000});
  assert.equal(car.visible,true);
  assert.deepEqual(car.point,origin);
  assert.equal(car.entryHeld,true);
 }
 const onRoad=[origin[0]+east(18),origin[1]+north(2)];
 const match={point:[onRoad[0],origin[1]],bearing:90};
 car=run(car,onRoad,{sourceAt:3000,now:3000,speed:4,heading:90,match,
   trackingPoint:match.point});
 assert.equal(car.visible,true);
 assert.equal(car.entryHeld,false);
 assert.deepEqual(car.point,match.point);
 const weak=[origin[0]+east(18),origin[1]+north(17)];
 for(let i=0;i<60;i++){
  car=run(car,weak,{sourceAt:4000,now:4000+i*30,accuracy:17,speed:0,match:null,trackingPoint:weak});
  assert.equal(car.visible,true);
  assert.deepEqual(car.point,match.point,'a single noisy reading cannot drag car into a building');
 }
});
test('only distinct accurate off-route fixes release the car; no automatic re-acquisition loop',()=>{
 const moving=[origin[0]+east(18),origin[1]+north(1)];
 const match={point:[moving[0],origin[1]],bearing:90};
 let car=run(null);
 car=run(car,moving,{sourceAt:2000,now:2000,speed:5,heading:90,match,trackingPoint:match.point});
 assert.equal(car.entryHeld,false);
 const offroad=[origin[0]+east(21),origin[1]+north(42)];
 for(let i=0;i<3;i++){
  car=run(car,offroad,{sourceAt:3000+i*1000,now:3000+i*1000,accuracy:8,trackingPoint:offroad,match:null});
  assert.equal(car.visible,true);
 }
 car=run(car,offroad,{sourceAt:6000,now:6000,accuracy:8,match:null});
 assert.equal(car.visible,false);
 assert.equal(car.offRouteSuppressed,true);
 for(let i=0;i<10;i++){
  car=run(car,offroad,{sourceAt:7000+i*1000,now:7000+i*1000,accuracy:8,match:null});
  assert.equal(car.visible,false,'do not flip back to car while still off road near the entrance');
 }
 car=run(car,moving,{sourceAt:20000,now:20000,speed:5,heading:90,accuracy:7,match,trackingPoint:match.point});
 assert.equal(car.visible,true,'re-entering a confirmed road can restore the car');
});
test('a reliable road match can acquire a car away from the first route point',()=>{
 const street=[origin[0]+east(115),origin[1]+north(1)];
 const match={point:[street[0],origin[1]],bearing:90};
 const car=run(null,street,{sourceAt:9000,now:9000,match,trackingPoint:match.point,
  accuracy:6,speed:8,heading:90});
 assert.equal(car.visible,true);
 assert.equal(car.entryHeld,false);
 assert.deepEqual(car.point,match.point);
});
