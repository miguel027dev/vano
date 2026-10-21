import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {secureHeaders} from '../../server/security.mjs';
import {leafletTilesFor,mapboxStyleFor,leafletBackupTilesFor} from './mapLayers.js';

const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
test('production CSP allows licensed Mapbox and Esri imagery, not OSM volunteer hosting',()=>{
 const policy=secureHeaders(true)['Content-Security-Policy'];
 const img=policy.split('; ').find(x=>x.startsWith('img-src '));
 for(const domain of ['https://*.mapbox.com','https://server.arcgisonline.com'])
  assert.ok(img.includes(domain),'missing authorized tile provider '+domain);
 assert.ok(!img.includes('tile.openstreetmap.org'));
 assert.ok(leafletTilesFor('streets','pk.test').url.includes('api.mapbox.com'));
 assert.ok(leafletTilesFor('satellite','pk.test').url.includes('api.mapbox.com'));
 assert.ok(leafletBackupTilesFor('streets').url.includes('server.arcgisonline.com'));
 assert.ok(!component.includes('https://{s}.tile.openstreetmap.org'));
 assert.equal(mapboxStyleFor('streets','/mapbox/vano-atlas-light.json'),'/mapbox/vano-atlas-light.json');
 assert.ok(policy.includes("frame-ancestors 'none'"));
 assert.ok(policy.includes("script-src 'self'"));
});
test('Mapbox/WebGL/style recovery keeps Leaflet fallback and error-tile placeholder',()=>{
 for(const token of ['mapboxgl.supported()','[forceRaster,setForceRaster]=useState(false)',
 'if(token && !forceRaster','setForceRaster(true)','webglcontextlost',
 'styleWatchdog=setTimeout','installLeafletBasemap(map,latest.current.layer,forceRaster?\'\':token',
 'errorTileUrl:EMPTY_TILE','leafletBackupTilesFor(layer)','map=L.map(root.current'])
  assert.ok(component.includes(token),'missing recovery path: '+token);
 assert.ok(!component.includes('Falha na renderização Mapbox. Reinicie o mapa'));
});
test('GPS, routes, camera and satellite stay shared by /mapa and /v2',()=>{
 const app=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 for(const token of ['import VanoMap','paintLeaflet(map,latest.current)',
 'paintMapbox(map,latest.current,lastSelection)','leafletTilesFor(layer,forceRaster?\'\':token,appearance)',
 'motionController(map,latest,status)'])
  assert.ok((token==='import VanoMap'?app:component).includes(token));
});
