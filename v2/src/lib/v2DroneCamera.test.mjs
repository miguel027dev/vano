import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planV2DroneCamera,V2_DRONE_PLAYBACK_RATE} from './v2DroneCamera.mjs';
const route={steps:[{type:'depart'},{type:'roundabout',modifier:'right'},{type:'off ramp'},{type:'arrive'}]};
const maneuver=(stepIndex,distance)=>({stepIndex,distance,kind:route.steps[stepIndex].type,modifier:route.steps[stepIndex].modifier});

test('V2 drone is an opt-in admin presentation mode, not the standard GPS camera',()=>{
  assert.equal(planV2DroneCamera().enabled,false);
  assert.equal(planV2DroneCamera({enabled:true,vehicle:'a-pe'}).enabled,false);
  const ordinary=planV2DroneCamera({enabled:true,vehicle:'carro',speed:11,route,maneuver:maneuver(0,500)});
  assert.equal(ordinary.category,'continue');
  assert.equal(ordinary.open,0);
  assert.ok(ordinary.zoom>18.5&&ordinary.pitch>=60);
  assert.equal(V2_DRONE_PLAYBACK_RATE,2.5);
});

test('approaching a roundabout opens zoom and lowers pitch continuously',()=>{
  const args={enabled:true,vehicle:'carro',speed:12,route};
  const far=planV2DroneCamera({...args,maneuver:maneuver(1,450)});
  const medium=planV2DroneCamera({...args,maneuver:maneuver(1,125)});
  const near=planV2DroneCamera({...args,maneuver:maneuver(1,10)});
  assert.equal(far.open,0);
  assert.ok(medium.open>0&&medium.open<near.open);
  assert.ok(far.zoom>medium.zoom&&medium.zoom>near.zoom);
  assert.ok(far.pitch>medium.pitch&&medium.pitch>near.pitch);
  assert.ok(near.centerBlend>far.centerBlend);
});

test('high-rise urban corridor shows more street with gentle framing',()=>{
  const args={enabled:true,vehicle:'moto',route,maneuver:maneuver(0,1000),speed:10};
  const openRoad=planV2DroneCamera(args);
  const urban=planV2DroneCamera({...args,urbanDensity:1});
  assert.ok(urban.zoom<openRoad.zoom);
  assert.ok(urban.pitch<openRoad.pitch);
  assert.ok(urban.centerBlend>openRoad.centerBlend);
  assert.ok(planV2DroneCamera({...args,compactViewport:true}).pitch<=63);
});

test('reduced-motion fallback and weak accuracy stay conservative',()=>{
  const base={enabled:true,vehicle:'carro',route,maneuver:maneuver(1,8)};
  assert.equal(planV2DroneCamera({...base,reducedMotion:true}).pitch,0);
  assert.ok(planV2DroneCamera({...base,accuracy:120}).open<=.38);
  const missing=planV2DroneCamera({...base,maneuver:null});
  assert.equal(missing.open,0);
});

test('new admin button is above old simulator, and simulation remains GPS-isolated',()=>{
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../admin-route-simulator.css',import.meta.url),'utf8');
  const drone=page.indexOf('className={`circle-btn v81-drone-sim-toggle');
  const regular=page.indexOf('className={`circle-btn v76-sim-toggle');
  assert.ok(drone>0&&regular>drone,'V2 Sim renders above normal simulation');
  assert.match(page,/adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
  assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
  assert.match(page,/simulationPreview=\{simActive\}/);
  assert.match(page,/gpsCoords=\{simPosition\|\|userCoords\}/);
  assert.match(page,/if\(!adminV2RoadSigns\|\|!active\)return/);
  assert.match(page,/simRequestedMode\.current='drone'/);
  assert.match(page,/onClick=\{simActive\?stopRouteSimulation:startRouteSimulation\}/);
  assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return base/);
  assert.match(map,/if\(!d\.droneSimulation\)/);
  assert.match(css,/\.v81-drone-sim-toggle:focus-visible/);
  assert.doesNotMatch(page,/setUserCoords\(simPosition/);
});
