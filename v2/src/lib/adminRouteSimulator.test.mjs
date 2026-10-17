import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFrame,simulationDistanceStep,simulationSpeedKmh,SIMULATION_PLAYBACK_RATE} from './adminRouteSimulator.mjs';
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
 assert.equal(SIMULATION_PLAYBACK_RATE,6);
 assert.equal(simulationSpeedKmh('carro'),42);
 assert.equal(simulationSpeedKmh('moto'),34);
 assert.equal(simulationSpeedKmh('a-pe'),5);
 assert.ok(Math.abs(simulationDistanceStep(0,1,10000,'carro')-35)<0.01,
   'time increment clamps stalls to half second: 42/3.6 * .5 * 6');
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
 assert.match(page,/adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
 assert.match(page,/adminV2RoadSigns&&\(route\|\|simActive\)&&<button/);
 assert.match(page,/if\(!adminV2RoadSigns\|\|navMode\|\|!active/);
 assert.match(page,/gpsCoords=\{simPosition\|\|userCoords\}/);
 assert.match(page,/simActive\?simFrame\?\.guidance\|\|null:guidance/);
 assert.match(page,/navMode&&active&&!simActive\?startNavigationWakeLock/);
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
