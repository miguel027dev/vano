import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planMotorcycleCamera,motorcycleManeuverChain,MOTO_CAMERA_PHASES} from './motorcycleCamera.js';
import {cameraTarget} from './navigationMotion.js';
import {computeSafeViewport} from './safeViewport.js';

const coords=[[-46.69,-23.59],[-46.685,-23.59],[-46.684,-23.59],[-46.68,-23.59]];
const route={
  id:'safe',geometry:{type:'LineString',coordinates:coords},
  steps:[
    {type:'depart',modifier:'straight',location:coords[0]},
    {type:'turn',modifier:'right',location:coords[1]},
    {type:'turn',modifier:'left',location:coords[2]},
    {type:'arrive',location:coords[3]}
  ]
};
const m=(stepIndex,distance)=>({stepIndex,distance,kind:route.steps[stepIndex].type,modifier:route.steps[stepIndex].modifier});

test('Moto Focus computes consecutive maneuvers along provider route geometry, not screen pixels',()=>{
 const chain=motorcycleManeuverChain(route);
 assert.equal(chain.length,3);
 assert.deepEqual(chain.map(x=>x.index),[1,2,3]);
 assert.ok(chain[1].at>chain[0].at&&chain[2].at>chain[1].at);
 assert.deepEqual(motorcycleManeuverChain(route),chain);
 assert.deepEqual(motorcycleManeuverChain(null),[]);
});

test('Moto Focus opens smoothly as GPS approaches a turn, then stabilizes through it',()=>{
 const far=planMotorcycleCamera({navigation:true,route,maneuver:m(1,900),speed:14,accuracy:8});
 const approach=planMotorcycleCamera({navigation:true,route,maneuver:m(1,110),speed:14,accuracy:8});
 const near=planMotorcycleCamera({navigation:true,route,maneuver:m(1,30),speed:14,accuracy:8});
 assert.equal(far.strength,0);
 assert.equal(far.phase,MOTO_CAMERA_PHASES.FOLLOW);
 assert.ok(approach.strength>0&&near.strength>approach.strength);
 assert.ok(near.zoomOut>approach.zoomOut);
 assert.ok(near.pitchDrop>approach.pitchDrop);
 assert.equal(near.phase,MOTO_CAMERA_PHASES.HOLD);
 assert.equal(near.holdChainStep,2);
});

test('two tightly spaced street turns keep the Moto camera open across provider step changes',()=>{
 const first=planMotorcycleCamera({navigation:true,route,maneuver:m(1,35),speed:14,accuracy:6,nowMs:1000});
 const next=planMotorcycleCamera({navigation:true,route,maneuver:m(2,94),speed:14,accuracy:6,nowMs:1016,previous:first});
 const nextSteady=planMotorcycleCamera({navigation:true,route,maneuver:m(2,87),speed:14,accuracy:6,nowMs:1032,previous:next});
 assert.equal(first.holdChainStep,2);
 assert.equal(next.phase,MOTO_CAMERA_PHASES.HOLD);
 assert.equal(nextSteady.phase,MOTO_CAMERA_PHASES.HOLD);
 assert.ok(nextSteady.strength>0.52,'avoid close/reopen flutter');
});

test('Moto GPS guard has priority over rapid sequences and stops aggressive opening',()=>{
 const first=planMotorcycleCamera({navigation:true,route,maneuver:m(1,20),speed:16,accuracy:7,nowMs:1000});
 const unreliable=planMotorcycleCamera({navigation:true,route,maneuver:m(2,25),speed:16,accuracy:170,nowMs:1016,previous:first});
 assert.equal(unreliable.phase,MOTO_CAMERA_PHASES.GPS_GUARD);
 assert.equal(unreliable.strength,0);
 assert.equal(unreliable.zoomOut,0);
 assert.equal(unreliable.pitchDrop,0);
 assert.equal(unreliable.unstable,true);
 const medium=planMotorcycleCamera({navigation:true,route,maneuver:m(1,20),speed:16,accuracy:85});
 assert.ok(medium.strength<first.strength);
});

test('reduced motion preserves provider route state but does not animate maneuvers',()=>{
 const p=planMotorcycleCamera({navigation:true,route,maneuver:m(1,20),speed:12,accuracy:6,reducedMotion:true});
 assert.ok(p.strength>0);
 assert.equal(p.zoomOut,0);
 assert.equal(p.pitchDrop,0);
 assert.equal(cameraTarget({position:coords[0],navigation:true,vehicle:'moto',route,
  telemetry:{speed:12,heading:90,accuracy:5},reducedMotion:true,maneuverPlan:p}).pitch,0);
});

test('a motorcycle never visually follows jittering direction while stopped or poorly located',()=>{
 const position=coords[0];
 const stationary=cameraTarget({position,navigation:true,vehicle:'moto',route,telemetry:{speed:0,heading:175,accuracy:8}});
 const inaccurate=cameraTarget({position,navigation:true,vehicle:'moto',route,telemetry:{speed:15,heading:210,accuracy:130}});
 assert.equal(stationary.bearing,null);
 assert.equal(inaccurate.bearing,null);
 const moving=cameraTarget({position,navigation:true,vehicle:'moto',route,telemetry:{speed:13,heading:90,accuracy:8}});
 assert.ok(Number.isFinite(moving.bearing));
 assert.ok(moving.pitch<32);
 const car=cameraTarget({position,navigation:true,vehicle:'carro',route,telemetry:{speed:13,heading:90,accuracy:8}});
 assert.ok(car.pitch>moving.pitch,'car keeps existing zoom/pitch treatment');
});

test('Moto Focus stays dormant in car mode, idle mode, and missing provider maneuvers',()=>{
 const noNav=planMotorcycleCamera({navigation:false,route,maneuver:m(1,30),speed:16});
 assert.equal(noNav.strength,0);
 assert.equal(noNav.phase,MOTO_CAMERA_PHASES.FOLLOW);
 for(const value of [null,{stepIndex:1,distance:null},{stepIndex:1,distance:NaN}]){
  assert.equal(planMotorcycleCamera({navigation:true,route,maneuver:value}).strength,0);
 }
 const viewport=computeSafeViewport({width:360,height:720});
 assert.equal(viewport.mode,'free');
});

test('Moto anchor is below normal within safe space, not behind top/bottom cards',()=>{
 for(const [width,height] of [[320,568],[360,640],[393,852],[430,932],[844,390],[568,280]]){
  const top=height<400?94:150,bottom=height<400?85:160;
  const overlays=[{edge:'top',top:0,bottom:top},{edge:'bottom',top:height-bottom,bottom:height}];
  const regular=computeSafeViewport({width,height,overlays,navigation:true});
  const moto=computeSafeViewport({width,height,overlays,navigation:true,motorcycle:true});
  assert.ok(moto.centerY>=regular.centerY);
  assert.ok(moto.visibleHeight>0);
  assert.ok(moto.centerY>moto.padding.top&&moto.centerY<height-moto.padding.bottom);
  assert.ok(moto.maxBehindPx>=0);
 }
});

test('Moto Follow gets a smaller screen-safe lookahead without inventing GPS',()=>{
 const input=coords[0],telemetry={speed:22,accuracy:9,heading:90};
 const moto=cameraTarget({position:input,route,navigation:true,vehicle:'moto',telemetry,viewportClearancePx:20});
 const car=cameraTarget({position:input,route,navigation:true,vehicle:'carro',telemetry,viewportClearancePx:20});
 assert.ok(moto.center.every(Number.isFinite));
 assert.ok(car.center.every(Number.isFinite));
 assert.deepEqual(input,coords[0]);
 assert.ok(moto.zoom<=car.zoom+0.5);
});

test('React integration uses only one animation writer, motorbike marker and real GPS',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 assert.match(map,/planMotorcycleCamera\(/);
 assert.match(map,/motoPlan=planMotorcycleCamera/);
 assert.match(map,/d\.vehicle==='moto'&&d\.navigation/);
 assert.match(map,/map\.jumpTo\(\{\.\.\.pose,padding:/);
 assert.match(map,/motorcycle:vehicle==='moto'/);
 assert.match(map,/map\._vanoVehicleKind!==d\.vehicle/);
 assert.match(map,/const realDriving=d\.navigation&&!d\.simulationPreview&&!d\.droneSimulation/);
 assert.match(map,/preferLiveHeading:Boolean\(d\.navigation&&!d\.simulationPreview&&!d\.droneSimulation\)/);
 assert.match(page,/is-moto-navigation/);
 assert.match(page,/vehicle:routeVehicle,language/);
 assert.match(page,/vehicle:routeVehicle,layer,muted/);
 assert.match(main,/v48-moto-focus\.css/);
});
