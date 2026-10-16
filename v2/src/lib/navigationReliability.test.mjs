import test from 'node:test';
import assert from 'node:assert/strict';
import {createManeuverTracker} from './maneuverTracker.js';
import {evaluateRouteDeviation} from './routeDeviation.js';
import {spokenCue} from './offlineGuidance.js';

const base=[-46.7,-23.6];
const east=meters=>meters/(111320*Math.cos(base[1]*Math.PI/180));
const north=meters=>meters/111320;
const start=base;
const left=[base[0]+east(100),base[1]];
const right=[left[0],left[1]+north(10)];
const finish=[right[0]+east(65),right[1]];
const route={geometry:{type:'LineString',coordinates:[start,left,right,finish]},steps:[
 {location:start,type:'depart',instruction:'Siga pela via',modifier:'straight'},
 {location:left,type:'turn',instruction:'Vire à esquerda',modifier:'left'},
 {location:right,type:'turn',instruction:'Vire à direita',modifier:'right'},
 {location:finish,type:'arrive',instruction:'Você chegou'}
]};
test('closely spaced maneuvers are announced together without swapping the first one early',()=>{
 const tracker=createManeuverTracker(route);
 const at40=tracker.update([start[0]+east(40),start[1]],{accuracy:6,speed:9,heading:90,sourceAt:1000});
 assert.equal(at40.stepIndex,1);
 assert.equal(at40.following.stepIndex,2);
 assert.ok(at40.following.gapMeters<13);
 const cue=spokenCue(at40,{speed:9});
 assert.equal(cue.stage,'soon');
 assert.match(cue.text,/esquerda.+logo em seguida.+direita/i);
 assert.equal(cue.followingIndex,2);
 const justBefore=tracker.update([start[0]+east(98),start[1]],{accuracy:6,speed:8,heading:90,sourceAt:2000});
 assert.equal(justBefore.stepIndex,1,'10m lookahead must not prematurely switch to right');
 const atCorner=tracker.update(left,{accuracy:6,speed:5,heading:90,sourceAt:3000});
 assert.equal(atCorner.stepIndex,1);
 const afterTurn=tracker.update([left[0],left[1]+north(6)],{accuracy:6,speed:5,heading:0,sourceAt:4000});
 assert.equal(afterTurn.stepIndex,2,'a real, heading-confirmed left turn unlocks the next right');
});
test('poor heading requires corroborating GPS fixes before advancing',()=>{
 const tracker=createManeuverTracker(route);
 tracker.update([left[0]-east(8),left[1]],{accuracy:12,speed:4,sourceAt:1000});
 const once=tracker.update([left[0],left[1]+north(6)],{accuracy:12,speed:4,heading:null,sourceAt:2000});
 assert.equal(once.stepIndex,1);
 const again=tracker.update([left[0],left[1]+north(9)],{accuracy:12,speed:4,heading:null,sourceAt:3000});
 assert.equal(again.stepIndex,2);
});
test('uncertain/off-route GPS cannot progress maneuvers or fabricate a turn',()=>{
 const tracker=createManeuverTracker(route);
 const good=tracker.update([start[0]+east(80),start[1]],{accuracy:8,speed:6,sourceAt:1000});
 const poor=tracker.update(right,{accuracy:90,speed:6,heading:0,sourceAt:2000});
 assert.equal(poor.stepIndex,good.stepIndex);
 const offRoad=tracker.update([left[0]+east(40),left[1]+north(60)],{accuracy:7,sourceAt:3000});
 assert.equal(offRoad.stepIndex,good.stepIndex);
});
test('reroute requires two coherent GPS fixes, then triggers without 25s waiting',()=>{
 let state={outsideSince:0,outsideCount:0,lastFixAt:0,lastAttempt:0};
 let result=evaluateRouteDeviation(state,{distance:135,accuracy:8,sourceAt:1000,now:1000});
 assert.equal(result.reroute,false,'even a large single jump is insufficient');
 state=result.state;
 result=evaluateRouteDeviation(state,{distance:70,accuracy:8,sourceAt:1650,now:1650});
 assert.equal(result.reroute,true,'second confirmed GPS fix can initiate reroute');
 assert.equal(result.state.lastAttempt,1650);
 state=result.state;
 result=evaluateRouteDeviation(state,{distance:70,accuracy:8,sourceAt:2300,now:2300});
 assert.equal(result.reroute,false);
 result=evaluateRouteDeviation(result.state,{distance:70,accuracy:8,sourceAt:2900,now:2900});
 assert.equal(result.reason,'cooldown');
 assert.equal(result.reroute,false);
});
test('brief GPS error and return to route reset deviation confidence',()=>{
 const first=evaluateRouteDeviation({}, {distance:80,accuracy:7,sourceAt:1000,now:1000});
 const onRoute=evaluateRouteDeviation(first.state,{distance:5,accuracy:7,sourceAt:1600,now:1600});
 assert.equal(onRoute.state.outsideCount,0);
 assert.equal(evaluateRouteDeviation(onRoute.state,{distance:80,accuracy:90,sourceAt:2200,now:2200}).reroute,false);
});
