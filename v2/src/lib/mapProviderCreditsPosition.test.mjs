import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');

test('provider credits move left together, with an extra 54px shift on mobile',()=>{
 assert.match(css,/\.map-page\{--vano-provider-left-shift:28px\}/);
 assert.match(css,/@media\(max-width:600px\)\{[\s\S]*?--vano-provider-left-shift:54px/);
 assert.match(css,/\.v40-map-credit\{[\s\S]*?right:calc\(env\(safe-area-inset-right,0px\) \+ 11px \+ var\(--vano-provider-left-shift,28px\)\)/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-right\{right:calc\(env\(safe-area-inset-right,0px\) \+ 8px \+ var\(--vano-provider-left-shift,28px\)\)/);
 assert.match(css,/\.map-page \.leaflet-bottom\.leaflet-right\{right:calc\(env\(safe-area-inset-right,0px\) \+ 8px \+ var\(--vano-provider-left-shift,28px\)\)/);
});
test('small-screen credits stay above location card without truncation or hiding',()=>{
 assert.match(css,/not\(\.in-navigation\):not\(\.has-sheet\) \.mapboxgl-ctrl-bottom-right/);
 assert.match(css,/not\(\.in-navigation\):not\(\.has-sheet\) \.v40-map-credit/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/\.mapboxgl-ctrl-bottom-right\{[^}]*display:none/);
 assert.match(map,/attributionControl:true,logoPosition:'bottom-right'/);
 assert.match(overlay,/https:\/\/www\.openstreetmap\.org\/copyright/);
 assert.match(overlay,/© OpenStreetMap contributors/);
});
