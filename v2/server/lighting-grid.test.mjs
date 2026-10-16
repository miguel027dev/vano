import test from 'node:test';
import assert from 'node:assert/strict';
import {tilesForRoute,inspectFixtureProximity} from './safe-routing/lighting-grid.mjs';
const route={id:'real-provider-candidate',geometry:{type:'LineString',coordinates:[[-46.655,-23.56],[-46.655,-23.561]]}};
test('lighting queries are bounded to SP candidate geometry and reject broad routes',()=>{
 assert.ok(tilesForRoute(route).length<10);
 assert.throws(()=>tilesForRoute({geometry:{type:'LineString',coordinates:[[-46.9,-24],[-46.3,-23.3]]}}),/limite/);
});
test('fixture proximity reports unknown lamp/road state and never certifies safety',()=>{
 const result=inspectFixtureProximity(route,[[-46.655,-23.56],[-46.655,-23.5605],[-46.655,-23.561]]);
 assert.equal(result.fixtureProximityFraction,1);assert.equal(result.suitableForAutomaticRanking,false);
 assert.equal(result.lampFunctionConfirmed,false);assert.equal(result.roadAssociationConfirmed,false);
 assert.equal(inspectFixtureProximity(route,[]).fixtureProximityFraction,0);
});
