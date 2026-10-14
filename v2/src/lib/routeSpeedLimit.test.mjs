import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routePostedSpeedLimits,mapboxDirectionsUrl} from '../../server/mapbox-v1-fallback.mjs';
import {speedLimitAtGpsPosition} from './routeSpeedLimit.js';

const geometry={type:'LineString',coordinates:[[-46.660,-23.560],[-46.659,-23.560],[-46.658,-23.560],[-46.657,-23.560]]};
const route=annotations=>({geometry,legs:[{annotation:{maxspeed:annotations}}]});
const samples=[{speed:50,unit:'km/h'},{speed:30,unit:'mph'},{unknown:true}];
test('Directions requests real posted speed limit metadata already',()=>{
 const url=mapboxDirectionsUrl([-46.66,-23.56],[-46.657,-23.56],'sample-token','pt','carro');
 assert.match(url.searchParams.get('annotations'),/maxspeed/);
 assert.equal(url.searchParams.get('overview'),'full');
 assert.equal(url.searchParams.get('geometries'),'geojson');
});
test('Mapbox maxspeed only survives validated route-aligned segments',()=>{
 assert.deepEqual(routePostedSpeedLimits(route(samples)),[50,48,null]);
 assert.equal(routePostedSpeedLimits(route(samples.slice(1))),null);
 assert.equal(routePostedSpeedLimits({geometry,legs:[{annotation:{maxspeed:samples}},{annotation:{maxspeed:[]}}]}),null);
 assert.equal(routePostedSpeedLimits(route([{unknown:true},{none:true},null])),null);
 assert.deepEqual(routePostedSpeedLimits(route([{speed:40,unit:'m/s'},{speed:70,unit:'km/h'},{speed:0,unit:'km/h'}])),[null,70,null]);
});
test('fresh real GPS matches only the current road segment',()=>{
 const known={geometry,speedLimits:[50,60,null]};
 const gps={fresh:true,accuracy:5,simulated:false};
 assert.equal(speedLimitAtGpsPosition(known,[-46.6596,-23.56],gps),50);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6586,-23.56],gps),60);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6575,-23.56],gps),null);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6595,-23.559],gps),null);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6596,-23.56],{...gps,fresh:false}),null);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6596,-23.56],{...gps,simulated:true}),null);
 assert.equal(speedLimitAtGpsPosition(known,[-46.6596,-23.56],{...gps,accuracy:85}),null);
 assert.equal(speedLimitAtGpsPosition({...known,speedLimits:[50]},[-46.6596,-23.56],gps),null);
});
test('existing GPS dial is single, with only a conditional speed-limit badge',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v43-speed-arrival.css',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../../server/mapbox-v1-fallback.mjs',import.meta.url),'utf8');
 assert.equal(page.split('className="v43-speedometer"').length-1,1);
 assert.match(page,/speedLimitAtGpsPosition\(route,userCoords/);
 assert.match(page,/className="v43-speed-limit"/);
 assert.match(page,/postedLimit!==null/);
 assert.match(page,/routeVehicle!=='a-pe'/);
 assert.match(page,/source!=='demonstracao'/);
 assert.match(backend,/speedLimits:routePostedSpeedLimits\(route\)/);
 assert.match(css,/\.v43-speedometer \.v43-speed-limit/);
 assert.doesNotMatch(css,/conic-gradient|progress-ring|stroke-dasharray/);
});
