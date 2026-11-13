import test from 'node:test';
import assert from 'node:assert/strict';
import {metersBetween} from './navigationMotion.js';
import {visualRouteStartPoint,assessV2CarOnStreet} from './v2RoadEntry.mjs';

const origin=[-46.68,-23.58],north=m=>m/111320;
const east=m=>m/(111320*Math.cos(origin[1]*Math.PI/180));
const route={geometry:{type:'LineString',coordinates:[origin,[origin[0]+east(80),origin[1]]]}};
const entry=(position,more={})=>visualRouteStartPoint({
 position,route,accuracy:12,speed:0,navigation:true,...more});
const observe=(previous,position,match,more={})=>
 assessV2CarOnStreet({previous,position,match,accuracy:7,speed:4,heading:90,
 sourceAt:1000,now:1000,...more});

test('nearby house projects only the visual arrow to first street point',()=>{
 const house=[origin[0]+east(5),origin[1]+north(12)];
 assert.deepEqual(entry(house),origin);
 assert.ok(metersBetween(house,entry(house))>10);
 assert.deepEqual(house,[origin[0]+east(5),origin[1]+north(12)]);
 assert.equal(entry([origin[0]+east(35),origin[1]+north(30)]),null);
 assert.equal(entry(house,{speed:6}),null);
 assert.equal(entry(house,{accuracy:70}),null);
 assert.equal(entry(house,{navigation:false}),null);
 assert.equal(entry(house,{simulation:true}),null);
});
test('compact car requires two fresh moving street observations and aligned direction',()=>{
 const raw=[origin[0]+east(15),origin[1]+north(3)];
 const match={point:[raw[0],origin[1]],bearing:90};
 let car=observe(null,raw,match);
 assert.equal(car.visible,false);
 car=observe(car,raw,match,{sourceAt:2000,now:2000});
 assert.equal(car.visible,true);
 assert.equal(car.everConfirmed,true);
 assert.equal(observe(null,raw,match,{heading:270}).visible,false);
 assert.equal(observe(null,raw,match,{accuracy:60}).visible,false);
 assert.equal(observe(null,raw,match,{sourceAt:1000,now:7000}).visible,false);
});
test('inside a block stays an arrow even if route matcher proposes a centerline',()=>{
 const house=[origin[0]+east(14),origin[1]+north(14)];
 const match={point:[house[0],origin[1]],bearing:90};
 let car=null;
 for(let i=0;i<5;i++)car=observe(car,house,match,{speed:0,heading:null,now:1000+i*1000,sourceAt:1000+i*1000});
 assert.equal(car.visible,false);
});
test('stationary road confirmation is conservative; traffic light retains a confirmed car',()=>{
 const raw=[origin[0]+east(30),origin[1]+north(2)];
 const match={point:[raw[0],origin[1]],bearing:90};
 let car=null;
 for(let i=0;i<3;i++)car=observe(car,raw,match,{speed:0,heading:null,sourceAt:1000+i*1000,now:1000+i*1000});
 assert.equal(car.visible,true);
 car=observe(car,[raw[0],origin[1]+north(5)],match,{speed:0,accuracy:18,heading:null,sourceAt:5000,now:5000});
 assert.equal(car.visible,true);
 car=observe(car,[raw[0],origin[1]+north(22)],match,{speed:0,heading:null,sourceAt:6000,now:6000});
 assert.equal(car.visible,false);
 assert.equal(car.everConfirmed,true);
});
