import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v2SimulationChasePadding,v2SimulationCameraLimits,V2_SIM_REFERENCE} from './v2SimulationChase.mjs';
import {planV2RearChase} from './v2DroneCamera.mjs';

test('reference screenshot framing anchors vehicle at 73% of the SAFE map area',()=>{
  assert.equal(V2_SIM_REFERENCE.pitch,53);
  assert.equal(V2_SIM_REFERENCE.zoom,17);
  const vp={padding:{top:148,bottom:180,left:22,right:22},visibleHeight:420,markerRadius:48};
  const pad=v2SimulationChasePadding(vp);
  const height=vp.padding.top+vp.visibleHeight+vp.padding.bottom;
  const centerY=(pad.top+height-pad.bottom)/2;
  const fraction=(centerY-vp.padding.top)/vp.visibleHeight;
  assert.ok(Math.abs(fraction-.73)<.003);
  assert.equal(pad.bottom,vp.padding.bottom);
  assert.equal(pad.left,vp.padding.left);
  assert.equal(pad.right,vp.padding.right);
  assert.equal(vp.padding.top,148,'pure: never mutate measured viewport');
});

test('compact phones, overlapping overlays and unknown viewports fail safely',()=>{
  const compact={padding:{top:170,bottom:230,left:14,right:14},visibleHeight:120,markerRadius:42};
  const p=v2SimulationChasePadding(compact);
  const h=compact.padding.top+compact.visibleHeight+compact.padding.bottom;
  const center=(p.top+h-p.bottom)/2;
  assert.ok(center<=compact.padding.top+compact.visibleHeight-48);
  assert.ok(center>=compact.padding.top+48);
  assert.equal(v2SimulationChasePadding({}),null);
  const tiny={padding:{top:90,bottom:90,left:12,right:12},visibleHeight:90};
  assert.strictEqual(v2SimulationChasePadding(tiny),tiny.padding);
});

test('V2-only reference limits produce a stable cruise and protect high-rise occlusion',()=>{
  const cruise=planV2RearChase({enabled:true,speed:11,urbanDensity:0});
  const dense=planV2RearChase({enabled:true,speed:11,urbanDensity:1,obstruction:1});
  const entrance=planV2RearChase({enabled:true,speed:11,rampStrength:1});
  assert.ok(Math.abs(cruise.pitch-53)<=1);
  assert.ok(Math.abs(cruise.zoom-17)<.2);
  assert.ok(dense.pitch<cruise.pitch);
  assert.ok(entrance.zoom>cruise.zoom);
  assert.ok(entrance.pitch<=58);
  assert.deepEqual(v2SimulationCameraLimits(99,99),{zoom:17.42,pitch:58});
  assert.deepEqual(v2SimulationCameraLimits(-99,-99),{zoom:16.72,pitch:30});
  assert.equal(v2SimulationCameraLimits(18,40,{reducedMotion:true}).pitch,0);
});

test('V2 simulator is isolated, uses actual puck as target and has one camera writer',()=>{
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
  assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return realCameraDistance/);
  assert.match(map,/cameraPadding:v2SimulationChasePadding\(viewport\)/);
  assert.match(map,/center:behindView/);
  assert.match(map,/v2UserCenteredRampView\(\s*userPuck,markerHeading,0/);
  assert.match(map,/cameraFollowMarker:true/);
  assert.match(map,/padding:t\.cameraPadding\|\|latest\.current\.viewport/);
  assert.match(map,/const maxYawStep=\(latest\.current\.droneSimulation\?82:72\)\*dt\/1000/);
  assert.match(map,/targetMeters\+12<state\.droneMeters/);
  assert.equal((map.match(/map\.jumpTo\(\{\.\.\.pose,padding:/g)||[]).length,1);
});

test('roundabouts keep exits in frame, turns follow road, invalid GPS remains conservative',()=>{
  const base={enabled:true,speed:12,route:{steps:[{type:'off ramp'}]}};
  const turn=planV2RearChase({...base,maneuver:{kind:'turn',modifier:'left',distance:25}});
  const circle=planV2RearChase({...base,maneuver:{kind:'roundabout',distance:40}});
  const ramp=planV2RearChase({...base,maneuver:{stepIndex:0,kind:'off ramp',distance:45},rampStrength:.95});
  const uncertain=planV2RearChase({...base,accuracy:130,straightAheadMeters:650,maneuver:{kind:'continue',distance:800}});
  assert.equal(turn.scenario,'turn');
  assert.equal(circle.scenario,'roundabout');
  assert.ok(circle.zoom<ramp.zoom);
  assert.ok(circle.pitch<turn.pitch);
  assert.ok(ramp.zoom>=turn.zoom-.04,'confirmed entrance has comparable close-up to a turn');
  assert.equal(uncertain.straightStrength,0);
});
