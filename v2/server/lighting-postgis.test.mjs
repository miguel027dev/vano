import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLineJson,inspectApprovedRouteLighting} from './safe-routing/lighting-postgis.mjs';
const one=[{id:'candidate-1',geometry:{type:'LineString',coordinates:[[-46.65,-23.56],[-46.66,-23.57]]}}];
test('spatial inspection refuses regions outside Sao Paulo',()=>{
 assert.throws(()=>routeLineJson({geometry:{type:'LineString',coordinates:[[-43,-22],[-42,-22]]}}));
});
test('spatial inspection cannot claim a safe route without an approved snapshot',async()=>{
 const client={query:async()=>({rowCount:0,rows:[]})};
 const result=await inspectApprovedRouteLighting(one,{client});
 assert.equal(result.available,false);
 assert.equal(result.results.length,0);
});
test('approved snapshot still returns informational data only',async()=>{
 let calls=0;
 const client={query:async()=>{
  calls++;
  return calls===1?{rowCount:1,rows:[{snapshot_id:'approved-sp-sample',collected_at:'2026-10-15'}]}:
   {rowCount:1,rows:[{samples:20,near_points:13}]};
 }};
 const result=await inspectApprovedRouteLighting(one,{client});
 assert.equal(result.available,true);
 assert.equal(result.results[0].fixtureProximityFraction,.65);
 assert.equal(result.results[0].verifiedSafety,false);
 assert.equal(result.results[0].suitableForAutomaticRanking,false);
 assert.equal(result.results[0].functioningLightsConfirmed,false);
});
