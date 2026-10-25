import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leafletTilesFor,leafletBackupTilesFor} from './mapLayers.js';
const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
test('invalid/restricted Mapbox pk falls back to a token-free raster map',()=>{
 assert.match(component,/code===401\|\|code===403/);
 assert.match(component,/setForceRaster\(true\)/);
 assert.match(component,/installLeafletBasemap\(map,latest\.current\.layer,forceRaster\?'':token/);
 assert.match(component,/leafletTilesFor\(layer,forceRaster\?'':token/);
 for(const layer of ['streets','satellite'])
  assert.deepEqual(leafletTilesFor(layer,''),leafletBackupTilesFor(layer));
});
test('a rejected or slow custom style retries the original Mapbox style before raster and ignores optional errors',()=>{
 assert.match(component,/if\(!styleRecoveryAttempted\)/);
 assert.match(component,/map\.setStyle\(original,\{diff:false\}\)/);
 assert.match(component,/\(authFailed\|\|styleFailed\)&&!isLoaded\(map\)/);
 assert.match(component,/map\.setStyle\(selectedStyle,\{diff:false\}\)/);
 assert.doesNotMatch(component,/map\.setStyle\(fallbackStyle,\{diff:false\}\)/);
});
test('radar or traffic overlay error cannot replace an already-loaded 3D basemap',()=>{
 assert.match(component,/VANO optional map overlays unavailable; vector basemap retained/);
 const start=component.indexOf('try{paintMapbox(map,latest.current,lastSelection);}');
 const end=component.indexOf("setError('');centerOnFirstGpsFix()",start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(component.slice(start,end),/setForceRaster\(true\)/);
 assert.match(component,/attachPublicMapOverlay\(/);
 assert.match(component,/syncPrivateRoadSignMarkers\(/);
});
test('continuous paint animation defaults off, reducing unstable WebGL writes on production',()=>{
 assert.match(component,/VITE_V2_ROUTE_FLOW_ANIMATION==='1'/);
 assert.match(component,/if\(import\.meta\.env\.VITE_V2_ROUTE_FLOW_ANIMATION==='1'\)\s*updateV2RouteFlow\(/);
});
test('map authorization errors do not print token-containing error messages',()=>{
 assert.match(component,/The provider message can contain access_token URLs/);
 assert.doesNotMatch(component,/console\.warn\('Mapbox:',message\)/);
});
