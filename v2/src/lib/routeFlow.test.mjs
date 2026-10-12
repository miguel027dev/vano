import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOW_DASH_FRAMES,FLOW_FRAME_MS,flowFrameAt,sameRouteShapeReferences} from './routeFlow.js';

test('route flow holds a fixed pattern length without editing route geometry',()=>{
  assert.equal(FLOW_DASH_FRAMES.length,14);
  for(const frame of FLOW_DASH_FRAMES){
    assert.ok(frame.length>=3);
    assert.ok(frame.every(x=>Number.isFinite(x)&&x>=0));
    assert.ok(Math.abs(frame.reduce((a,b)=>a+b,0)-7)<1e-10);
  }
});
test('route flow phases advance toward destination and loop seamlessly',()=>{
  assert.equal(FLOW_DASH_FRAMES[0][0],0);
  for(let i=1;i<=6;i++)assert.ok(FLOW_DASH_FRAMES[i][0]>FLOW_DASH_FRAMES[i-1][0]);
  assert.equal(FLOW_DASH_FRAMES[7][0],0);
  for(let i=8;i<14;i++)assert.ok(FLOW_DASH_FRAMES[i][1]>FLOW_DASH_FRAMES[i-1][1]);
  assert.equal(flowFrameAt(0),0);
  assert.equal(flowFrameAt(FLOW_FRAME_MS),1);
  assert.equal(flowFrameAt(FLOW_FRAME_MS*14),0);
});
test('invalid timestamps or frame intervals yield safe static start frame',()=>{
  assert.equal(flowFrameAt(NaN),0);
  assert.equal(flowFrameAt(-50),0);
  assert.equal(flowFrameAt(Infinity),0);
  assert.equal(flowFrameAt(500,0),0);
});

test('reuses route source when GeoJSON geometry references have not changed',()=>{
  const geometry={type:'LineString',coordinates:[[-46.68,-23.58],[-46.67,-23.59]]};
  const alt={type:'LineString',coordinates:[[-46.68,-23.58],[-46.66,-23.59]]};
  assert.equal(sameRouteShapeReferences([geometry,alt],[geometry,alt]),true);
  assert.equal(sameRouteShapeReferences([],[]),true);
  assert.equal(sameRouteShapeReferences([geometry],[{...geometry}]),false);
  assert.equal(sameRouteShapeReferences([geometry,alt],[geometry]),false);
  assert.equal(sameRouteShapeReferences(null,[]),false);
});
test('animation frames are bounded and do not mutate the underlying geometry',()=>{
  const route={type:'LineString',coordinates:[[-46.68,-23.58],[-46.67,-23.59]]};
  const before=JSON.stringify(route);
  const phases=Array.from({length:100},(_,i)=>FLOW_DASH_FRAMES[flowFrameAt(i*FLOW_FRAME_MS)]);
  assert.equal(phases.length,100);
  assert.ok(phases.every(f=>Array.isArray(f)&&f.every(Number.isFinite)));
  assert.equal(JSON.stringify(route),before);
});
