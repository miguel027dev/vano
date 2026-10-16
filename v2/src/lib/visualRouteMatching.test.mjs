import test from 'node:test';
import assert from 'node:assert/strict';
import {matchVisualFix,pointAlongRoute} from './visualRouteMatching.js';
import {cameraTarget,metersBetween,shortestAngle} from './navigationMotion.js';

const origin=[-46.7000,-23.6000],latMeter=1/111320;
const lonMeter=1/(111320*Math.cos(origin[1]*Math.PI/180));
const at=(e,n)=>[origin[0]+e*lonMeter,origin[1]+n*latMeter];
const start=at(0,0),corner=at(85,0),finish=at(85,95);
const geometry={type:'LineString',coordinates:[start,corner,finish]};
const route={geometry};

test('camera follows a real right-angle street rather than drawing diagonally through the block',()=>{
 const first=matchVisualFix(at(55,4),geometry,{accuracy:7,heading:90,speed:8,sourceAt:1000});
 assert.equal(first.matched,true);
 const view=cameraTarget({position:first.point,route,navigation:true,telemetry:{heading:90,accuracy:7,speed:9},
  visualMatch:{...first,sampleAhead:d=>pointAlongRoute(geometry,first.routeMeters+d)?.point},
  viewportClearancePx:800});
 assert.equal(view.bearing,90,'camera faces the current street until the corner');
 assert.ok(view.center[0]<=corner[0]+lonMeter,'camera lookahead cannot cross east of corner into a building');
 assert.ok(view.center[1]>=corner[1],'the forward viewpoint follows northbound street after corner');
 assert.ok(view.center[1]>first.point[1]+25*latMeter);
});
test('after turning the block, camera rotates using the confirmed new segment tangent',()=>{
 const east=matchVisualFix(at(80,3),geometry,{accuracy:5,heading:90,speed:7,sourceAt:1000});
 const north=matchVisualFix(at(85,19),geometry,{accuracy:6,heading:0,speed:7,sourceAt:4000,previous:east});
 assert.equal(north.matched,true);
 assert.ok(Math.abs(shortestAngle(north.bearing,0))<5);
 const view=cameraTarget({position:north.point,route,navigation:true,telemetry:{heading:0,accuracy:6,speed:7},
  visualMatch:{...north,sampleAhead:d=>pointAlongRoute(geometry,north.routeMeters+d)?.point},
  viewportClearancePx:800});
 assert.ok(Math.abs(shortestAngle(view.bearing,0))<3,'view faces north after turning');
 assert.ok(Math.abs(view.center[0]-corner[0])<lonMeter);
});
test('snaps small GPS sidewalk errors to the route, never modifies accepted GPS',()=>{
 const raw=at(38,7),before=raw.slice();
 const matched=matchVisualFix(raw,geometry,{accuracy:9,heading:90,speed:5,sourceAt:1000});
 assert.equal(matched.matched,true);
 assert.ok(metersBetween(matched.point,at(38,0))<1);
 assert.deepEqual(raw,before);
 assert.ok(matched.lateral>5);
});
test('a real off-route turn remains visible: no forced snap to the planned street',()=>{
 for(const p of [at(45,55),at(45,-60)]){
  const result=matchVisualFix(p,geometry,{accuracy:8,speed:9,heading:170,sourceAt:1000});
  assert.equal(result.matched,false);
  assert.deepEqual(result.point,p);
 }
 assert.equal(matchVisualFix(at(50,4),geometry,{accuracy:110}).matched,false);
});
test('progress hysteresis avoids jumping onto adjacent parallel segments at an intersection',()=>{
 const loop={type:'LineString',coordinates:[at(0,0),at(90,0),at(90,60),at(0,60),at(0,3)]};
 const prev=matchVisualFix(at(25,1.5),loop,{accuracy:8,heading:90,speed:6,sourceAt:1000});
 assert.equal(prev.matched,true);
 const next=matchVisualFix(at(28,1.5),loop,{accuracy:9,heading:90,speed:6,sourceAt:2000,previous:prev});
 assert.equal(next.matched,true);
 assert.ok(next.routeMeters<100,'do not jump to the final nearby segment');
 assert.ok(next.routeMeters>=prev.routeMeters-4);
});
test('camera matching is optional: free driving and accessibility remain unchanged',()=>{
 const free=cameraTarget({navigation:true,position:at(0,0),telemetry:{heading:90,speed:10,accuracy:7}});
 assert.ok(free.center[0]>origin[0]);
 const reduced=cameraTarget({navigation:true,position:at(10,2),route,telemetry:{heading:90,speed:10,accuracy:7},
  visualMatch:{...matchVisualFix(at(10,2),geometry,{accuracy:7}),sampleAhead:d=>at(10+d,0)},
  reducedMotion:true});
 assert.deepEqual(reduced.center,at(10,2));
 assert.equal(reduced.pitch,0);
});
test('VanoMap uses accepted GPS for navigation instructions and visual matching only for paint',async()=>{
 const {readFileSync}=await import('node:fs');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/matchVisualFix\(target,geometry/);
 assert.match(map,/pointAlongRoute\(geometry,state\.matchedMeters\)/);
 assert.match(map,/sampleAhead:meters=>pointAlongRoute/);
 assert.match(map,/else if\(!data\.navigation\|\|type!=='vehicle'\)map\._vanoMarker\[key\]\.setLngLat\(point\)/);
 assert.match(page,/createManeuverTracker/,'route guidance still uses separate sensor-fix machinery');
 assert.match(page,/gpsFixAt=\{lastGpsFix\.current\?\.sourceAt\|\|0\}/);
});
