import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTravelDistance,measuredKilometers} from './travelDistance.js';
const start=100000,fix=(offset,time,accuracy=5)=>({coords:[-46.65,-23.56+offset/111195],sourceAt:time,accuracy});
const options={active:true,speed:10,now:start+10000};
test('planning and legacy history never count as travelled distance',()=>{
 assert.equal(measuredKilometers({distance:100}),0);
 assert.equal(measuredKilometers({measurementVersion:1,distance:100,travelledMeters:1234}),1.234);
 assert.equal(advanceTravelDistance(null,fix(0,start),{...options,active:false}).meters,0);
});
test('GPS odometer measures partial trips and counts repeated fixes only once',()=>{
 let state=advanceTravelDistance(null,fix(0,start),options);
 state=advanceTravelDistance(state,fix(100,start+10000),options);
 assert.ok(Math.abs(state.meters-100)<1);
 assert.equal(advanceTravelDistance(state,fix(100,start+10000),options).meters,state.meters);
 assert.equal(advanceTravelDistance(state,fix(200,start+10000),options).meters,state.meters);
});
test('stationary jitter, approximate fixes, simulated fixes and teleportation do not add kilometres',()=>{
 const state=advanceTravelDistance(null,fix(0,start),options);
 assert.equal(advanceTravelDistance(state,fix(2,start+1000),options).meters,0);
 assert.equal(advanceTravelDistance(state,fix(20,start+1000),{...options,speed:0}).meters,0);
 assert.equal(advanceTravelDistance(state,fix(100,start+1000,100),options).meters,0);
 assert.equal(advanceTravelDistance(state,fix(100,start+1000),{...options,simulated:true}).meters,0);
 assert.equal(advanceTravelDistance(state,fix(1000,start+1000),options).meters,0);
});
test('signal loss or resume does not bridge unobserved distance',()=>{
 let state=advanceTravelDistance(null,fix(0,start),options);
 state=advanceTravelDistance(state,fix(1000,start+60000),{...options,now:start+60000});assert.equal(state.meters,0);
 const resumed={meters:300,anchor:null,lastSeenAt:null};
 assert.equal(advanceTravelDistance(resumed,fix(5000,start),options).meters,300);
});
