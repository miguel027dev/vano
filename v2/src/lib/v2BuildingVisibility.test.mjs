import test from 'node:test';
import assert from 'node:assert/strict';
import {isV2BuildingLayer,targetV2BuildingOpacity,syncV2BuildingVisibility,discardV2BuildingVisibility} from './v2BuildingVisibility.mjs';
import {readFileSync} from 'node:fs';

const building={id:'building-3d',type:'fill-extrusion','source-layer':'building'};
const night={id:'vano-night-3d-buildings',type:'fill-extrusion','source-layer':'building'};
const tree={id:'vano-night-tree-trunk',type:'fill-extrusion','source-layer':'tree'};
const bridge={id:'bridge-3d',type:'fill-extrusion','source-layer':'bridge'};
const fake={id:'building-outline',type:'line','source-layer':'building'};
function mapFixture(){
  const layers=[building,night,tree,bridge,fake];
  const paints=new Map([['building-3d',.95],['vano-night-3d-buildings',.87],['vano-night-tree-trunk',.9]]);
  const changes=[];
  return {
    layers,paints,changes,
    getStyle(){return {layers}},
    getLayer(id){return layers.find(l=>l.id===id)},
    getPaintProperty(id,key){return paints.get(id)},
    setPaintProperty(id,key,value){changes.push({id,key,value});if(value===null)paints.delete(id);else paints.set(id,value)}
  };
}
test('only extruded buildings are touched, not tree, bridge or road features',()=>{
  assert.equal(isV2BuildingLayer(building),true);
  assert.equal(isV2BuildingLayer(night),true);
  assert.equal(isV2BuildingLayer(tree),false);
  assert.equal(isV2BuildingLayer(bridge),false);
  assert.equal(isV2BuildingLayer(fake),false);
  assert.equal(targetV2BuildingOpacity(0),.69);
  assert.equal(targetV2BuildingOpacity(1),.47);
  assert.ok(targetV2BuildingOpacity(1)<targetV2BuildingOpacity(.5));
});
test('V2 opacity is reversible and repeated sync does not churn Mapbox style',()=>{
  const map=mapFixture();
  assert.equal(syncV2BuildingVisibility(map,{enabled:true,density:1}),2);
  assert.equal(map.paints.get('building-3d'),.47);
  assert.equal(map.paints.get('vano-night-3d-buildings'),.47);
  assert.equal(map.paints.get('vano-night-tree-trunk'),.9);
  assert.equal(syncV2BuildingVisibility(map,{enabled:true,density:1}),0);
  assert.equal(syncV2BuildingVisibility(map,{enabled:true,density:0}),2);
  assert.equal(map.paints.get('building-3d'),.69);
  assert.equal(syncV2BuildingVisibility(map,{enabled:false}),2);
  assert.equal(map.paints.get('building-3d'),.95);
  assert.equal(map.paints.get('vano-night-3d-buildings'),.87);
});
test('non-V2 never mutates buildings, and theme changes discard stale opacity cache',()=>{
  const map=mapFixture();
  assert.equal(syncV2BuildingVisibility(map,{enabled:false}),0);
  assert.equal(map.changes.length,0);
  syncV2BuildingVisibility(map,{enabled:true,density:.6});
  discardV2BuildingVisibility(map);
  assert.equal(map._vanoV2OriginalBuildings,undefined);
  assert.equal(syncV2BuildingVisibility(map,{enabled:false}),0);
});
test('render path is scoped to /v2 and leaves V1 simulated GPS separate',()=>{
  const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
  const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
  assert.match(page,/v2Experience=\{location\.pathname==='\/v2'\}/);
  assert.match(map,/syncV2BuildingVisibility\(map,\{enabled:latest\.current\.v2Experience/);
  assert.match(map,/discardV2BuildingVisibility\(map\)/);
  assert.match(map,/chooseV2UrbanCamera\(/);
  assert.match(map,/if\(urbanBlend<\.001\)return rampCloseup\(base\)/);
  assert.match(map,/zoom:base\.zoom\+\(Math\.min\(maxZoom,drone\.zoom\)-base\.zoom\)\*urbanBlend/);
  assert.match(page,/simulationPreview=\{simActive\}/);
  assert.match(page,/gpsCoords=\{simPosition\|\|userCoords\}/);
});

test('simulated rear camera gently ghosts 3D walls while normal V2 stays unchanged',()=>{
 const base=targetV2BuildingOpacity(.8);
 const cinematic=targetV2BuildingOpacity(.8,{cinematic:true,obstruction:.3});
 const blocked=targetV2BuildingOpacity(.8,{cinematic:true,obstruction:1,entrance:1});
 assert.ok(base>.45);
 assert.ok(cinematic<base);
 assert.ok(blocked<=.1,'buildings cannot conceal the user during a ramp maneuver');
 assert.ok(blocked>=.07);
 assert.equal(targetV2BuildingOpacity(.8,{cinematic:false,obstruction:1,entrance:1}),base);
});

test('switching the simulation off restores ordinary V2 building fade without leaving stale paint',()=>{
 const map=mapFixture();
 syncV2BuildingVisibility(map,{enabled:true,density:.85,cinematic:true,obstruction:1});
 const veryClear=map.paints.get('building-3d');
 assert.ok(veryClear<.2);
 syncV2BuildingVisibility(map,{enabled:true,density:.85,cinematic:false});
 assert.equal(map.paints.get('building-3d'),targetV2BuildingOpacity(.85));
 syncV2BuildingVisibility(map,{enabled:false});
 assert.equal(map.paints.get('building-3d'),.95);
 assert.equal(map.paints.get('vano-night-tree-trunk'),.9);
});
