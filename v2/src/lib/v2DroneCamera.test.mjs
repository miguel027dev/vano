import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planV2DroneCamera,V2_DRONE_PLAYBACK_RATE,observeV2DroneScene,shiftDroneView,chooseV2UrbanCamera,planV2RampApproach,v2UserCenteredRampView,planV2RearChase,inspectV2RoadAhead} from './v2DroneCamera.mjs';
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
  assert.match(map,/const view=shiftDroneView\(center,heading,drone\.sideMeters\)/);
  assert.match(map,/urbanBlend=damp\(urbanBlend,urbanMode==='v2'\?1:0,dtMix,450\)/);
  assert.match(map,/drone\?\.pointHalfLife/);
  assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return base/);
});

test('hybrid V2 Sim chooses classic V1 on open roads, urban V2 around buildings',()=>{
 const open=chooseV2UrbanCamera({enabled:true,density:.1,mode:'v1',nowMs:5000});
 assert.deepEqual(open,{mode:'v1',changed:false});
 const dense=chooseV2UrbanCamera({enabled:true,density:.72,mode:'v1',nowMs:5000});
 assert.deepEqual(dense,{mode:'v2',changed:true});
 const urbanStable=chooseV2UrbanCamera({enabled:true,density:.35,mode:'v2',nowMs:7000,lastSwitchAt:5000});
 assert.equal(urbanStable.mode,'v2');
 const backOpen=chooseV2UrbanCamera({enabled:true,density:.15,mode:'v2',nowMs:9000,lastSwitchAt:5000});
 assert.deepEqual(backOpen,{mode:'v1',changed:true});
});
test('hysteresis and minimum hold prevent rapid V1/V2 toggles',()=>{
 for(const density of [.23,.25,.42,.45]){
   assert.equal(chooseV2UrbanCamera({enabled:true,density,mode:'v1',nowMs:6000}).mode,'v1');
 }
 assert.equal(chooseV2UrbanCamera({enabled:true,density:.7,mode:'v1',
   nowMs:1100,lastSwitchAt:500}).mode,'v1');
 assert.equal(chooseV2UrbanCamera({enabled:true,density:.1,mode:'v2',
   nowMs:2200,lastSwitchAt:900}).mode,'v2');
 assert.equal(chooseV2UrbanCamera({enabled:false,density:1,mode:'v2',
   nowMs:4000}).mode,'v1');
});

test('approaching a ramp at 100m makes camera near user icon without excessive zoom',()=>{
 const args={enabled:true,vehicle:'carro',route};
 const far=planV2RampApproach({...args,maneuver:maneuver(2,230)});
 const entering=planV2RampApproach({...args,maneuver:maneuver(2,150)});
 const near100=planV2RampApproach({...args,maneuver:maneuver(2,100)});
 const close=planV2RampApproach({...args,maneuver:maneuver(2,65)});
 assert.equal(far.active,false);
 assert.ok(entering.active);
 assert.ok(near100.strength>.80,'at 100m, smoothly near the icon');
 assert.ok(near100.strength>entering.strength);
 assert.ok(close.strength>=near100.strength);
 assert.ok(near100.zoom>=17.5&&near100.zoom<=18.18);
 assert.ok(near100.lookAheadMeters<=26);
 assert.ok(near100.pitch>=45&&near100.pitch<=55);
});

test('ramp close-up requires explicit provider entrance/exit, never nearby route lines',()=>{
 const args={enabled:true,vehicle:'carro',route};
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(0,30)}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(1,30)}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(3,30)}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:null}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:{stepIndex:2,distance:null}}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(2,180)}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(2,100),enabled:false}).active,false);
 assert.equal(planV2RampApproach({...args,maneuver:maneuver(2,100),vehicle:'a-pe'}).active,false);
});

test('user-icon close-up uses marker coordinates and marker direction exclusively',()=>{
 const marker=[-46.68,-23.58],east=v2UserCenteredRampView(marker,90,23);
 const eastMeters=(east[0]-marker[0])*111320*Math.cos(marker[1]*Math.PI/180);
 assert.ok(eastMeters>22.9&&eastMeters<23.1);
 assert.ok(Math.abs(east[1]-marker[1])<.000001);
 const north=v2UserCenteredRampView(marker,0,23);
 assert.ok(north[1]>marker[1]);
 assert.deepEqual(v2UserCenteredRampView(marker,null,23),marker);
 assert.deepEqual(v2UserCenteredRampView(marker,NaN,23),marker);
 assert.deepEqual(marker,[-46.68,-23.58]);
 assert.equal(v2UserCenteredRampView(null,20,12),null);
});

test('small-screen and reduced-motion ramp framing is limited and reversible',()=>{
 const args={enabled:true,vehicle:'moto',route,maneuver:maneuver(2,100)};
 const mobile=planV2RampApproach({...args,compactViewport:true});
 assert.ok(mobile.zoom<=17.75&&mobile.lookAheadMeters<=14);
 assert.ok(mobile.pitch<=45);
 const reduced=planV2RampApproach({...args,reducedMotion:true});
 assert.equal(reduced.pitch,0);
 assert.ok(reduced.zoom<=17.0);
 const after=planV2RampApproach({...args,maneuver:maneuver(0,500)});
 assert.equal(after.active,false,'normal camera takes back control after maneuver');
});

test('V2 Sim entry close-up anchors to the animated user icon in open and dense corridors',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/const ramp=planV2RampApproach\(/);
 assert.match(map,/const userPuck=validPoint\(d\.motionCoords\)\?d\.motionCoords:d\.gpsCoords/);
 assert.match(map,/v2UserCenteredRampView\(\s*userPuck,markerHeading,chase\.lookAheadMeters\s*\)/);
 assert.match(map,/if\(ramp\.active&&urbanBlend<\.001\)return rampCloseup\(base\)/);
 assert.match(map,/return rampCloseup\(\{\.\.\.base/);
 assert.match(map,/if\(urbanBlend<\.001\)return rampCloseup\(base\)/);
 assert.match(page,/simulationPreview=\{simActive\}/);
 assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
 assert.doesNotMatch(map.slice(map.indexOf('function rampCloseup(view)'),map.indexOf('if(ramp.active&&urbanBlend<.001)')),/nearestOnRoute|lookPos|snapTo|route\.geometry/);
});

test('V2 cinematic camera follows behind the vehicle throughout simulated journey',()=>{
 const base={enabled:true,vehicle:'carro',speed:11};
 const open=planV2RearChase({...base,urbanDensity:0});
 const urban=planV2RearChase({...base,urbanDensity:1,obstruction:.6});
 const ramp=planV2RearChase({...base,urbanDensity:.5,rampStrength:1});
 assert.equal(open.enabled,true);
 assert.ok(open.pitch>=48,'open areas retain a rear third-person angle');
 assert.ok(open.lookAheadMeters>=8&&open.lookAheadMeters<=18);
 assert.ok(urban.pitch<open.pitch,'dense buildings lower camera to avoid walls');
 assert.ok(ramp.zoom>open.zoom,'ramp approaches draw gently closer to the user');
 assert.ok(ramp.zoom<=18.18);
 assert.ok(ramp.lookAheadMeters<open.lookAheadMeters,'near entry avoid excessive forward focus');
 const notSimulated=planV2RearChase({...base,enabled:false});
 assert.equal(notSimulated.enabled,false);
 assert.equal(planV2RearChase({...base,vehicle:'a-pe'}).enabled,false);
});

test('very close building walls reduce camera pitch and keep reduced-motion accessible',()=>{
 const base={enabled:true,vehicle:'moto',compactViewport:true,urbanDensity:1};
 const noBlock=planV2RearChase(base);
 const blocked=planV2RearChase({...base,obstruction:1,rampStrength:1});
 assert.ok(blocked.pitch<noBlock.pitch);
 assert.ok(blocked.pitch>=30,'never jump below a stable safe pitch');
 assert.ok(blocked.zoom<=18.18);
 const accessible=planV2RearChase({...base,obstruction:1,reducedMotion:true});
 assert.equal(accessible.pitch,0);
 assert.equal(accessible.lookAheadMeters,0);
});

test('nearby building footprints directly behind the user trigger obstruction handling',()=>{
 const puck=[-46.68,-23.58];
 const polygon=(id,east,north,height=40)=>({
   id,layer:{id:'building-3d',type:'fill-extrusion'},properties:{height},
   geometry:{type:'Polygon',coordinates:[[
     [puck[0]+east-.00002,puck[1]+north-.00002],
     [puck[0]+east+.00002,puck[1]+north-.00002],
     [puck[0]+east+.00002,puck[1]+north+.00002],
     [puck[0]+east-.00002,puck[1]+north+.00002],
     [puck[0]+east-.00002,puck[1]+north-.00002]
   ]]}
 });
 const walls=[polygon('a',.00009,-.00018),polygon('b',-.0001,-.00027),polygon('c',.00008,-.0004)];
 const withWalls=observeV2DroneScene(walls,puck,0);
 assert.ok(withWalls.obstruction>=.9);
 const farInFront=observeV2DroneScene([polygon('d',.00005,.0008)],puck,0);
 assert.equal(farInFront.obstruction,0);
 assert.equal(observeV2DroneScene(null,puck,0).obstruction,0);
});

test('V2 simulated follow uses user pointer and keeps marker visible when terrain occludes it',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/const chase=planV2RearChase\(/);
 assert.match(map,/v2UserCenteredRampView\(\s*userPuck,markerHeading,chase\.lookAheadMeters\s*\)/);
 assert.match(map,/if\(urbanBlend<\.001\)return rampCloseup\(base\)/);
 assert.match(map,/return rampCloseup\(\{\.\.\.base/);
 assert.match(map,/getOccludedOpacity\?\.\(\)/);
 assert.match(map,/setOccludedOpacity\?\.\(visibility\)/);
 assert.match(map,/cinematic:Boolean\(latest\.current\.droneSimulation\)/);
 assert.match(map,/obstruction:map\._vanoV2UrbanObstruction\|\|0/);
 assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
 assert.doesNotMatch(page,/setUserCoords\(simPosition/);
});

const frameRoad=metres=>[-46.69,-23.56+metres/111320];
const straightRoad={type:'LineString',coordinates:[0,80,160,240,320,400,480,560,640,720].map(frameRoad)};
const turnRoad={type:'LineString',coordinates:[
 frameRoad(0),frameRoad(80),frameRoad(160),
 [-46.69+80/(111320*Math.cos(-23.56*Math.PI/180)),frameRoad(160)[1]],
 [-46.69+160/(111320*Math.cos(-23.56*Math.PI/180)),frameRoad(160)[1]]
]};

test('inspect actual straight line: 650m road permits wide preview, never moves user point',()=>{
 const point=frameRoad(12),copy=point.slice();
 const inspected=inspectV2RoadAhead(point,straightRoad);
 assert.equal(inspected.available,true);
 assert.ok(inspected.straightMeters>=600);
 assert.deepEqual(point,copy);
 assert.ok(inspectV2RoadAhead(frameRoad(12),turnRoad).straightMeters<220);
});

test('geometry guard: short routes, off-route, empty provider and huge lines fail conservative',()=>{
 assert.deepEqual(inspectV2RoadAhead(null,straightRoad),{available:false,straightMeters:0});
 assert.deepEqual(inspectV2RoadAhead(frameRoad(0),null),{available:false,straightMeters:0});
 assert.deepEqual(inspectV2RoadAhead([-46.70,-23.56],straightRoad),{available:false,straightMeters:0});
 assert.deepEqual(inspectV2RoadAhead(frameRoad(0),{coordinates:new Array(12001).fill(frameRoad(0))}),{available:false,straightMeters:0});
 assert.equal(inspectV2RoadAhead(frameRoad(0),{coordinates:[frameRoad(0),frameRoad(80)]}).straightMeters,80);
});

test('smart camera zooms OUT on a verified long straight but stays behind the marker',()=>{
 const base={enabled:true,vehicle:'carro',speed:16,urbanDensity:0,straightAheadMeters:640};
 const straight=planV2RearChase({...base,maneuver:{kind:'continue',distance:800}});
 const ordinary=planV2RearChase({...base,straightAheadMeters:0,maneuver:{kind:'continue',distance:800}});
 assert.equal(straight.scenario,'straight');
 assert.ok(straight.zoom<ordinary.zoom-.5);
 assert.ok(straight.zoom>=16.72&&straight.zoom<=18.18);
 assert.ok(straight.lookAheadMeters<=18&&straight.lookAheadMeters>0);
 assert.ok(straight.halfLife>ordinary.halfLife,'cruising relaxes gradually');
});

test('approaching entrance overrides long straight zoom and comes close around 100m',()=>{
 const base={enabled:true,vehicle:'carro',speed:16,straightAheadMeters:640,
   route:{steps:[{type:'off ramp'}]},maneuver:{stepIndex:0,distance:100,kind:'off ramp'}};
 const entrance=planV2RampApproach({...base});
 const near=planV2RearChase({...base,rampStrength:entrance.strength});
 const far=planV2RearChase({...base,maneuver:{kind:'continue',distance:800},rampStrength:0});
 assert.equal(near.scenario,'entrance');
 assert.ok(near.zoom>far.zoom+.5);
 assert.ok(near.lookAheadMeters<far.lookAheadMeters);
 assert.ok(near.zoom<=18.18&&near.lookAheadMeters>=5);
});

test('near turns and junctions zoom in, roundabouts widen to show the exits',()=>{
 const args={enabled:true,vehicle:'carro',speed:10,straightAheadMeters:610};
 const normal=planV2RearChase({...args,maneuver:{kind:'continue',distance:1200}});
 const turn=planV2RearChase({...args,maneuver:{kind:'turn',modifier:'right',distance:60}});
 const fork=planV2RearChase({...args,maneuver:{kind:'fork',distance:75}});
 const circle=planV2RearChase({...args,maneuver:{kind:'roundabout',distance:65}});
 assert.equal(turn.scenario,'turn');
 assert.equal(fork.scenario,'junction');
 assert.equal(circle.scenario,'roundabout');
 assert.ok(turn.zoom>normal.zoom);
 assert.ok(fork.zoom>normal.zoom);
 assert.ok(circle.pitch<turn.pitch,'roundabouts reveal more of exit geometry');
 assert.ok(circle.zoom<=turn.zoom);
});

test('uncertain GPS, stopped vehicle and approaching decisions disable aggressive distant zoom',()=>{
 const args={enabled:true,vehicle:'carro',speed:16,straightAheadMeters:650,maneuver:{kind:'continue',distance:900}};
 assert.equal(planV2RearChase({...args,accuracy:125}).straightStrength,0);
 assert.equal(planV2RearChase({...args,speed:0}).straightStrength,0);
 assert.equal(planV2RearChase({...args,bendDegrees:35}).straightStrength,0);
 assert.equal(planV2RearChase({...args,maneuver:{kind:'turn',modifier:'left',distance:150}}).straightStrength,0);
 assert.equal(planV2RearChase({...args,straightAheadMeters:0}).straightStrength,0);
});

test('compact/reduced motion and high-rise street preserve conservative chase framing',()=>{
 const args={enabled:true,vehicle:'moto',compactViewport:true,urbanDensity:.9,obstruction:1,speed:12,straightAheadMeters:620};
 const compact=planV2RearChase(args);
 const reduced=planV2RearChase({...args,reducedMotion:true});
 assert.ok(compact.zoom>=16.72&&compact.zoom<=18.18);
 assert.ok(compact.pitch>=30&&compact.pitch<=58);
 assert.ok(compact.lookAheadMeters>=5&&compact.lookAheadMeters<=18);
 assert.equal(reduced.pitch,0);
 assert.equal(reduced.lookAheadMeters,0);
 assert.ok(reduced.zoom<=17.45);
});

test('smart-road preview is throttled with building observations and never touches ordinary navigation',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/const roadAhead=inspectV2RoadAhead\(point,route\?\.geometry\)/);
 assert.match(map,/if\(now-lastSceneSample<period\)return droneScene/);
 assert.match(map,/straightAheadMeters:scene\.straightAheadMeters/);
 assert.match(map,/if\(!d\.droneSimulation\|\|!base\)return base/);
 assert.match(map,/droneSceneRoute=route\?\.geometry/);
 assert.match(page,/droneSimulation=\{simActive&&simCameraMode==='drone'\}/);
 assert.match(page,/simulationPreview=\{simActive\}/);
});
