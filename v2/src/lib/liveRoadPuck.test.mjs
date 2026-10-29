import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteTimeline,sampleRoute} from './routeAnimation.js';
import {matchLiveRoadPosition,bearingAtDrivenProgress} from './liveRoadPuck.mjs';
import {cameraTarget,metersBetween} from './navigationMotion.js';
import {easeGpsPoint} from './liveMotion.js';
import {readFileSync} from 'node:fs';

const start=[-46.68,-23.58];
const north=m=>m/111320;
const east=m=>m/(111320*Math.cos(start[1]*Math.PI/180));
const corner=[start[0]+east(70),start[1]];
const finish=[corner[0],corner[1]+north(60)];
const route={geometry:{type:'LineString',coordinates:[start,corner,finish]}};
const timeline=buildRouteTimeline(route.geometry);
const opts={route,timeline,vehicle:'carro',navigation:true,accuracy:8,speed:7,heading:90};

test('real GPS visually snaps from road edge to centerline, but raw sensor stays unchanged',()=>{
 const raw=[start[0]+east(25),start[1]+north(4)];
 const result=matchLiveRoadPosition({...opts,position:raw});
 assert.ok(result);
 assert.ok(result.distance===undefined);
 assert.ok(metersBetween(result.point,raw)>3);
 assert.ok(metersBetween(result.point,[raw[0],start[1]])<.1);
 assert.deepEqual(raw,[start[0]+east(25),start[1]+north(4)]);
 assert.ok(Math.abs(result.bearing-90)<1);
});

test('puck follows polyline THROUGH the intersection, not a diagonal shortcut',()=>{
 const before=matchLiveRoadPosition({...opts,position:[start[0]+east(63),start[1]+north(3)]});
 const after=matchLiveRoadPosition({...opts,position:[corner[0]+east(2),corner[1]+north(17)],heading:0,previous:before});
 assert.ok(before&&after);
 for(let meters=before.meters;meters<=after.meters;meters+=3){
   const p=sampleRoute(timeline,meters).point;
   const onHorizontal=Math.abs(p[1]-start[1])<1e-8;
   const onVertical=Math.abs(p[0]-corner[0])<1e-8;
   assert.ok(onHorizontal||onVertical,'screen animation must stay on centerline');
 }
 assert.ok(Math.abs(bearingAtDrivenProgress(timeline,before.meters)-90)<1);
 assert.ok(Math.abs(bearingAtDrivenProgress(timeline,after.meters))<1);
 assert.ok(Math.abs(bearingAtDrivenProgress(timeline,timeline.cumulative[1])-90)<1,'no early turn at exact junction');
});

test('do not glue GPS to another street, reverse lane, poor fix or non-driving mode',()=>{
 const away=[start[0]+east(18),start[1]+north(24)];
 assert.equal(matchLiveRoadPosition({...opts,position:away}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:[start[0]+east(20),start[1]+north(3)],heading:270}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:[start[0]+east(20),start[1]+north(3)],accuracy:80}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:start,vehicle:'a-pe'}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:start,navigation:false}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:start,simulation:true}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:null}),null);
});

test('stationary traffic light jitter does not drag the icon and wrong route leg does not teleport it',()=>{
 const a=[start[0]+east(26),start[1]+north(2)];
 const first=matchLiveRoadPosition({...opts,position:a,speed:0});
 const next=matchLiveRoadPosition({...opts,position:[a[0]+east(1.2),a[1]+north(1)],speed:0,previous:first});
 assert.strictEqual(next,first);
 const hairpin={geometry:{type:'LineString',coordinates:[
   start,[start[0]+east(70),start[1]],[start[0]+east(70),start[1]+north(10)],
   [start[0],start[1]+north(10)]
 ]}};
 const timeline2=buildRouteTimeline(hairpin.geometry);
 const jumped=matchLiveRoadPosition({...opts,route:hairpin,timeline:timeline2,position:[start[0]+east(25),start[1]+north(10)],heading:270,
   previous:{...first,meters:20,raw:[start[0]+east(25),start[1]]}});
 assert.equal(jumped,null,'nearby parallel return segment must not steal the marker');
});

test('live camera uses actual physical heading instead of future route bearing',()=>{
 const gps=[start[0]+east(65),start[1]];
 const old=cameraTarget({navigation:true,position:gps,route,telemetry:{speed:8,accuracy:6,heading:90}});
 const live=cameraTarget({navigation:true,position:gps,route,telemetry:{speed:8,accuracy:6,heading:90},preferLiveHeading:true});
 assert.equal(live.bearing,90);
 assert.ok(old.bearing>=0);
 const paused=cameraTarget({navigation:true,position:gps,route,telemetry:{speed:0,accuracy:8,heading:90},preferLiveHeading:true});
 assert.equal(paused.bearing,null,'traffic light must keep existing camera direction');
 const weak=cameraTarget({navigation:true,position:gps,route,telemetry:{speed:8,accuracy:100,heading:90},preferLiveHeading:true});
 assert.equal(weak.bearing,null);
});

test('real live position eases faster than before but never extrapolates stale coordinates',()=>{
 const a=[start[0]+east(5),start[1]],b=[start[0]+east(10),start[1]];
 const step=easeGpsPoint(a,b,60,{speed:12,accuracy:8});
 assert.ok(metersBetween(step,b)<4);
 assert.ok(metersBetween(step,b)>0);
 assert.deepEqual(easeGpsPoint(b,b,16,{speed:0}),b);
});

test('road center matching is ONLY visual; GPS guidance and preview remain sensor/route isolated',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/point=sampleRoute\(timeline,state\.roadMeters\)\?\.point/);
 assert.match(map,/point=easeGpsPoint\(state\.point,target,dt/);
 assert.match(map,/const realDriving=d\.navigation&&!d\.simulationPreview&&!d\.droneSimulation/);
 assert.match(map,/preferLiveHeading:Boolean\(d\.navigation&&!d\.simulationPreview&&!d\.droneSimulation\)/);
 assert.match(page,/const result=evaluateGpsPosition\(p,lastGpsFix\.current\)/);
 assert.doesNotMatch(page,/matchLiveRoadPosition/);
});


test('a stopped car stays on its confirmed route leg despite GPS choosing a lateral street',()=>{
 const first=matchLiveRoadPosition({...opts,
   position:[start[0]+east(65),start[1]+north(2)],speed:0});
 assert.ok(first);
 assert.equal(first.segment,0);
 const noisy=matchLiveRoadPosition({...opts,
   position:[corner[0]+east(1),corner[1]+north(8)],speed:0,heading:0,previous:first});
 assert.strictEqual(noisy,first,'a nearby side street must not steal the stopped car');
 assert.ok(Math.abs(noisy.point[1]-start[1])<1e-8);
 // The anchor must not move with each new noisy GPS callback.
 const noisyAgain=matchLiveRoadPosition({...opts,
   position:[corner[0]+east(1),corner[1]+north(12)],speed:0,previous:noisy});
 assert.strictEqual(noisyAgain,first);
});

test('a weak GPS reading preserves an already verified stopped road lock, but cannot invent a new lock',()=>{
 const first=matchLiveRoadPosition({...opts,position:[start[0]+east(38),start[1]+north(3)],speed:0});
 assert.ok(first);
 const weak=[start[0]+east(40),start[1]+north(19)];
 assert.strictEqual(matchLiveRoadPosition({...opts,position:weak,speed:0,accuracy:60,previous:first}),first);
 assert.equal(matchLiveRoadPosition({...opts,position:weak,speed:0,accuracy:60}),null);
 assert.equal(matchLiveRoadPosition({...opts,position:[start[0]+east(40),start[1]+north(70)],
   speed:0,accuracy:60,previous:first}),null);
});

test('a moving car can turn when sensor displacement actually confirms the new leg',()=>{
 const stopped=matchLiveRoadPosition({...opts,position:[start[0]+east(65),start[1]+north(3)],speed:0});
 const entering=matchLiveRoadPosition({...opts,position:[corner[0]+east(2),corner[1]+north(20)],
   speed:5,heading:0,previous:stopped});
 assert.ok(entering);
 assert.equal(entering.segment,1);
 assert.ok(entering.meters>stopped.meters+20);
});

test('follow camera stays on the visual GPS point while stopped or bearing is unreliable',()=>{
 const raw=[start[0]+east(36),start[1]+north(30)];
 const paused=cameraTarget({navigation:true,position:raw,route,
   telemetry:{speed:0,accuracy:60,heading:null},preferLiveHeading:true});
 assert.deepEqual(paused.center,raw,'no arbitrary 40 m offset when stationary');
 assert.equal(paused.bearing,null);
 const movingUncertain=cameraTarget({navigation:true,position:raw,route,
   telemetry:{speed:8,accuracy:90,heading:90},preferLiveHeading:true});
 assert.deepEqual(movingUncertain.center,raw,'route geometry must not move an unreliable GPS marker');
});
