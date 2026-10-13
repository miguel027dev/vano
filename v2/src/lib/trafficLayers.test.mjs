import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 TRAFFIC_SOURCE_ID,TRAFFIC_TILESET,TRAFFIC_PALETTE,TRAFFIC_LAYER_IDS,
 TRAFFIC_ZOOM_CATEGORIES,TRAFFIC_CONGESTION,ensureTrafficLayers,
 setTrafficVisibility,trafficLayerSpec
} from './trafficLayers.js';
import {municipalTrafficBBox,attachMunicipalTrafficOverlay} from './trafficMunicipal.js';

function mapStub(){
 const sources=new Map(),layers=new Map(),adds=[],properties=[],events=new Map();
 return {
  sources,layers,adds,properties,events,
  getSource:id=>sources.get(id),
  addSource:(id,value)=>{sources.set(id,value);adds.push({type:'source',id,value});},
  getLayer:id=>id==='street-label'?{id:'street-label',type:'symbol'}:layers.get(id),
  addLayer:(value,before)=>{layers.set(value.id,value);adds.push({type:'layer',id:value.id,value,before});},
  getStyle:()=>({layers:[{id:'road',type:'line'},{id:'street-label',type:'symbol'}]}),
  isStyleLoaded:()=>true,
  setLayoutProperty:(id,prop,value)=>properties.push([id,prop,value]),
  getZoom:()=>15,
  getCenter:()=>({lng:-46.68,lat:-23.58}),
  getBounds:()=>({getWest:()=>-46.72,getEast:()=>-46.63,getSouth:()=>-23.61,getNorth:()=>-23.54}),
  on:(name,callback)=>events.set(name,callback),
  off:(name,callback)=>{if(events.get(name)===callback)events.delete(name)}
 };
}
test('one Mapbox vector source paints only amber and red congested roads',()=>{
 const map=mapStub(),statuses=[];
 assert.equal(ensureTrafficLayers(map,{enabled:true,onStatus:x=>statuses.push(x)}),true);
 assert.deepEqual(statuses,['available']);
 assert.equal(map.sources.get(TRAFFIC_SOURCE_ID).url,'mapbox://mapbox.mapbox-traffic-v1');
 assert.equal(TRAFFIC_TILESET,'mapbox://mapbox.mapbox-traffic-v1');
 assert.deepEqual(TRAFFIC_PALETTE,{free:'#20B486',moderate:'#E8B04C',heavy:'#DF625C'});
 assert.deepEqual(TRAFFIC_CONGESTION,['moderate','heavy','severe']);
 assert.ok(!TRAFFIC_CONGESTION.includes('low'));
 assert.ok(!JSON.stringify(trafficLayerSpec(TRAFFIC_ZOOM_CATEGORIES[0]).paint['line-color']).includes('#20B486'));
 assert.equal(TRAFFIC_PALETTE.free,'#20B486','the existing traffic button can retain its green stripe');
 assert.deepEqual(TRAFFIC_ZOOM_CATEGORIES.map(x=>x.minzoom),[8.5,11.5,14]);
 assert.equal(map.layers.size,3);
 for(const id of TRAFFIC_LAYER_IDS){
  const spec=map.layers.get(id);
  assert.equal(spec.source,TRAFFIC_SOURCE_ID);
  assert.equal(spec['source-layer'],'traffic');
  assert.equal(spec.paint['line-color'][3],TRAFFIC_PALETTE.moderate);
  assert.equal(spec.paint['line-color'][7],TRAFFIC_PALETTE.heavy);
  assert.deepEqual(spec.filter[1][2][1],['moderate','heavy','severe']);
  assert.ok(spec.paint['line-width']);
  assert.ok(spec.paint['line-offset']);
  assert.equal(map.adds.find(x=>x.id===id).before,'street-label',
   'traffic strokes are below road names');
 }
 assert.equal(map.sources.size,1);
});
test('traffic toggles without destroying route layers, tile source, map or GPS',()=>{
 const map=mapStub();
 ensureTrafficLayers(map);
 const before=map.adds.length;
 ensureTrafficLayers(map,{enabled:false});
 assert.equal(map.adds.length,before);
 assert.deepEqual(map.properties.slice(-3).map(x=>x[2]),['none','none','none']);
 setTrafficVisibility(map,true);
 assert.deepEqual(map.properties.slice(-3).map(x=>x[2]),['visible','visible','visible']);
 const another=mapStub();
 assert.equal(ensureTrafficLayers(another),true,
  'fresh map style after satellite switch gets an independent traffic source again');
});
test('provider and style errors fail closed without breaking navigation',()=>{
 const map=mapStub();
 map.addSource=()=>{throw Error('mapbox traffic tile unavailable');};
 let state='';
 assert.equal(ensureTrafficLayers(map,{onStatus:x=>{state=x}}),false);
 assert.equal(state,'unavailable');
 assert.deepEqual(map.sources.size,0);
 assert.deepEqual(map.layers.size,0);
});
test('coarse zoom shows highways, higher zoom reveals local streets without 3px scribbles everywhere',()=>{
 assert.deepEqual(TRAFFIC_ZOOM_CATEGORIES.map(x=>x.classes.includes('street')),[false,false,true]);
 assert.ok(trafficLayerSpec(TRAFFIC_ZOOM_CATEGORIES[0]).paint['line-opacity']);
 assert.ok(trafficLayerSpec(TRAFFIC_ZOOM_CATEGORIES[0]).filter);
 assert.equal(trafficLayerSpec(TRAFFIC_ZOOM_CATEGORIES[2]).minzoom,14);
 assert.ok(trafficLayerSpec(TRAFFIC_ZOOM_CATEGORIES[2]).layout['line-cap']==='round');
 assert.ok(TRAFFIC_LAYER_IDS.every(id=>id.startsWith('vano-traffic-')));
});
test('municipal camera query bounded by viewport, with graceful low zoom',()=>{
 const map=mapStub();
 const bbox=municipalTrafficBBox(map);
 assert.ok(Array.isArray(bbox)&&bbox.length===4);
 assert.ok(bbox[2]-bbox[0]<=.20001);
 assert.ok(bbox[3]-bbox[1]<=.16001);
 assert.equal(municipalTrafficBBox({...map,getZoom:()=>9}),null);
});
test('optional municipal adapter never activates without verified server feed',()=>{
 const map=mapStub();
 const adapter=attachMunicipalTrafficOverlay(map,{enabled:false,request:async()=>{throw Error('unexpected call')}});
 assert.equal(map.sources.size,0);
 assert.ok(map.events.has('style.load'));
 assert.ok(map.events.has('moveend'));
 adapter.dispose();
 assert.equal(map.events.size,0);
});
test('map control is accessible, separately switchable, and map retains orange route paint',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v45-traffic.css',import.meta.url),'utf8');
 const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
 assert.match(page,/\[trafficEnabled,setTrafficEnabled\]=useState/);
 assert.match(page,/aria-pressed=\{trafficEnabled\}/);
 assert.match(page,/onClick=\{\(\)=>setTrafficEnabled\(value=>!value\)\}/);
 assert.match(page,/trafficEnabled=\{trafficEnabled\} onTrafficStatus=\{setTrafficStatus\}/);
 assert.match(map,/ensureTrafficLayers\(map,\{enabled:latest\.current\.trafficEnabled/);
 assert.match(map,/attachMunicipalTrafficOverlay\(map/);
 assert.match(map,/setTrafficVisibility\(map,trafficEnabled\)/);
 assert.match(map,/'line-color':'#ff7900'/);
 assert.match(main,/v45-traffic\.css/);
 assert.match(css,/\.v45-traffic-glyph/);
 assert.match(css,/#20B486/);
 assert.match(css,/#E8B04C/);
 assert.match(css,/#DF625C/);
});
