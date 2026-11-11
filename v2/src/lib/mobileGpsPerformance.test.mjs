import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasRecentNativePosition} from './nativePositionPriority.mjs';
import {nextRouteBearing,nearestOnRoute,cameraTarget} from './navigationMotion.js';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');

test('Android GPS takes priority while fresh, browser resumes after a gap',()=>{
  assert.equal(hasRecentNativePosition(10000,12000),true);
  assert.equal(hasRecentNativePosition(10000,12799),true);
  assert.equal(hasRecentNativePosition(10000,12800),false);
  assert.equal(hasRecentNativePosition(0,10000),false);
  assert.equal(hasRecentNativePosition(15000,12000),false);
  assert.equal(hasRecentNativePosition(NaN,12000),false);
});

test('native Android events use current navigation state instead of initial closure',()=>{
  assert.match(page,/nativePositionCallback\.current=onPosition/);
  assert.match(page,/nativePositionCallback\.current\?\.\(event\.detail\)/);
  assert.match(page,/nativeLastAcceptedAt\.current=Date\.now\(\)/);
  assert.match(page,/hasRecentNativePosition\(nativeLastAcceptedAt\.current,Date\.now\(\)\)/);
});

test('live GPS does not re-upload route layers on each sensor callback',()=>{
  const marker='// Heavy sources, route geometry and symbols change on route/UI events';
  const start=map.indexOf(marker);
  const end=map.indexOf('// Changing the visual theme',start);
  assert.ok(start>0&&end>start);
  const segment=map.slice(start,end);
  const firstEffect=segment.slice(0,segment.indexOf('// Hot GPS path'));
  assert.doesNotMatch(firstEffect,/\[userCoords\?\.\[0\]/);
  assert.doesNotMatch(firstEffect,/telemetry\?\.heading/);
  assert.match(segment,/if\(!map\._vanoMarker\?\.current&&validPoint\(latest\.current\.gpsCoords\)\)/);
  assert.match(segment,/motion\.current\?\.start\(\)/);
});

test('stationary GPS does not repaint expensive route geometry or GL camera',()=>{
  assert.match(map,/now-state\.lastPaint>=180/);
  assert.match(map,/metersBetween\(state\.lastPaintPoint,point\)>=\.6/);
  assert.match(map,/const cameraChanged=!appliedPose/);
  assert.match(map,/if\(cameraChanged\)\{/);
  assert.match(map,/map\.jumpTo\(\{\.\.\.pose,padding:smoothPadding\}\)/);
});

test('camera uses same nearest route segment for look-ahead bearing',()=>{
  const route={coordinates:[[-46.70,-23.60],[-46.69,-23.60],[-46.68,-23.60]]};
  const point=[-46.695,-23.60001],near=nearestOnRoute(point,{coordinates:route.coordinates});
  const expected=nextRouteBearing(point,route,90);
  assert.equal(nextRouteBearing(point,route,90,near),expected);
  assert.ok(Number.isFinite(cameraTarget({navigation:true,position:point,route:{geometry:route},telemetry:{speed:10,heading:90,accuracy:10}}).bearing));
});
