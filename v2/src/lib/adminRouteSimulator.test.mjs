import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFrame,simulationDistanceStep,simulationSpeedKmh,SIMULATION_PLAYBACK_RATE,simulationPointerBearing} from './adminRouteSimulator.mjs';
import {buildRouteTimeline} from './routeAnimation.js';
import {readFileSync} from 'node:fs';

const route={
 id:'safe',duration:4,distance:1.1,
 geometry:{type:'LineString',coordinates:[[-46.68,-23.58],[-46.675,-23.58],[-46.67,-23.578]]},
 steps:[{location:[-46.675,-23.58],instruction:'Vire à direita',type:'turn',modifier:'right'},
        {location:[-46.67,-23.578],instruction:'Chegou ao destino',type:'arrive'}]
};
test('simulator interpolates inside the existing provider geometry, never beyond destination',()=>{
 const timeline=buildRouteTimeline(route.geometry);
 const start=simulationFrame(route,0);
 const middle=simulationFrame(route,timeline.total/2);
 const end=simulationFrame(route,timeline.total+100);
 assert.deepEqual(start.point,route.geometry.coordinates[0]);
 assert.ok(middle.point[0]>start.point[0]&&middle.point[0]<route.geometry.coordinates.at(-1)[0]);
 assert.deepEqual(end.point,route.geometry.coordinates.at(-1));
 assert.equal(end.finished,true);
 assert.equal(end.guidance.finished,true);
 assert.equal(end.guidance.progress,1);
 assert.equal(end.guidance.preview,true);
 assert.equal(end.guidance.simulated,true);
 assert.equal(middle.guidance.routeMeters,middle.progress);
});
test('mock speed is a realistic vehicle label, while playback rate can accelerate time',()=>{
 assert.equal(SIMULATION_PLAYBACK_RATE,4);
 assert.equal(simulationSpeedKmh('carro'),42);
 assert.equal(simulationSpeedKmh('moto'),34);
 assert.equal(simulationSpeedKmh('a-pe'),5);
 assert.ok(Math.abs(simulationDistanceStep(0,1,10000,'carro')-(42/3.6*.5*4))<0.01,
   'time increment clamps stalls to half second: 42/3.6 * .5 * 4');
 assert.equal(simulationDistanceStep(90,100,100,'carro'),100);
 assert.equal(simulationDistanceStep(-20,-2,100,'carro'),0);
});
test('missing and invalid path samples refuse playback',()=>{
 assert.equal(simulationFrame({geometry:{type:'LineString',coordinates:[[-46.68,-23.58]]}},10),null);
 assert.equal(simulationFrame({},10),null);
 assert.equal(simulationDistanceStep(NaN,NaN,NaN),0);
});
test('administrator simulation is never available on the public map or as real GPS input',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../admin-route-simulator.css',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(page,/adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
 assert.match(page,/adminV2RoadSigns&&<button type="button"/);
 assert.match(page,/if\(!adminV2RoadSigns\|\|!active\)return/);
 assert.match(page,/gpsCoords=\{simPosition\|\|userCoords\}/);
 assert.match(page,/simulationPreview=\{simActive\}/);
 assert.match(map,/latest\.current\.simulationPreview\?null:latest\.current\.gpsCoords/);
 assert.match(map,/latest\.current\.active&&!latest\.current\.simulationPreview/);
 assert.match(page,/navigation:navMode&&!simActive,documentObject:document/);
 assert.match(page,/simActive\?mapControl\.current\?\.center\?\.\(\)/);
 assert.match(page,/simActive\?simFrame\?\.guidance\|\|null:guidance/);
 assert.match(page,/navMode&&active\?startNavigationWakeLock/);
 assert.match(page,/if\(simActive\)return false; \/\/ Simulation must never request spoken directions/);
 assert.match(page,/if\(!navMode\|\|simActive\|\|!route\|\|!dest\)return/);
 assert.match(page,/if\(simActive\|\|navigator\.onLine===false/);
 assert.match(page,/!simActive&&<button type="button" className="circle-btn v36-nav-report/);
 assert.match(css,/data-map-appearance="dark"/);
 assert.match(css,/focus-visible/);
 assert.doesNotMatch(page,/lastGpsFix\.current=sim/);
 assert.doesNotMatch(page,/setUserCoords\(sim/);
 assert.doesNotMatch(page,/queueTripWrite\(\{[^\n]*sim/);
});

test('simulation control is always click-enabled on admin V2 and gives guidance without a route',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../admin-route-simulator.css',import.meta.url),'utf8');
 const btn=page.slice(page.indexOf('className={`circle-btn v76-sim-toggle'),page.indexOf('{simActive?<Square size={19}/>:<Play size={20}/>}'));
 assert.ok(btn.length>100,'expected the route simulation button JSX');
 assert.doesNotMatch(btn,/disabled=/,'the simulation button must not silently disable itself');
 assert.match(btn,/onClick=\{simActive\?stopRouteSimulation:startRouteSimulation\}/);
 assert.match(page,/setToast\(loadingRoute\?'Aguarde o cálculo/);
 assert.match(page,/setToast\('Simulação iniciada\. O GPS real não será alterado\.'/);
 assert.match(css,/\.map-page \.v76-sim-toggle\{[\s\S]*?opacity:1;cursor:pointer/);
 assert.match(css,/\.map-page\[data-map-appearance="dark"\] \.v76-sim-toggle:not\(\.is-playing\)/);
});
test('active real navigation requires confirmation before changing to GPS-isolated simulation',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../admin-route-simulator.css',import.meta.url),'utf8');
 assert.match(page,/if\(navMode&&!simActive\)\{\s*setSimConfirmOpen\(true\)/);
 assert.match(page,/simConfirmOpen&&<div className="v76-sim-confirm-backdrop"/);
 assert.match(page,/role="dialog" aria-modal="true"/);
 assert.match(page,/onClick=\{activateRouteSimulation\}>Iniciar simulação/);
 assert.match(page,/syncMeasuredDistance\(true\);\s*measuredTrip\.current=null/);
 assert.match(page,/stopNavigationVoice\(\{native:isNativeShell\(\),sendNative:notifyNative\}\)/);
 assert.match(page,/void deleteOffline\('active-trip'\)/);
 assert.match(page,/routeEpoch\.current\+\+; \/\/ Ignore any pending reroute/);
 assert.match(css,/\.v76-sim-confirm-backdrop/);
 assert.match(css,/data-map-appearance="dark"/);
});

test('V2 user pointer does not steer before reaching a ninety-degree entrance',()=>{
 const geometry={type:'LineString',coordinates:[[-46.68,-23.58],[-46.68,-23.579],[-46.679,-23.579]]};
 const timeline=buildRouteTimeline(geometry);
 const vertex=timeline.cumulative[1];
 const initial=simulationPointerBearing(timeline,vertex-10);
 const before=simulationPointerBearing(timeline,vertex-.05);
 const atVertex=simulationPointerBearing(timeline,vertex);
 const justAfter=simulationPointerBearing(timeline,vertex+1);
 const halfway=simulationPointerBearing(timeline,vertex+5);
 const finished=simulationPointerBearing(timeline,vertex+12);
 assert.ok(initial<2||initial>358);
 assert.ok(Math.abs(before-initial)<1,'heading must stay straight before turn');
 assert.ok(Math.abs(atVertex-initial)<1,'at the vertex direction is still incoming');
 assert.ok(justAfter>0&&justAfter<35,'begin the turn only once the marker enters the new road');
 assert.ok(halfway>justAfter&&halfway<90);
 assert.ok(finished>88&&finished<92);
 assert.deepEqual(simulationFrame({geometry,steps:[]},vertex-.05).point,
   geometry.coordinates[0].map((v,i)=>v+(geometry.coordinates[1][i]-v)*((vertex-.05)/vertex)));
});

test('V2 heading follows the actual diagonal lane turn, not a look-ahead 65m route bearing',()=>{
 const start=[-46.68,-23.58],vertex=[-46.68,-23.579],diagonal=[-46.6796,-23.5786];
 const timeline=buildRouteTimeline({type:'LineString',coordinates:[start,vertex,diagonal]});
 const at=timeline.cumulative[1];
 const lastStraight=simulationPointerBearing(timeline,at-2);
 const entered=simulationPointerBearing(timeline,at+3);
 const settled=simulationPointerBearing(timeline,at+11);
 assert.ok(Math.abs(lastStraight)<1);
 assert.ok(entered>0&&entered<45,'diagonal entrance turns progressively');
 assert.ok(settled>35&&settled<55,'settled diagonal points about 45 degrees');
 const route={geometry:{type:'LineString',coordinates:[start,vertex,diagonal]},steps:[]};
 const preview=simulationFrame(route,at-4);
 assert.ok(preview.bearing>preview.pointerBearing+1,
   'guidance can anticipate a junction, while the V2 pointer still follows its current segment');
});

test('heading handles geographic wrap, invalid route and short segments without inventing GPS',()=>{
 assert.equal(simulationPointerBearing(null,0),null);
 assert.equal(simulationPointerBearing({points:[[0,0]],cumulative:[0],total:0},0),null);
 const geometry={type:'LineString',coordinates:[[-46.68,-23.58],[-46.6801,-23.5785],[-46.6802,-23.5785]]};
 const timeline=buildRouteTimeline(geometry);
 const current=simulationPointerBearing(timeline,timeline.cumulative[1]-1);
 const next=simulationPointerBearing(timeline,timeline.cumulative[1]+15);
 assert.ok(current>350||current<10,'initial segment nearly north');
 assert.ok(next>265&&next<275,'second segment west');
 assert.deepEqual(geometry.coordinates,[[-46.68,-23.58],[-46.6801,-23.5785],[-46.6802,-23.5785]]);
});

test('physical V2 pointer bearing is never substituted into the standard 6x simulator',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(page,/simCameraMode==='drone'&&Number\.isFinite\(simFrame\.pointerBearing\)\?simFrame\.pointerBearing:simFrame\.bearing/);
 assert.match(page,/simCameraMode==='drone'\?V2_DRONE_PLAYBACK_RATE:undefined/);
 assert.match(map,/d\.droneSimulation&&timeline\.total>0&&Number\.isFinite\(simulationMeters\)/);
 assert.match(map,/point=sampleRoute\(timeline,state\.droneMeters\)\?\.point/);
 assert.match(map,/simulationPointerBearing\(timeline,state\.droneMeters\)/);
 assert.match(map,/state\.droneHeadingInitialized=true/);
 assert.match(map,/Math\.min\(Math\.abs\(delta\)\*ease,dt\*\.37\)/);
 assert.match(map,/const desiredPitch=data\.droneSimulation\|\|stableLightGpsPuck\?'viewport':'map'/);
 assert.match(map,/setPitchAlignment\?\.\(desiredPitch\)/);
 assert.match(map,/bearing:Number\.isFinite\(markerHeading\)\?markerHeading:view\.bearing/);
});
