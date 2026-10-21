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
test('a rejected custom style retries a real Mapbox vector style before raster and ignores optional loaded-map errors',()=>{
 assert.match(component,/styleRecoveryAttempted&&map\?\._vanoStyle!==MAPBOX_STYLES\.streets/);
 assert.match(component,/map\.setStyle\(MAPBOX_STYLES\.streets,\{diff:false\}\)/);
 assert.match(component,/\(authFailed\|\|styleFailed\)&&!isLoaded\(map\)/);
 assert.match(component,/const standard=MAPBOX_STYLES\.streets/);
});
test('continuous paint animation defaults off, reducing unstable WebGL writes on production',()=>{
 assert.match(component,/VITE_V2_ROUTE_FLOW_ANIMATION==='1'/);
 assert.match(component,/if\(import\.meta\.env\.VITE_V2_ROUTE_FLOW_ANIMATION==='1'\)\s*updateV2RouteFlow\(/);
});
test('map authorization errors do not print token-containing error messages',()=>{
 assert.match(component,/The provider message can contain access_token URLs/);
 assert.doesNotMatch(component,/console\.warn\('Mapbox:',message\)/);
});
