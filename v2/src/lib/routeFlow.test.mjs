import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STATIC_ROUTE_DASH_PATTERN,STATIC_LEAFLET_DASH,sameRouteShapeReferences} from './routeFlow.js';

test('selected route uses a valid, fixed Mapbox dash pattern',()=>{
  assert.equal(STATIC_ROUTE_DASH_PATTERN.length,2);
  assert.ok(STATIC_ROUTE_DASH_PATTERN.every(v=>Number.isFinite(v)&&v>0));
  assert.ok(Object.isFrozen(STATIC_ROUTE_DASH_PATTERN));
});
test('Leaflet markings use a fixed dash-gap pattern',()=>{
  assert.deepEqual(STATIC_LEAFLET_DASH.split(' ').map(Number),[8,20]);
});
test('route source reuses exactly identical geometry references',()=>{
  const geometry={type:'LineString',coordinates:[[-46.68,-23.58],[-46.67,-23.59]]};
  const other={type:'LineString',coordinates:[[-46.68,-23.58],[-46.66,-23.59]]};
  assert.equal(sameRouteShapeReferences([geometry,other],[geometry,other]),true);
  assert.equal(sameRouteShapeReferences([],[]),true);
  assert.equal(sameRouteShapeReferences([geometry],[{...geometry}]),false);
  assert.equal(sameRouteShapeReferences([geometry,other],[geometry]),false);
  assert.equal(sameRouteShapeReferences(null,[]),false);
});
test('route decorations have no advancing dash phase in Mapbox or Leaflet',()=>{
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../v28-navigation.css',import.meta.url),'utf8');
  assert.match(map,/'line-dasharray':STATIC_ROUTE_DASH_PATTERN/);
  assert.match(map,/dashArray:STATIC_LEAFLET_DASH/);
  assert.equal(map.includes("setPaintProperty(\'vano-v2-flow\',\'line-dasharray\'"),false);
  assert.doesNotMatch(map,/FLOW_DASH_FRAMES|flowFrameAt|lastFlowFrame|lastFlowAt/);
  assert.doesNotMatch(css,/@keyframes vano-v35-flow|animation:vano-v35-flow/);
});
