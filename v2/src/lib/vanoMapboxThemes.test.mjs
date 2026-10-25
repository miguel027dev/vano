import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {mapboxStyleFor,VANO_ATLAS_STYLE,VANO_ATLAS_BLACK_STYLE,MAPBOX_STYLES} from './mapLayers.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const light=JSON.parse(read('public/mapbox/vano-atlas-light.json'));
const black=JSON.parse(read('public/mapbox/vano-atlas-black.json'));
const config=JSON.parse(read('src/config/vano-mapbox-white-black.json'));

test('White/Black Mapbox selection uses the VANO Atlas, preserving satellite',()=>{
  assert.equal(config.format,'vano.mapbox.appearance-manifest/v1');
  assert.equal(mapboxStyleFor('streets','', 'light'),VANO_ATLAS_STYLE);
  assert.equal(mapboxStyleFor('streets','', 'dark'),VANO_ATLAS_BLACK_STYLE);
  assert.equal(mapboxStyleFor('streets','', 'black'),VANO_ATLAS_BLACK_STYLE);
  assert.equal(mapboxStyleFor('streets','mapbox://styles/example/custom','light'),'mapbox://styles/example/custom');
  assert.equal(mapboxStyleFor('satellite','', 'dark'),MAPBOX_STYLES.satellite);
  assert.equal(VANO_ATLAS_STYLE,config.themes.light.mapboxStyleUrl);
  assert.equal(VANO_ATLAS_BLACK_STYLE,config.themes.black.mapboxStyleUrl);
});
test('Black Atlas retains every White source, layer, POI, text label and extrusion',()=>{
  assert.equal(black.version,8);
  assert.deepEqual(black.sources,light.sources);
  assert.deepEqual(black.layers.map(x=>({id:x.id,type:x.type,source:x.source,sourceLayer:x['source-layer'],filter:x.filter,layout:x.layout})),
    light.layers.map(x=>({id:x.id,type:x.type,source:x.source,sourceLayer:x['source-layer'],filter:x.filter,layout:x.layout})));
  assert.notEqual(black.layers[0].paint['background-color'],light.layers[0].paint['background-color']);
  for(const id of ['vano-essentials','vano-road-labels','vano-buildings-3d','vano-neighborhood-names']){
    assert.ok(light.layers.some(x=>x.id===id));
    assert.ok(black.layers.some(x=>x.id===id));
  }
  assert.equal(config.preservation.keepExistingPOIAndRadarLayers,true);
  assert.equal(config.preservation.rehydrateOnMapboxStyleLoad,true);
});
test('Navigation overlays and current icons are preserved by style reload',()=>{
  const src=read('src/components/VanoMap.jsx');
  assert.ok(src.includes("map.on('style.load',update)"));
  assert.ok(src.includes('paintMapbox(map,latest.current,lastSelection)'));
  assert.ok(src.includes('setStyle(style,{diff:false})'));
  assert.ok(src.includes("map._vanoStyle=original"));
  assert.ok(src.includes("map._vanoStyle=selectedStyle"));
  assert.ok(!src.includes("map._vanoStyle=fallbackStyle"));
});
