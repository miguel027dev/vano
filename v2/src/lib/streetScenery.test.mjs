import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncNight3DScene,NIGHT_TREES_SOURCE,NIGHT_TREE_CANOPY,NIGHT_TREE_TRUNK} from './night3DScene.js';

const readStyle = mode => JSON.parse(readFileSync(new URL('../../public/mapbox/vano-atlas-'+mode+'.json',import.meta.url),'utf8'));

test('both Atlas map themes retain original mapped roads and add limited streetscape detail',()=>{
 for(const mode of ['light','black']){
  const style=readStyle(mode);
  assert.equal(style.sources['vano-streets'].url,'mapbox://mapbox.mapbox-streets-v8');
  assert.ok(style.layers.some(x=>x.id==='vano-buildings-3d'&&x.type==='fill-extrusion'));
  const curb=style.layers.find(x=>x.id==='vano-sidewalk-edge');
  const road=style.layers.find(x=>x.id==='vano-road-base-case');
  assert.ok(curb&&road);
  assert.equal(curb.source,'vano-streets');
  assert.equal(curb['source-layer'],'road');
  assert.ok(style.layers.indexOf(curb)<style.layers.indexOf(road));
  assert.ok(curb.minzoom>=16);
  assert.ok(style.layers.find(x=>x.id==='vano-footpaths')['paint']['line-opacity']>=0.8);
 }
});
function fakeMap(){
 const sources=new Map([['vano-streets',{type:'vector'}]]),layers=new Map();
 let recorded=null;
 const park={type:'Feature',properties:{class:'park'},geometry:{type:'Polygon',coordinates:[[[-46.685,-23.59],[-46.675,-23.59],[-46.675,-23.58],[-46.685,-23.58],[-46.685,-23.59]]]}};
 return {
  sources,layers,get recorded(){return recorded;},
  getSource:id=>sources.get(id),getLayer:id=>layers.get(id),
  removeLayer:id=>layers.delete(id),removeSource:id=>sources.delete(id),
  addSource(id){sources.set(id,{setData(data){recorded=data;}});},
  addLayer(layer){layers.set(layer.id,layer);},
  getZoom:()=>17,getStyle:()=>({layers:[{type:'symbol',id:'labels',layout:{'text-field':['get','name']}}]}),
  getBounds:()=>({getWest:()=>-46.685,getEast:()=>-46.675,getSouth:()=>-23.59,getNorth:()=>-23.58}),
  querySourceFeatures:(source,opts)=>{assert.equal(source,'vano-streets');assert.equal(opts.sourceLayer,'landuse');return [park];},
  setFog() {},
 };
}
test('both themes render bounded park trees using the real V2 Atlas landuse source',()=>{
 for(const appearance of ['light','dark']){
  const map=fakeMap();
  syncNight3DScene(map,{appearance,layer:'streets',navigation:false,memory:8,cores:8,now:100000});
  assert.ok(map.sources.has(NIGHT_TREES_SOURCE));
  assert.ok(map.layers.has(NIGHT_TREE_TRUNK));
  assert.ok(map.layers.has(NIGHT_TREE_CANOPY));
  assert.ok(map.recorded.features.length>0);
  assert.ok(map.recorded.features.length<=144);
 }
});
test('satellite and low-memory devices do not add decorative trees',()=>{
 for(const options of [{appearance:'light',layer:'satellite',memory:8,cores:8},{appearance:'dark',layer:'streets',memory:2,cores:2}]){
  const map=fakeMap();syncNight3DScene(map,{...options,now:100000});
  assert.equal(map.sources.has(NIGHT_TREES_SOURCE),false);
 }
});
