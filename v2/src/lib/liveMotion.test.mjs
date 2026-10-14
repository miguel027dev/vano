import test from 'node:test';
import assert from 'node:assert/strict';
import {easeGpsPoint,routeTrace} from './liveMotion.js';
import {buildRouteTimeline, distanceOnRoute} from './routeAnimation.js';
const a=[-46.67,-23.58],b=[-46.669,-23.58],c=[-46.668,-23.58];
test('GPS marker eases real updates, never extrapolates while stationary',()=>{
  const mid=easeGpsPoint(a,b,16,{accuracy:6,speed:6});
  assert.ok(mid[0]>a[0]&&mid[0]<b[0]);
  assert.deepEqual(easeGpsPoint(mid,mid,16,{accuracy:8,speed:0}),mid);
  assert.deepEqual(easeGpsPoint(null,a,16),a);
  assert.deepEqual(easeGpsPoint(a,null,16),a);
});
test('long GPS relocations snap instead of crossing city blocks',()=>{
  assert.deepEqual(easeGpsPoint(a,[-46.65,-23.59],16,{accuracy:8}),[-46.65,-23.59]);
});
test('borderline GPS displacement eases instead of visibly jumping the vehicle',()=>{
  const nearby=[-46.66855,-23.58]; // about 150 m from a
  const eased=easeGpsPoint(a,nearby,16,{accuracy:12,speed:8});
  assert.ok(eased[0]>a[0]&&eased[0]<nearby[0]);
});
test('traveled line ends at actual progress along route geometry',()=>{
  const timeline=buildRouteTimeline({type:'LineString',coordinates:[a,b,c]});
  const meters=distanceOnRoute(timeline,b);
  const line=routeTrace(timeline,meters);
  assert.deepEqual(line[0],a);
  assert.ok(Math.abs(line.at(-1)[0]-b[0])<.000001);
  assert.equal(routeTrace(timeline,0).length,2);
});
