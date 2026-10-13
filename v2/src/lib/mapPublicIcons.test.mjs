import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iconSvg,ICON_THEME,selectPublicPins,mapFeatureBBox} from './mapPublicIcons.js';

test('every supported map category has a static safe icon for light mode',()=>{
 assert.ok(Object.keys(ICON_THEME).length>=17);
 for(const category of Object.keys(ICON_THEME)){
   const svg=iconSvg(category);
   assert.match(svg,/^<svg/);
   assert.match(svg,/<\/svg>$/);
   assert.ok(!svg.includes('<script'));
 }
 assert.ok(iconSvg('radar').includes('circle'));
});
test('safety critical radar appears first even amid overlapping less important features',()=>{
 const features=[
  {id:'hospital',type:'hospital',priority:50,coords:[0,0]},
  {id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'work',type:'obra',priority:60,coords:[1,0]}
 ];
 const selected=selectPublicPins(features,coords=>({x:coords[0]*100,y:coords[1]*100}),15,20);
 assert.deepEqual(selected.map(x=>x.id),['radar','work']);
});
test('low zoom hides clutter but does not fabricate or replace source data',()=>{
 const features=[{id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'p',type:'estacionamento',priority:22,coords:[1,1]}];
 const project=c=>({x:c[0]*100,y:c[1]*100});
 assert.deepEqual(selectPublicPins(features,project,12).map(x=>x.id),['radar']);
 assert.deepEqual(selectPublicPins(features,project,14).map(x=>x.id),['radar','p']);
 assert.deepEqual(selectPublicPins(features,project,16).map(x=>x.id),['radar','p']);
});
test('mobile pin coordinates are bounded to a safe viewport query',()=>{
 const map={
  getZoom:()=>17,
  getCenter:()=>({lng:-46.68,lat:-23.58}),
  getBounds:()=>({getEast:()=>-46.50,getWest:()=>-46.80,getNorth:()=>-23.45,getSouth:()=>-23.75})
 };
 const b=mapFeatureBBox(map,'mapbox');
 assert.ok(b[2]-b[0]<=.056001&&b[3]-b[1]<=.050001);
 assert.ok(mapFeatureBBox({...map,getZoom:()=>12.4},'leaflet'));
 assert.equal(mapFeatureBBox({...map,getZoom:()=>11},'leaflet'),null);
});
test('map overlay keeps GPS geometry, Mapbox style switching and attribution untouched',()=>{
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 assert.match(component,/attachPublicMapOverlay\(map,backend.current\)/);
 assert.match(component,/detachPublicPins\?\.\(\)/);
 assert.match(overlay,/map.on\('moveend',schedule\)/);
 assert.match(overlay,/map.off\('moveend',schedule\)/);
 assert.match(overlay,/marker\.setPopup/);
 assert.match(overlay,/marker\.bindPopup/);
 assert.match(overlay,/textContent='© OpenStreetMap contributors · ODbL'/);
 assert.match(css,/width:44px;height:44px/);
 assert.match(css,/@media\(max-width:370px\)/);
});

test('normal VANO launch zoom includes radar and essential services without filling every cell',()=>{
 const points=[{id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'hospital',type:'hospital',priority:58,coords:[1,0]},
  {id:'bombeiros',type:'bombeiros',priority:56,coords:[2,0]},
  {id:'estacionamento',type:'estacionamento',priority:22,coords:[3,0]}];
 const project=coords=>({x:coords[0]*120+20,y:120});
 assert.deepEqual(selectPublicPins(points,project,12.4,20,{width:400,height:250}).map(x=>x.id),
  ['radar','hospital','bombeiros']);
});
test('bad source is recoverable and does not silently retain a 130-second blank-map state',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(overlay,/v41-public-status/);
 assert.match(overlay,/Dados públicos indisponíveis/);
 assert.match(overlay,/Falha ao carregar pontos/);
 assert.match(overlay,/lastRead=0;latestKey=''/);
 assert.match(overlay,/selectPublicPins\(items,project,zoom,55,\{width:/);
});
