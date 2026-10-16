import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapboxStyleFor,leafletTilesFor,leafletBackupTilesFor,normalizedMapLayer} from './mapLayers.js';
test('troca Mapa/Satélite para estilos Mapbox reais',()=>{
  assert.match(mapboxStyleFor('streets'),/streets-v12$/);
  assert.match(mapboxStyleFor('satellite'),/satellite-streets-v12$/);
  assert.notEqual(mapboxStyleFor('streets'),mapboxStyleFor('satellite'));
});
test('Leaflet fallback uses licensed Mapbox raster tiles (not blocked volunteer OSM)',()=>{
  const token='pk.public_test_token';
  const streets=leafletTilesFor('streets',token);
  const satellite=leafletTilesFor('satellite',token);
  assert.match(streets.url,/api\\.mapbox\\.com\\/styles\\/v1\\/mapbox\\/streets-v12\\/tiles\\/512/);
  assert.match(satellite.url,/satellite-streets-v12\\/tiles\\/512/);
  assert.equal(streets.tileSize,512);
  assert.equal(streets.zoomOffset,-1);
  assert.match(streets.attribution,/OpenStreetMap/);
  assert.doesNotMatch(streets.url,/tile\\.openstreetmap\\.org/);
  assert.equal(normalizedMapLayer('wrong'),'streets');
});
test('without a token, Leaflet falls back to a provider-owned raster host',()=>{
  for(const layer of ['streets','satellite']){
    const item=leafletTilesFor(layer);
    assert.equal(item.url,leafletBackupTilesFor(layer).url);
    assert.match(item.url,/server\\.arcgisonline\\.com/);
    assert.doesNotMatch(item.url,/tile\\.openstreetmap\\.org/);
  }
});

test('estilo Atlas opcional só altera ruas e preserva satélite',()=>{
  assert.equal(mapboxStyleFor('streets','/mapbox/vano-atlas-light.json'),'/mapbox/vano-atlas-light.json');
  assert.match(mapboxStyleFor('satellite','/mapbox/vano-atlas-light.json'),/satellite-streets-v12$/);
});
