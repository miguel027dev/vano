import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncNight3DScene} from './night3DScene.js';
import {cameraTarget} from './navigationMotion.js';

function mock({legacySdk=false}={}){
 const configs=[];
 const map={configs,
  setConfigProperty:(importName,key,value)=>{
   if(legacySdk&&['show3dTrees','show3dBuildings'].includes(key))throw Error('unsupported config');
   configs.push([importName,key,value]);
  }
 };
 return map;
}
test('native Mapbox Standard night provides authentic 3D trees, models and lighting',()=>{
 const map=mock();
 assert.equal(syncNight3DScene(map,{appearance:'dark',layer:'streets',navigation:true}),true);
 assert.deepEqual(map.configs,[
  ['basemap','lightPreset','night'],
  ['basemap','show3dObjects',true],
  ['basemap','show3dTrees',true],
  ['basemap','show3dBuildings',true]
 ]);
 assert.equal(syncNight3DScene(map,{appearance:'dark',layer:'streets',navigation:true}),true);
 assert.equal(map.configs.length,4,'idle and moveend do not repeat expensive style reconfiguration');
});
test('only dark street mode adds native 3D: light and satellite remain untouched',()=>{
 for(const opts of [{appearance:'light',layer:'streets'},{appearance:'dark',layer:'satellite'}]){
  const map=mock();
  assert.equal(syncNight3DScene(map,opts),false);
  assert.deepEqual(map.configs,[]);
 }
});
test('older GL renderer still enables native 3D objects even when specific tree flag unsupported',()=>{
 const map=mock({legacySdk:true});
 assert.equal(syncNight3DScene(map,{appearance:'dark',layer:'streets'}),true);
 assert.deepEqual(map.configs,[
  ['basemap','lightPreset','night'],['basemap','show3dObjects',true]
 ]);
});
test('no locally generated fake trees, polygons or sources remain in the map pipeline',()=>{
 const code=readFileSync(new URL('./night3DScene.js',import.meta.url),'utf8');
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(code,/decorativeTreeCollection|NIGHT_TREE_CANOPY|vano-night-trees|querySourceFeatures|fill-extrusion/);
 assert.match(code,/show3dTrees/);
 assert.match(code,/show3dObjects/);
 assert.match(component,/syncNight3DScene\(map,/);
 assert.match(component,/config:nativeNightMapboxConfig/);
 assert.match(component,/map\.on\('style\.load',update\)/);
 assert.match(component,/map\.on\('idle',ensureNight3d\)/);
 assert.match(component,/paintMapbox\(map,latest\.current,lastSelection\)/);
 assert.match(component,/setForceRaster\(true\)/);
});
test('previous navigation camera behavior remains independent of tree rendering',()=>{
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
});
