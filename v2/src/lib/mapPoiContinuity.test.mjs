import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectPublicPins,stableWorldCell,ICON_THEME} from './mapPublicIcons.js';
import {readMapboxPoiFeatures} from './mapboxPoiFallback.js';
import {rememberMapFeatures,cachedMapFeatures} from './mapFeaturePersistence.js';

const f=(id,type,priority,x,y)=>({id,type,priority,coords:[x,y],source:'Mapbox Streets',name:type});
const around=(-46.68+0.001);
test('real hospitals, fuel stations and traffic lights do not vanish at zoom boundaries',()=>{
 const features=[
  f('semaforo','semaforo',88,-46.681,-23.58),
  f('hospital','hospital',58,-46.682,-23.58),
  f('fuel','combustivel',37,-46.683,-23.58),
  f('pharmacy','saude',46,-46.684,-23.58),
  f('parking','estacionamento',30,-46.685,-23.58)
 ];
 const project=c=>({x:(c[0]+47)*1000,y:(c[1]+24)*1000});
 for(const zoom of [5,8.5,11.3,11.6,12.4,13.99,14,16,18,19.5]){
  const got=selectPublicPins(features,project,zoom,100).map(x=>x.id);
  assert.deepEqual(new Set(got),new Set(features.map(x=>x.id)),String(zoom));
 }
 assert.equal(stableWorldCell(features[0].coords,12),stableWorldCell(features[0].coords,19));
});
test('dense road signals still leave space for mapped hospitals and stations, not category locks',()=>{
 const signals=Array.from({length:200},(_,i)=>f('light-'+i,'semaforo',88,-46.68+i*.0002,-23.58));
 const service=[f('h','hospital',58,-46.7,-23.59),
  f('gas','combustivel',37,-46.71,-23.59),
  f('health','saude',45,-46.72,-23.59)];
 const points=selectPublicPins([...signals,...service],coords=>({x:coords[0]*10000,y:coords[1]*10000}),12,65);
 assert.ok(points.length<=65);
 assert.ok(points.some(x=>x.type==='hospital'));
 assert.ok(points.some(x=>x.type==='combustivel'));
 assert.ok(points.some(x=>x.type==='saude'));
 assert.ok(points.some(x=>x.type==='semaforo'));
});
test('moving, zooming and source tile refresh preserve previously mapped coordinates',()=>{
 const cache=new Map(),mapped=[
  f('A','semaforo',88,-46.68,-23.58),
  f('B','hospital',58,-46.67,-23.57),
  f('C','combustivel',37,-46.66,-23.56)];
 rememberMapFeatures(cache,mapped);
 rememberMapFeatures(cache,[]);
 rememberMapFeatures(cache,[{...mapped[0],coords:[-46.680002,-23.580002]}]);
 const retained=cachedMapFeatures(cache);
 assert.deepEqual(retained.find(x=>x.id==='A').coords,[-46.68,-23.58]);
 const visible=zoom=>selectPublicPins(retained,c=>({x:c[0]*6000,y:c[1]*6000}),zoom,65).map(x=>x.id);
 assert.deepEqual(visible(12),visible(18));
});
test('map updates POI tiles progressively on source-data events instead of waiting for idle',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('./mapboxPoiFallback.js',import.meta.url),'utf8');
 assert.match(overlay,/map\.on\('sourcedata',scheduleVectorUpdate\)/);
 assert.match(overlay,/map\.off\('sourcedata',scheduleVectorUpdate\)/);
 assert.match(overlay,/vectorTimer=setTimeout\(\(\)=>\{/);
 assert.match(overlay,/mapTilesItems=cachedMapFeatures\(stableTileCache\)/);
 assert.match(overlay,/const markerBudget=Math\.max\(100,Math\.min\(300,/);
 assert.match(overlay,/if\(!bbox\)\{[\s\S]*?updateVectorPoi\(\);mergeSources\(\);render\(\);setNotice\(''\);return;/);
 assert.doesNotMatch(source,/if\(typeof map\.isStyleLoaded==='function'&&!map\.isStyleLoaded\(\)\)return \[\]/);
 assert.match(source,/max=460/);
 assert.ok('combustivel' in ICON_THEME&&'hospital' in ICON_THEME&&'semaforo' in ICON_THEME);
});
