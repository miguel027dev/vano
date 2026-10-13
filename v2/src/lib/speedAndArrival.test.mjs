import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gpsSpeedKmh} from './mapSpeed.js';
import {arrivalMarkerSvg,ARRIVAL_PIN_WIDTH,ARRIVAL_PIN_HEIGHT,ARRIVAL_PIN_ANCHOR} from './arrivalMarker.js';
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v43-speed-arrival.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
const live={fresh:true,accuracy:10,simulated:false};

test('speedometer reads only actual GPS meters per second, converts to km/h',()=>{
 assert.equal(gpsSpeedKmh(0,live),0);
 assert.equal(gpsSpeedKmh(1,live),4);
 assert.equal(gpsSpeedKmh(4.2,live),15);
 assert.equal(gpsSpeedKmh(27.78,live),100);
 assert.equal(gpsSpeedKmh(3.9,live),14);
});
test('missing, stale, simulated, inaccurate or implausible data NEVER displays a fabricated zero',()=>{
 for(const speed of [undefined,null,NaN,Infinity,-1,86,'5',{},true])
  assert.equal(gpsSpeedKmh(speed,live),null);
 assert.equal(gpsSpeedKmh(0,{fresh:false,accuracy:5}),null);
 assert.equal(gpsSpeedKmh(1,{fresh:true,accuracy:120}),null);
 assert.equal(gpsSpeedKmh(1,{fresh:true,accuracy:5,simulated:true}),null);
 assert.equal(gpsSpeedKmh(0,{fresh:true,accuracy:0}),0);
 assert.equal(gpsSpeedKmh(1,{fresh:true,accuracy:100}),4);
});
test('speed is from real telemetry and expires with GPS; never route ETA or map movement',()=>{
 assert.match(page,/gpsSpeedKmh\(telemetry\.speed,/);
 assert.match(page,/hasRecentGpsFix\(lastGpsFix\.current,Date\.now\(\),18000\)/);
 assert.match(page,/simulated:demo/);
 assert.match(page,/speedKmh===null\?'—':speedKmh/);
 assert.match(page,/className="v43-speedometer"/);
 assert.match(page,/<small>km\/h<\/small>/);
 assert.match(page,/setTelemetry\(\{heading:result\.heading,speed:result\.speed,accuracy:fix\.accuracy\}\)/);
});
test('destination pin is a small static white/navy graphic with orange flag',()=>{
 const svg=arrivalMarkerSvg();
 assert.equal(ARRIVAL_PIN_WIDTH,52);
 assert.equal(ARRIVAL_PIN_HEIGHT,64);
 assert.deepEqual(ARRIVAL_PIN_ANCHOR,[26,59]);
 assert.match(svg,/class="vano-arrival-svg"/);
 assert.match(svg,/fill="#fff"/);
 assert.match(svg,/fill="#182634"/);
 assert.match(svg,/fill="#ff781e"/);
 assert.doesNotMatch(svg,/<image|<script|onload=/i);
});
test('both map renderers anchor the identical icon at the destination coordinate',()=>{
 assert.match(map,/el\.innerHTML=arrivalMarkerSvg\(\)/);
 assert.match(map,/className:'vano-arrival-leaflet-icon',html:markerElement\('destination'\)\.outerHTML/);
 assert.match(map,/iconAnchor:ARRIVAL_PIN_ANCHOR/);
 assert.match(map,/anchor:type==='destination'\?'bottom':'center'/);
 assert.match(map,/offset:type==='destination'\?\[0,5\]:\[0,0\]/);
 assert.match(map,/marker\('destination',data\.destination\?\.coords\)/);
 assert.doesNotMatch(map,/map-pin-destination">⌖/);
});
test('no orange progress circle, responsive speed dial and custom destination styling',()=>{
 assert.match(main,/import '\.\/v43-speed-arrival\.css';/);
 assert.match(css,/\.v43-speedometer/);
 assert.match(css,/border-radius:50%/);
 assert.doesNotMatch(css,/conic-gradient|stroke-dasharray|@keyframes|progress-ring|orange-ring/i);
 assert.match(css,/\.vano-arrival-marker/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/@media\(max-height:540px\)/);
});
