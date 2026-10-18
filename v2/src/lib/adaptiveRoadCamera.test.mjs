import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planAdaptiveRoadDistance} from './adaptiveRoadCamera.mjs';
import {inspectV2RoadAhead,planV2RearChase} from './v2DroneCamera.mjs';

const road={steps:[{type:'depart'},{type:'on ramp'},{type:'turn',modifier:'right'},{type:'roundabout'}]};
const args={enabled:true,vehicle:'carro',speed:16,accuracy:8,route:road,
  straightMeters:650};

test('user map: a proven long straight zooms out a LITTLE, with continuous micro steps',()=>{
 const near=planAdaptiveRoadDistance({...args,straightMeters:280,maneuver:{kind:'continue',distance:1000}});
 const medium=planAdaptiveRoadDistance({...args,straightMeters:420,maneuver:{kind:'continue',distance:1000}});
 const far=planAdaptiveRoadDistance({...args,maneuver:{kind:'continue',distance:1000}});
 assert.equal(near.zoomDelta,0);
 assert.ok(medium.zoomDelta<0&&medium.zoomDelta>-.3);
 assert.ok(far.zoomDelta<medium.zoomDelta&&far.zoomDelta>=-.39);
 assert.ok(far.microZoom>0&&far.microZoom<=.065);
 assert.equal(far.scenario,'straight');
 assert.ok(far.straightStrength>.99);
});

test('user map: close entrance/turn/junction override straight and get modest proximity',()=>{
 const straight=planAdaptiveRoadDistance({...args,maneuver:{kind:'continue',distance:1000}});
 const entrance=planAdaptiveRoadDistance({...args,maneuver:{stepIndex:1,kind:'on ramp',distance:100}});
 const turn=planAdaptiveRoadDistance({...args,maneuver:{stepIndex:2,kind:'turn',modifier:'right',distance:75}});
 const junction=planAdaptiveRoadDistance({...args,maneuver:{kind:'merge',distance:75}});
 const circle=planAdaptiveRoadDistance({...args,maneuver:{stepIndex:3,kind:'roundabout',distance:80}});
 assert.ok(straight.zoomDelta<0);
 assert.equal(entrance.scenario,'entrance');
 assert.ok(entrance.zoomDelta>.14&&entrance.zoomDelta<=.24);
 assert.ok(turn.zoomDelta>0&&turn.zoomDelta<.18);
 assert.ok(junction.zoomDelta>0&&junction.zoomDelta<.13);
 assert.ok(circle.zoomDelta<0&&circle.zoomDelta>-.1,'circle opens exits');
});

test('real map: a maneuver <=520m suppresses long-straight zoom completely',()=>{
 const close=planAdaptiveRoadDistance({...args,maneuver:{stepIndex:1,kind:'on ramp',distance:440}});
 const distant=planAdaptiveRoadDistance({...args,maneuver:{stepIndex:1,kind:'on ramp',distance:800}});
 assert.equal(close.straightStrength,0);
 assert.equal(close.zoomDelta,0);
 assert.ok(distant.zoomDelta<0);
});

test('user camera refuses aggressive zoom if GPS is bad, stale or route guidance absent',()=>{
 const options={...args,maneuver:{kind:'continue',distance:1000}};
 for(const a of [
   {...options,accuracy:76},
   {...options,accuracy:null},
   {...options,speed:0},
   {...options,vehicle:'a-pe'},
   {...options,enabled:false},
   {...options,maneuver:null},
   {...options,bendDegrees:34},
   {...options,straightMeters:0},
   {...options,reducedMotion:true}
 ]){
   assert.equal(planAdaptiveRoadDistance(a).zoomDelta,0);
 }
});

test('same shared straight heuristic gates simulation zoom while using gentler real offsets',()=>{
 const opts={...args,maneuver:{kind:'continue',distance:1000}};
 const sim=planAdaptiveRoadDistance({...opts,simulation:true});
 const user=planAdaptiveRoadDistance(opts);
 assert.equal(sim.straightStrength,user.straightStrength);
 assert.equal(sim.microZoom,user.microZoom);
 assert.equal(sim.zoomDelta,0,'simulation drone has its own bounded full zoom policy');
 const drone=planV2RearChase({...opts,straightAheadMeters:650});
 const noStraight=planV2RearChase({...opts,straightAheadMeters:0});
 assert.ok(drone.zoom<noStraight.zoom-.5);
});

test('real and simulated map share geometry inspector; curves never masquerade as a straight',()=>{
 const p=[-46.68,-23.58],coordinates=[];
 for(let i=0;i<=10;i++)coordinates.push([p[0],p[1]+i*80/111320]);
 const sample=inspectV2RoadAhead(p,{type:'LineString',coordinates});
 assert.ok(sample.available&&sample.straightMeters>=640);
 const bendCoords=coordinates.slice(0,3).concat([[-46.679,-23.58+160/111320]]);
 const bend=inspectV2RoadAhead(p,{type:'LineString',coordinates:bendCoords});
 assert.ok(bend.straightMeters<230);
 assert.deepEqual(p,[-46.68,-23.58]);
});

test('normal camera is enabled only in actual guidance; respects camera free-look',()=>{
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(map,/function realCameraDistance\(d,route,base,now\)/);
 assert.match(map,/!d\.navigation\|\|d\.simulationPreview/);
 assert.match(map,/now-realLastRoadAt>=1550/);
 assert.match(map,/realStraightMeters=sampled\?\.available\?sampled\.straightMeters:0/);
 assert.match(map,/return realCameraDistance\(d,route,base,now\)/);
 assert.match(map,/realZoom=damp\(realZoom,realZoomGoal,dt,realZoomGoal>realZoom\?460:1080\)/);
 assert.match(map,/const easingPending=Math\.abs\(realZoomGoal-realZoom\)>\.008/);
 assert.match(map,/if\(!active\|\|suspended\|\|!following\(\)\|\|freeLook\)return/);
 assert.match(map,/if\(suspended\|\|freeLook\|\|!following\(\)\)return/);
 assert.match(map,/droneZoom=droneZoom===null\?desiredZoom:damp\(/);
});
