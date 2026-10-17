import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decorativeTreeCollection,nightSceneTreeBudget,syncNight3DScene,
 NIGHT_GREEN_ID,NIGHT_ROAD_ID,NIGHT_TREES_SOURCE,NIGHT_TREE_CANOPY,NIGHT_TREE_TRUNK} from './night3DScene.js';
import {cameraTarget} from './navigationMotion.js';

const park={type:'Feature',properties:{class:'park'},geometry:{type:'Polygon',coordinates:[[
 [-46.685,-23.585],[-46.679,-23.585],[-46.679,-23.579],[-46.685,-23.579],[-46.685,-23.585]
]]}};
const building={type:'Feature',properties:{class:'residential'},geometry:park.geometry};
const bounds={west:-46.685,east:-46.679,south:-23.585,north:-23.579};
function mock({zoom=17,features=[park]}={}){
 const layers=[{id:'road',type:'line'},{id:'label',type:'symbol',layout:{'text-field':['get','name']}}];
 const sources=new Map([['composite',{}]]);
 const adds=[],removals=[],fogs=[];
 return {
  adds,removals,fogs,sources,layers,
  getLayer:id=>layers.find(l=>l.id===id),getSource:id=>sources.get(id),
  getStyle:()=>({layers}),
  addLayer:(layer,before)=>{adds.push({layer,before});layers.push(layer);},
  removeLayer:id=>{removals.push(id);layers.splice(layers.findIndex(l=>l.id===id),1);},
  addSource:(id,value)=>sources.set(id,{...value,setData(data){this.data=data}}),
  removeSource:id=>sources.delete(id),
  getZoom:()=>zoom,
  getBounds:()=>({getWest:()=>bounds.west,getEast:()=>bounds.east,getNorth:()=>bounds.north,getSouth:()=>bounds.south}),
  querySourceFeatures:()=>features,
  setFog:value=>fogs.push(value)
 };
}
test('decorative low-poly trees originate exclusively inside mapped green polygons',()=>{
 const data=decorativeTreeCollection([building,park],bounds,{limit:20});
 assert.ok(data.features.length>0);
 assert.ok(data.features.length<=40,'bounded trunk + canopy geometry');
 assert.equal(data.features.length%2,0);
 for(const feat of data.features){
  const vertex=feat.geometry.coordinates[0][0];
  assert.ok(vertex[0]>=bounds.west-.001&&vertex[0]<=bounds.east+.001);
  assert.ok(vertex[1]>=bounds.south-.001&&vertex[1]<=bounds.north+.001);
 }
 assert.equal(decorativeTreeCollection([building],bounds).features.length,0);
 assert.equal(decorativeTreeCollection([park],{...bounds,east:bounds.west}).features.length,0);
});
test('dark scene adds fog, landuse, subtle road depth and 3D trees below labels',()=>{
 const map=mock();
 assert.equal(syncNight3DScene(map,{appearance:'dark',layer:'streets',navigation:true,memory:8,now:5000}),true);
 assert.ok(map.getLayer(NIGHT_GREEN_ID));
 assert.ok(map.getLayer(NIGHT_ROAD_ID));
 assert.ok(map.getLayer(NIGHT_TREE_TRUNK));
 assert.ok(map.getLayer(NIGHT_TREE_CANOPY));
 assert.ok(map.getSource(NIGHT_TREES_SOURCE).data.features.length>0);
 assert.equal(map.adds.find(x=>x.layer.id===NIGHT_TREE_CANOPY).before,'label');
 assert.equal(map.fogs.length,1);
 assert.ok(map.fogs[0]['horizon-blend']<.15);
 const adds=map.adds.length;
 syncNight3DScene(map,{appearance:'dark',layer:'streets',navigation:true,memory:8,now:5100});
 assert.equal(map.adds.length,adds,'cannot duplicate sources or layers during style idle');
 assert.equal(map.fogs.length,1,'cannot overwrite atmosphere every frame');
 syncNight3DScene(map,{appearance:'dark',layer:'satellite',navigation:true,memory:8,now:8000});
 assert.equal(map.getSource(NIGHT_TREES_SOURCE),undefined);
 assert.equal(map.getLayer(NIGHT_GREEN_ID),undefined);
 assert.equal(map.getLayer(NIGHT_ROAD_ID),undefined);
 assert.equal(map.fogs.at(-1),null,'restore default atmosphere');
});
test('trees disappear when leaving navigation and low-end phones get a light scene',()=>{
 assert.equal(nightSceneTreeBudget({memory:2,cores:8}),0);
 assert.equal(nightSceneTreeBudget({memory:8,cores:2}),0);
 assert.equal(nightSceneTreeBudget({memory:8,cores:8,saveData:true}),0);
 assert.equal(nightSceneTreeBudget({memory:8,cores:8}),72);
 const low=mock();
 syncNight3DScene(low,{appearance:'dark',navigation:true,memory:2,now:5000});
 assert.ok(low.getLayer(NIGHT_GREEN_ID));
 assert.equal(low.getLayer(NIGHT_TREE_CANOPY),undefined);
 const high=mock();
 syncNight3DScene(high,{appearance:'dark',navigation:true,memory:8,now:5000});
 assert.ok(high.getLayer(NIGHT_TREE_CANOPY));
 syncNight3DScene(high,{appearance:'dark',navigation:false,memory:8,now:6000});
 assert.equal(high.getSource(NIGHT_TREES_SOURCE),undefined);
});
test('dark camera keeps the original maneuver safety and reduced-motion settings',()=>{
 const point=[-46.68,-23.58],destination=[-46.67,-23.58];
 const standard={position:point,destination,navigation:true,experimentalCameraV2:true,
  route:{geometry:{coordinates:[point,destination]}},telemetry:{speed:10,heading:90,accuracy:7}};
 const base=cameraTarget(standard),dark=cameraTarget({...standard,immersiveDark:true});
 assert.ok(dark.pitch>base.pitch&&dark.pitch<=58);
 assert.ok(dark.zoom<base.zoom);
 assert.equal(dark.bearing,base.bearing);
 assert.deepEqual(cameraTarget({...standard,immersiveDark:true,reducedMotion:true}),
  cameraTarget({...standard,reducedMotion:true}));
 assert.deepEqual(cameraTarget({...standard,immersiveDark:true,compactViewport:true}),
  cameraTarget({...standard,compactViewport:true}));
 const arriving={...standard,destination:[-46.6801,-23.58]};
 assert.deepEqual(cameraTarget({...arriving,immersiveDark:true}),cameraTarget(arriving));
});
test('style load and moving camera reapply scene without changing route layers',()=>{
 const source=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(source,/syncNight3DScene\(map,/);
 assert.match(source,/map\.on\('moveend',ensureNight3d\)/);
 assert.match(source,/map\.on\('idle',ensureNight3d\)/);
 assert.match(source,/immersiveDark:Boolean\(d\.navigation\)&&night3dEnabled\(d\.appearance,d\.layer\)/);
 assert.match(source,/paintMapbox\(map,latest\.current,lastSelection\)/);
});
