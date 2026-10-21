import test from 'node:test';
import assert from 'node:assert/strict';
import {trafficRouteIndex,matchTrafficLine,routeTrafficEvidence,routeTrafficStops,routeTrafficGradient,TRAFFIC_COLORS,TRAFFIC_MAX_AGE,trafficSeverity,upcomingTrafficEvents,simplifyTrafficGeometry,trafficPointAt} from './routeTraffic.mjs';
const coords=Array.from({length:41},(_,i)=>[-46.75+i*.0005,-23.58]);
const geometry={type:'LineString',coordinates:coords};
const index=trafficRouteIndex(geometry),line={type:'LineString',coordinates:coords.slice(10,22)};
const time=1800000000000;
const payload=()=>({sampledAt:time,flow:[{geometry:line,currentKmh:12,freeFlowKmh:60,confidence:.9,observedAt:time}],incidents:[]});
test('matching rejects reverse carriageway, parallel road, point and a shortcut between route bends',()=>{
 assert.ok(matchTrafficLine(index,line));
 assert.equal(matchTrafficLine(index,{...line,coordinates:[...line.coordinates].reverse()}),null);
 assert.equal(matchTrafficLine(index,{...line,coordinates:line.coordinates.map(([x,y])=>[x,y+.00012])}),null);
 assert.equal(matchTrafficLine(index,{type:'Point',coordinates:coords[15]}),null);
 const bend={type:'LineString',coordinates:[[-46.75,-23.58],[-46.74,-23.58],[-46.74,-23.57]]};
 assert.equal(matchTrafficLine(trafficRouteIndex(bend),{type:'LineString',coordinates:[bend.coordinates[0],bend.coordinates[2]]}),null);
});
test('severe traffic is relative to free flow; zero speed is valid and not a speed limit',()=>{
 assert.equal(trafficSeverity(1),'flowing');assert.equal(trafficSeverity(.6),'slow');
 assert.equal(trafficSeverity(.3),'heavy');assert.equal(trafficSeverity(0),'stopped');
 const p=payload();p.flow[0].currentKmh=0;
 assert.equal(routeTrafficEvidence(index,p,time).segments[0].severity,'stopped');
 p.flow[0].currentKmh=25;p.flow[0].freeFlowKmh=25;
 assert.equal(routeTrafficEvidence(index,p,time).segments[0].severity,'flowing');
});
test('expired, low confidence and absent readings never claim clear traffic',()=>{
 assert.equal(routeTrafficEvidence(index,payload(),time+TRAFFIC_MAX_AGE).segments.length,0);
 const p=payload();p.flow[0].confidence=.4;
 assert.equal(routeTrafficEvidence(index,p,time).segments.length,0);
 assert.equal(routeTrafficEvidence(index,null,time).events.length,0);
 assert.deepEqual(routeTrafficStops(index),[[0,TRAFFIC_COLORS.unknown],[1,TRAFFIC_COLORS.unknown]]);
});
test('gradient preserves actual affected chainage and has short interpolated boundaries',()=>{
 const {segments}=routeTrafficEvidence(index,payload(),time);
 const stops=routeTrafficStops(index,segments),expression=routeTrafficGradient(stops);
 assert.equal(stops[0][1],TRAFFIC_COLORS.unknown);assert.equal(stops.at(-1)[1],TRAFFIC_COLORS.unknown);
 assert.ok(stops.some(([,color])=>color===TRAFFIC_COLORS.stopped));
 assert.ok(stops.length>=8);
 assert.ok(stops.every(([x],i)=>i===0||x>stops[i-1][0]));
 assert.deepEqual(expression.slice(0,3),['interpolate',['linear'],['line-progress']]);
 const affected=segments[0];assert.ok(Math.abs(affected.start-.25)<.0001);
 assert.ok(Math.abs(affected.end-.525)<.0001);
 const curved={type:'LineString',coordinates:[[-46,-40],[-45,-40],[-45,-39]]};
 const ci=trafficRouteIndex(curved);assert.ok(ci.totalUnits>0);
 assert.deepEqual(trafficPointAt(ci,0),curved.coordinates[0]);
});
test('incident cause replaces overlapping flow bubble without adding delays or ETA',()=>{
 const p=payload();p.incidents=[{id:'tomtom-works',name:'Obras',incidentCategory:'roadworks',roadGeometry:line,delaySeconds:180}];
 const evidence=routeTrafficEvidence(index,p,time);
 assert.equal(evidence.events.length,1);assert.equal(evidence.events[0].category,'roadworks');
 assert.equal(evidence.events[0].delaySeconds,180);assert.deepEqual(evidence.incidentIds,['tomtom-works']);
 assert.equal('eta' in evidence,false);assert.equal('duration' in evidence,false);
});
test('upcoming bubbles exclude passed events and cluster by zoom with closure priority',()=>{
 const events=[{id:'a',category:'jam',startMeters:100,endMeters:200},
 {id:'b',category:'roadclosed',startMeters:150,endMeters:250},
 {id:'c',category:'roadworks',startMeters:1000,endMeters:1200}];
 assert.deepEqual(upcomingTrafficEvents(events,0,{zoom:15}).map(e=>e.id),['b','c']);
 assert.deepEqual(upcomingTrafficEvents(events,400).map(e=>e.id),['c']);
 assert.equal(upcomingTrafficEvents(events,1300).length,0);
});
test('submission is bounded and rounded; invalid coordinates never create a route index',()=>{
 const dense=trafficRouteIndex({type:'LineString',coordinates:Array.from({length:5000},(_,i)=>[-46.75+i*.000001,-23.58])});
 const compact=simplifyTrafficGeometry(dense);assert.ok(compact.coordinates.length<=650);
 assert.deepEqual(compact.coordinates.at(-1),dense.points.at(-1));
 assert.ok(JSON.stringify({geometry:compact,vehicle:'carro',fromMeters:0}).length<32768);
 assert.equal(trafficRouteIndex({type:'LineString',coordinates:[[0,0],[Infinity,0]]}),null);
});
