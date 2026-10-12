import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteTimeline,sampleRoute,distanceOnRoute,previewMetersPerSecond,nextManeuver} from './routeAnimation.js';
const points=[[-46.7,-23.6],[-46.699,-23.6],[-46.699,-23.599]];
const timeline=buildRouteTimeline({type:'LineString',coordinates:points});
test('preview interpolates inside segments rather than jumping street to street',()=>{
 assert.ok(timeline.total>210);
 const start=sampleRoute(timeline,0),mid=sampleRoute(timeline,timeline.cumulative[1]/2),turn=sampleRoute(timeline,timeline.cumulative[1]+6),end=sampleRoute(timeline,timeline.total);
 assert.deepEqual(start.point,points[0]);assert.ok(mid.point[0]>points[0][0]&&mid.point[0]<points[1][0]);
 assert.ok(turn.point[1]>points[1][1]);assert.deepEqual(end.point,points[2]);
 assert.ok(start.bearing>65&&start.bearing<115);assert.ok(turn.bearing<25||turn.bearing>335);
 assert.equal(end.remaining,0);
});
test('route progression is stable and clamped',()=>{
 assert.equal(sampleRoute(timeline,-500).progress,0);assert.equal(sampleRoute(timeline,1e12).progress,timeline.total);
 assert.ok(Math.abs(distanceOnRoute(timeline,points[1])-timeline.cumulative[1])<1);
 assert.equal(sampleRoute(buildRouteTimeline({type:'LineString',coordinates:[]}),30),null);
});
test('preview time is visibly animated but is never the estimated travel time',()=>{
 assert.ok(previewMetersPerSecond(1000,10)>0);
 assert.ok(previewMetersPerSecond(1000,100)>0);
});
test('maneuvers and lanes only use provider data',()=>{
 const route={steps:[{location:points[0],instruction:'Siga em frente',modifier:'straight'},
 {location:points[1],instruction:'Vire à esquerda',modifier:'left',lanes:[{valid:false,indications:['straight']},{valid:true,indications:['left']}]}]};
 const start=nextManeuver(route,timeline,0);assert.equal(start.instruction,'Vire à esquerda');assert.equal(start.lanes.length,2);
 assert.deepEqual(nextManeuver({steps:[]},timeline,10).lanes,[]);
});
