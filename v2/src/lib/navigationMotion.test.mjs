import test from 'node:test';
import assert from 'node:assert/strict';
import {metersBetween,shortestAngle,blendAngle,nearestOnRoute,nextRouteBearing,cameraTarget,shouldFollowLocation,CAMERA_STATES} from './navigationMotion.js';
test('angles use shortest rotation',()=>{assert.equal(shortestAngle(355,5),10);assert.equal(shortestAngle(5,355),-10);assert.equal(blendAngle(350,10,.5),0);});
test('route matching checks segment instead of raw vertex',()=>{const geometry={coordinates:[[-46.7,-23.6],[-46.69,-23.6]]};const near=nearestOnRoute([-46.695,-23.6001],geometry);assert.ok(near.distance<20);assert.ok(Math.abs((nextRouteBearing([-46.695,-23.6],geometry,60)||0)-90)<1);});
test('navigation holds with no point and eases near arrival',()=>{assert.equal(cameraTarget({navigation:true}),null);const p=[-46.7,-23.6],t=cameraTarget({navigation:true,position:p,destination:[-46.7001,-23.6],route:{geometry:{coordinates:[p,[-46.7001,-23.6]]}}});assert.equal(t.state,CAMERA_STATES.ARRIVAL);assert.equal(t.pitch,20);});
test('distance is finite and symmetric',()=>{const a=[-46.7,-23.6],b=[-46.69,-23.6];assert.ok(metersBetween(a,b)>900);assert.equal(metersBetween(a,b),metersBetween(b,a));});

test('without a destination, real GPS automatically enables the same camera tracker as route guidance',()=>{
 const gps=[-46.68,-23.58];
 assert.equal(shouldFollowLocation({position:gps}),true);
 assert.equal(shouldFollowLocation({navigation:true,destination:{coords:gps},position:gps}),true);
 assert.equal(shouldFollowLocation({position:gps,destination:{coords:gps}}),false);
 assert.equal(shouldFollowLocation({position:gps,pickingOrigin:true}),false);
 assert.equal(shouldFollowLocation({position:gps,manualOrigin:[-46.7,-23.6]}),false);
 assert.equal(shouldFollowLocation({position:null}),false);
 assert.equal(shouldFollowLocation({position:[999,999]}),false);
});

test('free driving camera centers without inventing a route or GPS heading',()=>{
 const gps=[-46.68,-23.58];
 const parked=cameraTarget({navigation:true,position:gps,telemetry:{speed:0,heading:null}});
 assert.deepEqual(parked.center,gps);
 assert.equal(parked.state,CAMERA_STATES.FOLLOW);
 assert.equal(parked.bearing,null);
 const moving=cameraTarget({navigation:true,position:gps,telemetry:{speed:12,heading:90,accuracy:10}});
 assert.ok(moving.center[0]>gps[0],'moving east looks ahead of the driver');
 assert.ok(Math.abs(moving.center[1]-gps[1])<.00001);
 assert.ok(moving.zoom>=16);
 assert.equal(moving.bearing,90);
 const accessible=cameraTarget({navigation:true,position:gps,telemetry:{speed:12,heading:90},reducedMotion:true});
 assert.deepEqual(accessible.center,gps);
 assert.equal(accessible.pitch,0);
});
