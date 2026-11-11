import test from 'node:test';
import assert from 'node:assert/strict';
import {metersBetween,shortestAngle,blendAngle,nearestOnRoute,nextRouteBearing,cameraTarget,CAMERA_STATES} from './navigationMotion.js';
test('angles use shortest rotation',()=>{assert.equal(shortestAngle(355,5),10);assert.equal(shortestAngle(5,355),-10);assert.equal(blendAngle(350,10,.5),0);});
test('route matching checks segment instead of raw vertex',()=>{const geometry={coordinates:[[-46.7,-23.6],[-46.69,-23.6]]};const near=nearestOnRoute([-46.695,-23.6001],geometry);assert.ok(near.distance<20);assert.ok(Math.abs((nextRouteBearing([-46.695,-23.6],geometry,60)||0)-90)<1);});
test('navigation holds with no point and eases near arrival',()=>{assert.equal(cameraTarget({navigation:true}),null);const p=[-46.7,-23.6],t=cameraTarget({navigation:true,position:p,destination:[-46.7001,-23.6],route:{geometry:{coordinates:[p,[-46.7001,-23.6]]}}});assert.equal(t.state,CAMERA_STATES.ARRIVAL);assert.equal(t.pitch,20);});
test('distance is finite and symmetric',()=>{const a=[-46.7,-23.6],b=[-46.69,-23.6];assert.ok(metersBetween(a,b)>900);assert.equal(metersBetween(a,b),metersBetween(b,a));});
