import test from 'node:test';
import assert from 'node:assert/strict';
import {maneuverCategory,planManeuverCamera} from './navigationCameraPlanner.js';
import {cameraTarget,CAMERA_STATES} from './navigationMotion.js';

const p=[-46.69,-23.59];
const route={geometry:{type:'LineString',coordinates:[p,[-46.68,-23.59]]},
 steps:[
  {type:'depart',modifier:'straight',location:p,distance:150},
  {type:'turn',modifier:'right',location:[-46.686,-23.59],distance:220},
  {type:'off ramp',modifier:'slight right',location:[-46.685,-23.59],distance:90},
  {type:'roundabout',modifier:'left',location:[-46.684,-23.59],distance:180},
  {type:'arrive',location:[-46.68,-23.59],distance:0},
 ]};
const guidance=(stepIndex,distance)=>({stepIndex,distance,kind:route.steps[stepIndex].type,modifier:route.steps[stepIndex].modifier});

test('real provider maneuver kinds map into intentional camera policies',()=>{
 for(const [type,modifier,category] of [
  ['turn','right','turn'],['turn','slight left','turn'],
  ['off ramp','right','ramp'],['on-ramp','left','ramp'],
  ['fork','right','junction'],['merge','right','junction'],
  ['roundabout','right','roundabout'],['rotary','left','roundabout'],
  ['turn','uturn','uturn'],['arrive','','arrival'],
  ['depart','straight','continue'],['continue','straight','continue']
 ])assert.equal(maneuverCategory({type,modifier}),category,type);
});

test('opening starts early, is monotonic near a real exit and relaxes far away',()=>{
 const distant=planManeuverCamera({navigation:true,route,maneuver:guidance(2,1200),speed:24,accuracy:7});
 const approaching=planManeuverCamera({navigation:true,route,maneuver:guidance(2,240),speed:24,accuracy:7});
 const near=planManeuverCamera({navigation:true,route,maneuver:guidance(2,38),speed:24,accuracy:7});
 assert.equal(distant.strength,0);
 assert.ok(approaching.strength>0&&approaching.strength<near.strength);
 assert.ok(near.zoomOut>approaching.zoomOut);
 assert.ok(near.pitchDrop>approaching.pitchDrop);
 assert.ok(near.lookAheadScale<approaching.lookAheadScale);
 assert.equal(near.phase,'executing');
});

test('GPS uncertainty reduces camera movement instead of zooming erratically',()=>{
 const good=planManeuverCamera({navigation:true,route,maneuver:guidance(3,55),speed:8,accuracy:8});
 const poor=planManeuverCamera({navigation:true,route,maneuver:guidance(3,55),speed:8,accuracy:85});
 const unusable=planManeuverCamera({navigation:true,route,maneuver:guidance(3,55),speed:8,accuracy:180});
 assert.ok(good.strength>poor.strength);
 assert.equal(unusable.strength,0);
 assert.equal(unusable.zoomOut,0);
 assert.equal(poor.unstable,true);
});

test('reduce motion avoids maneuver zoom and pitch jumps, retaining instructions',()=>{
 const result=planManeuverCamera({navigation:true,route,maneuver:guidance(1,25),speed:12,reducedMotion:true});
 assert.ok(result.strength>0);
 assert.equal(result.zoomOut,0);
 assert.equal(result.pitchDrop,0);
});

test('cameraTarget applies focus but never alters the true vehicle GPS coordinate',()=>{
 const maneuverPlan=planManeuverCamera({navigation:true,route,maneuver:guidance(2,65),speed:16,accuracy:5});
 const telemetry={speed:16,heading:90,accuracy:5};
 const regular=cameraTarget({navigation:true,position:p,route,telemetry});
 const focused=cameraTarget({navigation:true,position:p,route,telemetry,maneuverPlan});
 assert.ok(focused.zoom<regular.zoom);
 assert.ok(focused.pitch<regular.pitch);
 assert.equal(focused.state,CAMERA_STATES.TURN);
 assert.deepEqual(p,[-46.69,-23.59]);
 assert.ok(focused.center.every(Number.isFinite));
 const compact=cameraTarget({navigation:true,position:p,route,telemetry,maneuverPlan,compactViewport:true});
 assert.ok(compact.pitch<=22&&compact.zoom<=16.5);
});
test('invalid or missing provider maneuver must not create any camera choreography',()=>{
 for(const guidanceValue of [null,{stepIndex:1,distance:null},{stepIndex:1,distance:NaN}]){
  assert.equal(planManeuverCamera({navigation:true,route,maneuver:guidanceValue}).strength,0);
 }
 assert.equal(planManeuverCamera({navigation:false,route,maneuver:guidance(1,10)}).strength,0);
 assert.equal(planManeuverCamera({navigation:true,route,maneuver:guidance(0,30)}).strength,0);
});

test('camera never hides free-driving location under a floating address card at speed',()=>{
 const gps=[-46.68,-23.58];
 const telemetry={speed:30,heading:90,accuracy:7};
 const unrestricted=cameraTarget({navigation:true,position:gps,telemetry});
 const hidden=cameraTarget({navigation:true,position:gps,telemetry,viewportClearancePx:0});
 const tight=cameraTarget({navigation:true,position:gps,telemetry,viewportClearancePx:18});
 assert.deepEqual(hidden.center,gps);
 assert.ok(tight.center[0]>gps[0]);
 assert.ok(tight.center[0]<unrestricted.center[0]);
 const metersPerPixel=156543.03392*Math.cos(gps[1]*Math.PI/180)/Math.pow(2,tight.zoom);
 const earthMetersPerLonDegree=111320*Math.cos(gps[1]*Math.PI/180);
 const eastMeters=(tight.center[0]-gps[0])*earthMetersPerLonDegree;
 assert.ok(eastMeters<=18*metersPerPixel*.72,'look-ahead is shorter than the safe projected distance');
});
