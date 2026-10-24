import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterV2TrafficSignalPins} from './mapPublicIcons.js';
import {planV2RearChase} from './v2DroneCamera.mjs';
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';

test('only admin V2 removes visual semaphore blocks; normal map retains its POI pins',()=>{
 const pins=[
  {id:'signal1',type:'semaforo',source:'OpenStreetMap'},
  {id:'hospital1',type:'hospital',source:'OpenStreetMap'},
  {id:'radar1',type:'radar',source:'OpenStreetMap'},
  {id:'signal2',type:'semaforo',source:'Mapbox Streets'}
 ];
 assert.deepEqual(filterV2TrafficSignalPins(pins,{v2Experience:true}).map(x=>x.id),['hospital1','radar1']);
 assert.deepEqual(filterV2TrafficSignalPins(pins,{v2Experience:false}).map(x=>x.id),pins.map(x=>x.id));
 assert.deepEqual(filterV2TrafficSignalPins(pins,{v2Experience:true,hiddenIds:new Set(['radar1'])}).map(x=>x.id),['hospital1']);
 assert.equal(pins.length,4,'do not mutate features or provider data');
});
test('signal observations stay readable internally even though V2 labels are hidden',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const signs=readFileSync(new URL('./privateRoadSigns.js',import.meta.url),'utf8');
 assert.match(overlay,/map\._vanoTrafficSignals=\(\)=>items\.filter/);
 assert.match(overlay,/filterV2TrafficSignalPins\(/);
 assert.match(component,/,\(\)=>latest\.current\.v2Experience\)/);
 assert.match(component,/\[navigation,v2Experience\]/);
 assert.match(signs,/if\(item\.signalNearby&&!data\.v2Experience\)/);
 assert.match(signs,/data\.v2Experience/);
});
test('V2 simulation camera is closer and diagonally tilted, without shifting the actual puck',()=>{
 const puck=[-46.69,-23.59];
 const chase=planV2RearChase({enabled:true,vehicle:'carro',speed:10,accuracy:8});
 assert.ok(chase.zoom>17.72&&chase.zoom<18.10,'close ground framing without excessive zoom');
 assert.ok(chase.pitch>=50&&chase.pitch<=56,'ground-facing diagonal rear view');
 const view=planStandardSimulationCamera({
  enabled:true,base:{center:[-46.68,-23.58],zoom:16,pitch:35,bearing:10},
  position:puck,markerBearing:110,vehicle:'carro',speed:10,accuracy:8,
  viewport:{padding:{top:145,bottom:180,left:15,right:15},visibleHeight:460}
 });
 assert.deepEqual(view.center,puck);
 assert.equal(view.bearing,110,'camera follows physical pointer, not the upcoming turn');
 assert.equal(view.zoom,chase.zoom);
 assert.equal(view.pitch,chase.pitch);
});
