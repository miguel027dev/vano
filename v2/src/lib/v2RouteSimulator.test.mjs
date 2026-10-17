import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRouteSimulation} from './v2RouteSimulator.js';
import {buildRouteTimeline,distanceOnRoute,nextManeuver} from './routeAnimation.js';
import {navigationSummary} from './navigationSummary.js';

const route={
  id:'fast',duration:8,distance:1.1,
  geometry:{type:'LineString',coordinates:[
    [-46.68,-23.58],[-46.675,-23.58],[-46.675,-23.575],[-46.675,-23.57]
  ]},
  steps:[
    {instruction:'Siga em frente',location:[-46.68,-23.58],type:'depart',modifier:'straight'},
    {instruction:'Vire à direita',location:[-46.675,-23.58],type:'turn',modifier:'right',street:'Rua Teste'},
    {instruction:'Chegou ao destino',location:[-46.675,-23.57],type:'arrive'}
  ]
};
const near=(a,b,eps=1e-7)=>Math.abs(a-b)<eps;

test('route simulator begins at geometry start, advances predictably and stops precisely',()=>{
 const engine=createRouteSimulation(route,'carro');
 assert.ok(engine);
 assert.ok(engine.durationMs>=30000&&engine.durationMs<=105000);
 const first=engine.sample(0),middle=engine.sample(engine.durationMs/2);
 const end=engine.sample(engine.durationMs+900000);
 assert.deepEqual(first.point,route.geometry.coordinates[0]);
 assert.ok(middle.guidance.routeMeters>0);
 assert.ok(middle.guidance.progress>0&&middle.guidance.progress<1);
 assert.deepEqual(end.point,route.geometry.coordinates.at(-1));
 assert.equal(end.done,true);
 assert.equal(end.guidance.progress,1);
 assert.equal(engine.sample(-500).guidance.progress,0);
 assert.equal(engine.sample(Number.NaN).guidance.progress,0);
 assert.equal(first.telemetry.accuracy,5);
 assert.equal(first.telemetry.speed,42/3.6);
 assert.equal(first.guidance.preview,true);
 assert.equal(first.guidance.finished,false);
 assert.equal(end.guidance.finished,true);
 assert.equal(navigationSummary(route,middle.guidance,Date.now()).progress,middle.guidance.progress);
});
test('simulated preview follows the same provider manouevre selection and preserves street and lanes',()=>{
 const engine=createRouteSimulation(route);
 const reference=buildRouteTimeline(route.geometry);
 const turnAt=distanceOnRoute(reference,route.steps[1].location);
 const moment=(turnAt-60)/reference.total*engine.durationMs;
 const simulated=engine.sample(moment);
 const actual=nextManeuver(route,reference,simulated.guidance.routeMeters);
 assert.equal(simulated.guidance.instruction,actual.instruction);
 assert.equal(simulated.guidance.stepIndex,actual.stepIndex);
 assert.equal(simulated.guidance.street,actual.street);
 assert.equal(simulated.guidance.distance,actual.distance);
 assert.ok(near(simulated.guidance.routeMeters,turnAt-60,.5));
});
test('walking and motorcycle display credible speed, and invalid geometry cannot simulate',()=>{
 assert.equal(createRouteSimulation(route,'a-pe').speedKmh,5);
 assert.equal(createRouteSimulation(route,'moto').speedKmh,48);
 assert.equal(createRouteSimulation(null),null);
 assert.equal(createRouteSimulation({geometry:{coordinates:[]}}),null);
 assert.equal(createRouteSimulation({geometry:{coordinates:[[-46.68,-23.58]]}}),null);
});
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v2-route-simulator.css',import.meta.url),'utf8');

test('rehearsal is gated to admin-only /v2 and does not call real navigation start',()=>{
 assert.match(page,/const adminV2RoadSigns=location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
 assert.match(page,/adminV2RoadSigns&&route&&!navMode&&<button type="button"/);
 assert.match(page,/setRouteSimulation\(\{route,elapsedMs:0\}\)/);
 assert.match(page,/const navView=navMode\|\|Boolean\(simulationSample\)/);
 assert.match(page,/navigation=\{navView\}/);
 assert.match(page,/telemetry=\{simulationSample\?\.telemetry\|\|telemetry\}/);
 assert.match(page,/gpsCoords=\{simulationSample\?\.point\|\|userCoords\}/);
 assert.match(page,/communityGpsCoords=\{userCoords\}/);
 assert.match(map,/communityGpsCoords===undefined\?latest\.current\.gpsCoords:latest\.current\.communityGpsCoords/);
 assert.match(page,/readQuickReportGPS=\(\)=>quickReportPosition\(lastGpsFix\.current\)/);
 assert.doesNotMatch(page,/setUserCoords\(simulationSample/);
 assert.doesNotMatch(page,/onPosition\(simulationSample/);
});
test('simulation UI has explicit start/stop, theme colors and a no-persistence notice',()=>{
 assert.match(page,/Parar simulação do trajeto/);
 assert.match(page,/Simular trajeto/);
 assert.match(page,/Sem gravação/mi);
 assert.match(page,/simulationSample\?toggleRouteSimulation:reset/);
 assert.match(page,/!simulationSample&&<button type="button" className="circle-btn v36-nav-report/);
 assert.match(css,/v2-route-sim-toggle\.is-simulating/);
 assert.match(css,/data-map-appearance="dark"/);
 assert.match(css,/prefers-reduced-motion/);
});
