import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {secureHeaders} from '../../server/security.mjs';
import {leafletTilesFor,mapboxStyleFor} from './mapLayers.js';
const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
test('production policy permits all genuine raster and fallback map imagery',()=>{
 const policy=secureHeaders(true)['Content-Security-Policy'];
 const img=policy.split('; ').find(x=>x.startsWith('img-src '));
 for(const domain of ['https://*.mapbox.com','https://*.tile.openstreetmap.org','https://server.arcgisonline.com']){
  assert.ok(img.includes(domain),'blocked essential map tile host: '+domain);
 }
 assert.ok(leafletTilesFor('streets').url.includes('tile.openstreetmap.org'));
 assert.ok(leafletTilesFor('satellite').url.includes('server.arcgisonline.com'));
 assert.equal(mapboxStyleFor('streets','/mapbox/vano-atlas-light.json'),'/mapbox/vano-atlas-light.json');
 assert.match(policy,/frame-ancestors 'none'/,'map fallback does not reduce frame protection');
 assert.match(policy,/script-src 'self'/,'map fallback does not relax scripts');
});
test('Mapbox startup/WebGL/style failures recover on the shared map renderer without a false error banner',()=>{
 assert.match(component,/mapboxgl\.supported\(\)/);
 assert.match(component,/\[forceRaster,setForceRaster\]=useState\(false\)/);
 assert.match(component,/if\(token && !forceRaster/);
 assert.match(component,/setForceRaster\(true\)/);
 assert.match(component,/webglcontextlost/);
 assert.match(component,/styleWatchdog=setTimeout/);
 assert.match(component,/setError\(''\);/);
 assert.doesNotMatch(component,/Falha na renderização Mapbox\. Reinicie o mapa/);
 assert.match(component,/map=L\.map\(root\.current/);
 assert.match(component,/map\?\.remove\?\.\(\)/);
});
test('route, satellite, GPS and camera remain shared by both /mapa and /v2',()=>{
 const app=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(app,/import VanoMap from '..\/components\/VanoMap'/);
 assert.match(component,/paintLeaflet\(map,latest\.current\)/);
 assert.match(component,/paintMapbox\(map,latest\.current,lastSelection\)/);
 assert.match(component,/leafletTilesFor\(layer\)/);
 assert.match(component,/motionController\(map,latest,status\)/);
});
