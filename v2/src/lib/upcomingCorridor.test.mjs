import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingCorridor} from './upcomingCorridor.js';

const route={type:'LineString',coordinates:[[-46.68,-23.59],[-46.67,-23.59],[-46.66,-23.58],[-46.65,-23.58],[-46.64,-23.57]]};
test('no real GPS position means no speculative tile prefetch',()=>{
  assert.deepEqual(upcomingCorridor(route,null),{points:[],section:-1});
});
test('prepares only a bounded corridor ahead, not the entire route',()=>{
  const out=upcomingCorridor(route,[-46.675,-23.59],1200);
  assert.ok(out.section>=0);
  assert.ok(out.points.length>=2&&out.points.length<=10);
  assert.ok(out.points[0][0]<out.points.at(-1)[0]);
  assert.ok(out.points.at(-1)[0]<-46.65);
});
test('position updates move the window forward without inventing future GPS',()=>{
  const a=upcomingCorridor(route,[-46.675,-23.59],1500);
  const b=upcomingCorridor(route,[-46.652,-23.58],1500);
  assert.ok(b.section>a.section);
  assert.ok(b.points[0][0]>a.points[0][0]);
});
