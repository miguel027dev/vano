import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRouteTimeline,sampleRoute} from './routeAnimation.js';
import {planStandardPlayPointer} from './standardPlayPointer.mjs';
import {metersBetween} from './navigationMotion.js';

const a=[-46.68,-23.58],corner=[-46.68,-23.579],end=[-46.6788,-23.579];
const geometry={type:'LineString',coordinates:[a,corner,end]};
const timeline=buildRouteTimeline(geometry);
const route={geometry,steps:[{type:'on ramp',modifier:'right',location:corner}]};
const at=timeline.cumulative[1];

test('Play marker accelerates toward simulated route progress near an actual entrance',()=>{
  const prev=at-85,target=at-48;
  const straight=planStandardPlayPointer({timeline,route,targetMeters:target,previousMeters:prev,
    dtMs:16,maneuver:{kind:'continue',distance:500}});
  const entrance=planStandardPlayPointer({timeline,route,targetMeters:target,previousMeters:prev,
    dtMs:16,maneuver:{stepIndex:0,kind:'on ramp',distance:12}});
  assert.ok(entrance.entrance);
  assert.ok(entrance.progress>straight.progress);
  assert.ok(entrance.progress<=target);
  assert.ok(entrance.bearing<2||entrance.bearing>358,'never turn before reaching the vertex');
  assert.deepEqual(entrance.point,sampleRoute(timeline,entrance.progress).point);
});

test('Play marker detects the physical entry even after instructions change',()=>{
  const before=planStandardPlayPointer({timeline,route,targetMeters:at-9,
    previousMeters:at-22,dtMs:16,maneuver:{kind:'continue',distance:500}});
  const after=planStandardPlayPointer({timeline,route,targetMeters:at+8,
    previousMeters:at+2,dtMs:16,maneuver:{kind:'continue',distance:500}});
  assert.equal(before.entrance,true);
  assert.equal(after.entrance,true);
  assert.ok(after.bearing>20&&after.bearing<=91);
  assert.ok(after.bearingHalfLifeMs<120,'fast heading response survives step change');
  assert.ok(metersBetween(after.point,corner)<=9);
});

test('Play marker never crosses outside provider geometry or jumps ahead',()=>{
  for(const target of [0,15,at-1,at,at+1,at+4,at+15,timeline.total]){
    const previous=Math.max(0,target-12);
    const frame=planStandardPlayPointer({timeline,route,targetMeters:target,previousMeters:previous,dtMs:17});
    assert.ok(frame.progress>=previous&&frame.progress<=target);
    assert.deepEqual(frame.point,sampleRoute(timeline,frame.progress).point);
  }
  assert.deepEqual(planStandardPlayPointer({timeline,route,targetMeters:timeline.total+400,previousMeters:0,dtMs:50}).point,
    sampleRoute(timeline,planStandardPlayPointer({timeline,route,targetMeters:timeline.total,previousMeters:0,dtMs:50}).progress).point);
});

test('rewind, missing route, reduced-motion and initial frame are handled',()=>{
  const frame=planStandardPlayPointer({timeline,route,targetMeters:at+20,previousMeters:at+60,dtMs:16});
  assert.equal(frame.progress,at+20);
  assert.equal(planStandardPlayPointer({timeline,route,targetMeters:at-4,previousMeters:null,dtMs:16}).progress,at-4);
  assert.equal(planStandardPlayPointer({timeline,route,targetMeters:at+3,previousMeters:0,dtMs:16,reducedMotion:true}).progress,at+3);
  assert.equal(planStandardPlayPointer({timeline:null,targetMeters:200}),null);
  assert.equal(planStandardPlayPointer({timeline,targetMeters:null}),null);
});

test('fast Play marker is isolated from live GPS and separate V2 drone simulation',()=>{
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(map,/d\.v2Experience&&d\.simulationPreview&&!d\.droneSimulation&&/);
  assert.match(map,/playPointer=planStandardPlayPointer\(\{/);
  assert.match(map,/point=playPointer\?\.point/);
  assert.match(map,/state\.playMeters=playPointer\?\.progress\?\?null/);
  assert.match(map,/else if\(d\.droneSimulation&&timeline\.total>0&&Number\.isFinite\(simulationMeters\)\)/);
  assert.match(map,/point=easeGpsPoint\(state\.point,target,dt/);
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  assert.match(page,/simCameraMode==='drone'&&Number\.isFinite\(simFrame\.pointerBearing\)\?simFrame\.pointerBearing:simFrame\.bearing/);
  assert.match(page,/simCameraMode==='drone'\?V2_DRONE_PLAYBACK_RATE:undefined/);
});
