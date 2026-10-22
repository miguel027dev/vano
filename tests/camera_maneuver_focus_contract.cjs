'use strict';
// Contract for the /mapa turn-approach camera. Run with: node tests/camera_maneuver_focus_contract.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const map=fs.readFileSync('static/vano-map.js','utf8');
const start=map.indexOf('function cameraManeuverFocus(');
const end=map.indexOf('function cameraUrbanContext(',start);
assert.ok(start>=0&&end>start,'Maneuver focus helper must exist');
const helper=map.slice(start,end);

function scenario(modifier='right',exitBearing=90){
 const route={id:'route-a',steps:[{type:'depart',distance:400},{type:'turn',modifier,distance:480}]};
 const context={
  selectedRoute:route,routeTotalGeometry:1000,
  routeClientKey:r=>r?.id||'',
  routeBearingAtDistance:d=>d<400?0:exitBearing
 };
 vm.createContext(context);
 vm.runInContext("let cameraManeuverMemory={routeKey:'',holdUntil:0,holdStrength:0,turnAt:-1};\n"+helper,context);
 const run=(remaining,ts=100,speed=12,stepIndex=0)=>{
  const distanceAlong=stepIndex?400:400-remaining;
  return context.cameraManeuverFocus({distanceAlong},{stepIndex,remainingInStep:remaining},speed,ts);
 };
 return{context,run};
}
const a=scenario();
assert.equal(a.run(370,100),null,'Far from a turn, camera must not focus');
const preparing=a.run(240,150);
assert.ok(preparing?.preparing&&preparing.strength===0,'Approach must not zoom out before focus begins');
const early=a.run(115,200),near=a.run(30,400),atTurn=a.run(16,600);
assert.ok(early&&early.strength>0&&early.strength<.6,'Focus should start gradually');
assert.ok(near&&near.strength>early.strength,'Closer turns must progressively zoom in');
assert.ok(atTurn&&atTurn.strength>=near.strength,'Camera should remain near at the junction');
const justAfter=a.run(300,790,12,1);
assert.ok(justAfter?.held&&justAfter.strength>0,'Hold focus briefly after entering the new road');
assert.equal(a.run(300,2000,12,1),null,'Focus should release after the turn');
const left=scenario('left',270);
assert.ok(left.run(28,400)?.strength>.65,'Left turns get the same focus as right turns');
const contradictory=scenario('right',270);
assert.equal(contradictory.run(28,400),null,'Do not focus on an inconsistent direction');
const straight=scenario('right',0);
assert.equal(straight.run(28,400),null,'Do not zoom into a bendless route');
const changed=scenario();
changed.run(18,100);
changed.context.selectedRoute={id:'route-b',steps:[]};
assert.equal(changed.run(300,180,12,1),null,'Reroute must invalidate retained camera focus');
assert.ok(map.includes("location.pathname.toLowerCase().replace(/\\/+$/,'')!=='/v2'?cameraManeuverFocus("),'Experimental /v2 camera must remain separate');
assert.ok(map.includes('+(maneuverFocus?.strength||0)*.62'),'Turn focus must affect actual zoom target');
assert.ok(map.includes('pitch=Math.max(pitch,tune.pitchCruise,48+extra*maneuverFocus.strength)'),'Turn focus must affect camera tilt');
assert.ok(map.includes('Math.min(tune.zoomMax,zoom)'),'Final zoom clamp must honor vehicle tuning');
console.log('PASS: focus timing, directions, confidence, post-turn hold, reroute reset and camera integration');
