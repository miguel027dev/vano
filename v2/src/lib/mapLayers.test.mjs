import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapboxStyleFor,leafletTilesFor,leafletBackupTilesFor,normalizedMapLayer} from './mapLayers.js';

test('Mapa/Satélite use the existing Mapbox style IDs',()=>{
 assert.ok(mapboxStyleFor('streets').endsWith('streets-v12'));
 assert.ok(mapboxStyleFor('satellite').endsWith('satellite-streets-v12'));
 assert.notEqual(mapboxStyleFor('streets'),mapboxStyleFor('satellite'));
});
test('fallback Leaflet requests licensed Mapbox raster, never volunteer OSM tiles',()=>{
 const token='pk.public_test_token';
 for(const mode of ['streets','satellite']){
  const tiles=leafletTilesFor(mode,token);
  assert.ok(tiles.url.startsWith('https://api.mapbox.com/styles/v1/mapbox/'));
  assert.ok(tiles.url.includes('/tiles/512/{z}/{x}/{y}?access_token=pk.public_test_token'));
  assert.ok(!tiles.url.includes('tile.openstreetmap.org'));
  assert.equal(tiles.tileSize,512);
  assert.equal(tiles.zoomOffset,-1);
  assert.ok(tiles.attribution.includes('Mapbox'));
  assert.ok(tiles.attribution.includes('OpenStreetMap'));
 }
 assert.ok(leafletTilesFor('satellite',token).url.includes('satellite-streets-v12'));
 assert.equal(normalizedMapLayer('wrong'),'streets');
});
test('fallback without token uses Esri licensed endpoint, not blocked volunteer OSM',()=>{
 for(const layer of ['streets','satellite']){
  const item=leafletTilesFor(layer);
  assert.equal(item.url,leafletBackupTilesFor(layer).url);
  assert.ok(item.url.includes('server.arcgisonline.com'));
  assert.ok(!item.url.includes('tile.openstreetmap.org'));
 }
});
test('optional local Atlas only alters streets style',()=>{
 assert.equal(mapboxStyleFor('streets','/mapbox/vano-atlas-light.json'),'/mapbox/vano-atlas-light.json');
 assert.ok(mapboxStyleFor('satellite','/mapbox/vano-atlas-light.json').endsWith('satellite-streets-v12'));
});
