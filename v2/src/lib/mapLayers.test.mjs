import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapboxStyleFor,leafletTilesFor,normalizedMapLayer} from './mapLayers.js';
test('troca Mapa/Satélite para estilos Mapbox reais',()=>{
  assert.match(mapboxStyleFor('streets'),/streets-v12$/);
  assert.match(mapboxStyleFor('satellite'),/satellite-streets-v12$/);
  assert.notEqual(mapboxStyleFor('streets'),mapboxStyleFor('satellite'));
});
test('fallback Leaflet usa imagem de satélite real',()=>{
  assert.match(leafletTilesFor('satellite').url,/World_Imagery/);
  assert.match(leafletTilesFor('streets').url,/openstreetmap/);
  assert.equal(normalizedMapLayer('wrong'),'streets');
});
