import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planV2DroneCamera,V2_DRONE_PLAYBACK_RATE,observeV2DroneScene,shiftDroneView} from './v2DroneCamera.mjs';
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

test('V2 urban sampler detects the more open side without changing coordinates',()=>{
  const pos=[-46.68,-23.58];
  const poly=(id,east)=>({
    id,layer:{id:'3d-buildings',type:'fill-extrusion'},
    geometry:{type:'Polygon',coordinates:[[
      [pos[0]+east-.00002,pos[1]-.00003],
      [pos[0]+east+.00002,pos[1]-.00003],
      [pos[0]+east+.00002,pos[1]+.00003],
      [pos[0]+east-.00002,pos[1]+.00003],
      [pos[0]+east-.00002,pos[1]-.00003]
    ]]}
  });
  const rightCrowded=observeV2DroneScene([
    poly('r1',.0003),poly('r2',.0004),poly('r3',.0005),poly('l1',-.0003)
  ],pos,0);
  assert.equal(rightCrowded.count,4);
  assert.equal(rightCrowded.right,3);
  assert.equal(rightCrowded.left,1);
  assert.ok(rightCrowded.sideBias<0,'more open left side gets negative look bias');
  const leftCrowded=observeV2DroneScene([
    poly('l2',-.0002),poly('l3',-.0004),poly('r1',.0002)
  ],pos,0);
  assert.ok(leftCrowded.sideBias>0,'more open right side gets positive look bias');
  assert.deepEqual(pos,[-46.68,-23.58]);
});

test('V2 side observation ignores unrelated POIs, invalid points, and duplicate buildings',()=>{
  const home=[-46.68,-23.58],geometry={type:'Polygon',coordinates:[[
    [-46.6805,-23.58],[-46.6804,-23.58],[-46.6804,-23.5801],[-46.6805,-23.58]
  ]]};
  const building={id:123,layer:{id:'building-3d',type:'fill-extrusion'},geometry};
  const scene=observeV2DroneScene([building,building,
    {id:7,layer:{id:'road',type:'line'},geometry}],home,0);
  assert.equal(scene.count,1);
  assert.equal(observeV2DroneScene([],null).density,0);
});

test('V2 camera anticipates unlabeled curves and gently reveals the upcoming turn side',()=>{
  const base={enabled:true,vehicle:'carro',speed:12,route};
  const straight=planV2DroneCamera({...base,maneuver:maneuver(0,400),bendDegrees:0});
  const curve=planV2DroneCamera({...base,maneuver:maneuver(0,400),bendDegrees:55});
  assert.ok(curve.open>straight.open);
  assert.ok(curve.zoom<straight.zoom);
  assert.ok(curve.yawDegrees>0&&curve.yawDegrees<=10);
  const leftTurn=planV2DroneCamera({...base,maneuver:{...maneuver(1,20),modifier:'left'}});
  const rightTurn=planV2DroneCamera({...base,maneuver:maneuver(1,20)});
  assert.ok(leftTurn.yawDegrees<0);
  assert.ok(rightTurn.yawDegrees>0);
  assert.ok(Math.abs(rightTurn.sideMeters)<=8);
});

test('V2 side framing stays within a small safe offset and reacts faster without abrupt changes',()=>{
  const p=[-46.68,-23.58];
  const shifted=shiftDroneView(p,0,100);
  const meters=(shifted[0]-p[0])*111320*Math.cos(p[1]*Math.PI/180);
  assert.ok(meters>7.9&&meters<=8.01);
  assert.equal(shiftDroneView(p,0,0),p);
  assert.deepEqual(p,[-46.68,-23.58]);
  const cruise=planV2DroneCamera({enabled:true,vehicle:'carro',route,maneuver:maneuver(0,700),speed:12});
  assert.ok(cruise.halfLife<300,'follow reacts faster than the old 420ms damping');
  assert.ok(cruise.bearingHalfLife<=245);
  const calm=planV2DroneCamera({enabled:true,vehicle:'carro',route,maneuver:maneuver(1,15),reducedMotion:true});
  assert.equal(calm.yawDegrees,0);
  assert.equal(calm.sideMeters,0);
});

test('environmental query is rate-limited and never granted to ordinary navigation',()=>{
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(map,/if\(!d\.droneSimulation\)\{/);
  assert.match(map,/if\(now-lastSceneSample<period\)return droneScene/);
  assert.match(map,/observeV2DroneScene\(map\.queryRenderedFeatures\(bounds\)\|\|\[\],point,heading\)/);
  assert.match(map,/const scene=sampleDroneScene\(d,route,now\)/);
  assert.match(map,/center:shiftDroneView\(center,heading,drone\.sideMeters\)/);
  assert.match(map,/drone\?\.pointHalfLife/);
  assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return base/);
});
