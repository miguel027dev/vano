import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {night3dEnabled,syncNight3DBuildings,syncNight3DCamera,NIGHT_3D_BUILDING_ID} from './night3DBuildings.js';

const mapMock=({hasComposite=true,existing3D=false}={})=>{
 const layers=[
  ...(existing3D?[{id:'provider-buildings',type:'fill-extrusion','source-layer':'building'}]:[]),
  {id:'road',type:'line'},
  {id:'place-label',type:'symbol',layout:{'text-field':['get','name']}}
 ];
 const added=[],removed=[],moves=[];
 let pitch=0;
 const map={
  added,removed,moves,
  getSource:id=>id==='composite'&&hasComposite?{}:undefined,
  getLayer:id=>layers.find(x=>x.id===id),
  getStyle:()=>({layers}),
  addLayer(layer,before){added.push({layer,before});layers.push(layer);},
  removeLayer(id){removed.push(id);layers.splice(layers.findIndex(x=>x.id===id),1);},
  getPitch:()=>pitch,
  easeTo:x=>{moves.push(x);pitch=x.pitch;},
  setPitch:x=>{pitch=x}
 };
 return map;
};
test('night buildings are isolated to dark street mode, never daytime or satellite',()=>{
 assert.equal(night3dEnabled('dark','streets'),true);
 assert.equal(night3dEnabled('light','streets'),false);
 assert.equal(night3dEnabled('dark','satellite'),false);
});
test('real mapped building heights are extruded below labels and route layers',()=>{
 const map=mapMock();
 assert.equal(syncNight3DBuildings(map,{appearance:'dark',layer:'streets'}),true);
 assert.equal(map.added.length,1);
 const {layer,before}=map.added[0];
 assert.equal(layer.id,NIGHT_3D_BUILDING_ID);
 assert.equal(layer.type,'fill-extrusion');
 assert.equal(layer.source,'composite');
 assert.equal(layer['source-layer'],'building');
 assert.equal(before,'place-label');
 assert.equal(layer.minzoom,14);
 assert.equal(layer.paint['fill-extrusion-opacity'],.8);
 assert.match(JSON.stringify(layer.paint['fill-extrusion-height']),/height/);
 assert.match(JSON.stringify(layer.paint['fill-extrusion-base']),/min_height/);
 assert.equal(syncNight3DBuildings(map,{appearance:'dark'}),true);
 assert.equal(map.added.length,1,'cannot add duplicates after style load');
 assert.equal(syncNight3DBuildings(map,{appearance:'light'}),false);
 assert.deepEqual(map.removed,[NIGHT_3D_BUILDING_ID]);
});
test('no vector building source, satellite or existing 3D stays safe',()=>{
 const empty=mapMock({hasComposite:false});
 assert.equal(syncNight3DBuildings(empty,{appearance:'dark'}),false);
 assert.equal(empty.added.length,0);
 const existing=mapMock({existing3D:true});
 assert.equal(syncNight3DBuildings(existing,{appearance:'dark'}),true);
 assert.equal(existing.added.length,0);
});
test('camera gives dark free-look depth then restores it with reduced-motion support',()=>{
 const map=mapMock();
 syncNight3DCamera(map,{appearance:'dark',layer:'streets'});
 assert.deepEqual(map.moves[0],{pitch:48,duration:420});
 syncNight3DCamera(map,{appearance:'dark'});
 assert.equal(map.moves.length,1);
 syncNight3DCamera(map,{appearance:'light',reducedMotion:true});
 assert.deepEqual(map.moves[1],{pitch:0,duration:0});
 assert.equal(map._vanoNight3DAutoPitch,undefined);
});
test('navigation and GPS following own the camera: 3D does not change their pitch',()=>{
 const map=mapMock();
 syncNight3DCamera(map,{appearance:'dark',navigation:true});
 syncNight3DCamera(map,{appearance:'dark',following:true});
 assert.deepEqual(map.moves,[]);
 map.setPitch(40);
 syncNight3DCamera(map,{appearance:'dark'});
 assert.deepEqual(map.moves,[]);
});
test('3D is attached to style reload without replacing the underlying map',()=>{
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(component,/syncNight3DBuildings\(map,\{appearance:latest\.current\.appearance,layer:latest\.current\.layer\}\)/);
 assert.match(component,/map\.on\('style\.load',update\)/);
 assert.match(component,/map\.on\('idle',ensureNight3d\)/);
 assert.match(component,/ensureNight3d\(\); \/\/ Insert before route lines/);
 assert.match(component,/paintMapbox\(map,latest\.current,lastSelection\)/);
 assert.match(component,/if\(nightStart\)map\._vanoNight3DAutoPitch=0/);
 assert.match(component,/navigation,following,/);
 assert.match(component,/map\.setStyle\(style,\{diff:false\}\)/);
 assert.match(component,/forceRaster/);
});
