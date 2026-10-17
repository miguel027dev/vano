import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v47-route-vehicle.css',import.meta.url),'utf8');
const imports=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');

test('route sheet exposes Carro, Moto and A pé accessible buttons',()=>{
 const section=page.slice(page.indexOf('className="v47-route-vehicle"'),page.indexOf('{loadingRoute?<div className="route-loader"'));
 assert.ok(section.length>200,'mode choice must appear above options');
 assert.match(section,/role="group" aria-label=\{import\.meta\.env\.VITE_TRANSIT_PREVIEW/,'vehicle group is feature gated');
 assert.match(section,/Selecionar carro, moto, ônibus ou a pé/);
 assert.match(section,/Selecionar carro, moto ou a pé/,'existing labels remain accessible with Transit off');
 assert.match(section,/className="v47-transit-mode"/,'bus entry stays beside motorcycle');
 assert.match(section,/to="\/transporte"/,'transit does not call the road router');
 assert.match(section,/onClick=\{\(\)=>chooseRouteVehicle\('carro'\)\}/);
 assert.match(section,/onClick=\{\(\)=>chooseRouteVehicle\('moto'\)\}/);
 assert.match(section,/aria-pressed=\{routeVehicle==='carro'\}/);
 assert.match(section,/aria-pressed=\{routeVehicle==='moto'\}/);
 assert.match(section,/CarFront/);
 assert.match(section,/MotorcycleIcon/,'dedicated motorcycle icon');
 assert.doesNotMatch(section,/onClick=\{\(\)=>chooseRouteVehicle\('bicicleta'\)\}/);
});
test('vehicle picker changes real API route parameter and never leaves stale alternatives',()=>{
 assert.match(page,/async function calculateRoute\(place,departure,vehicle=routeVehicle\)/);
 assert.match(page,/vehicle,language,telemetry:/);
 assert.match(page,/if\(epoch===routeEpoch\.current&&!controller\.signal\.aborted\)\{setRouteData\(data\);setChoice\(vehicle==='a-pe'\?'fast':initialChoice\);\}/);
 assert.match(page,/routeRequest\.current\?\.abort\(\)/);
 assert.match(page,/signal:controller\.signal/);
 assert.match(page,/routeEpoch\.current\+\+;/);
 assert.match(page,/setRouteData\(null\);setLoadingRoute\(true\);setSheetOpen\(true\)/);
 assert.match(page,/calculateRoute\(dest,origin,vehicle\)/);
 assert.match(page,/vehicle:routeVehicle,language,\s*telemetry:/,'reroute must keep selected vehicle');
 assert.match(page,/routeOptions:\{reroute:true,adaptive:false,variantBudget:2\}/);
 assert.match(page,/telemetry=\{telemetry\} vehicle=\{routeVehicle\}/,'the navigation map receives the same vehicle');
});
test('route caution is removed without suppressing navigation button or pending offline status accessibility',()=>{
 assert.doesNotMatch(page,/className="route-caution"/);
 assert.doesNotMatch(page,/className="route-offline-status"/);
 assert.match(page,/className="sr-only" role="status"/);
 assert.match(page,/className="btn btn-primary start-btn"/);
});
test('vehicle mode presents sliding highlight with touch and reduced motion support',()=>{
 assert.match(imports,/v47-route-vehicle\.css/);
 assert.match(css,/v47-route-vehicle-switch::before/);
 assert.match(css,/\.is-moto::before\{transform:translateX\(100%\)\}/);
 assert.match(css,/touch-action:manipulation/);
 assert.match(css,/@media\(max-width:375px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/min-height:39px/);
});
 
test('fourth transport option does not change the road routing defaults',()=>{
 assert.match(page,/VITE_TRANSIT_PREVIEW==='1'/);
 assert.match(css,/\.v47-route-vehicle-switch\.has-transit/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/\.has-transit\.is-walking::before/);
 assert.doesNotMatch(page,/title="Alternar câmera 2D\/3D"/);
});
