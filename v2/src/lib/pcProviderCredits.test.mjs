import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../v82-pc-provider-credits.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
const original=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');

test('desktop attribution change is isolated to PC and loaded before dark theme',()=>{
 assert.match(css,/@media \(min-width: 1110px\)/);
 assert.doesNotMatch(css,/@media \(max-width:/);
 assert.match(main,/import '\.\/v82-pc-provider-credits\.css'/);
 assert.ok(main.indexOf("import './v82-pc-provider-credits.css'")<main.indexOf("import './v50-night-system.css'"));
});

test('Mapbox, Leaflet, OSM and TomTom all move to the left footer on PC',()=>{
 for(const name of ['mapboxgl-ctrl-bottom-left','mapboxgl-ctrl-bottom-right','leaflet-bottom.leaflet-right','v40-map-credit','v40-tomtom-credit']) {
  assert.ok(css.includes(name),`Missing provider: ${name}`);
 }
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-right,[\s\S]*?left: calc\(max\(10px, env\(safe-area-inset-left, 0px\)\) \+ 208px\)/);
 assert.match(css,/\.map-page \.v40-tomtom-credit,[\s\S]*?\+ 145px/);
 assert.match(css,/\.map-page \.v40-map-credit,[\s\S]*?z-index: 1 !important/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-left[\s\S]*?z-index: 0 !important/);
 assert.match(css,/\.map-page\.in-navigation\.has-sheet \.v40-map-credit/);
 assert.doesNotMatch(css,/(?:display:\s*none|visibility:\s*hidden|opacity:\s*0|pointer-events:\s*none|z-index:\s*-[0-9])/);
});

test('provider copyright and clickable badges remain in their existing implementation',()=>{
 assert.match(original,/\.v40-map-credit\[hidden\]\{display:none!important\}/);
 assert.match(original,/\.v40-tomtom-credit\{/);
 assert.match(original,/\.map-page \.mapboxgl-ctrl-bottom-right/);
});
