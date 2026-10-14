import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const gps=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('all provider credits are lower-left with a subtle diagonal inset',()=>{
 assert.match(map,/attributionControl:true,logoPosition:'bottom-left'/);
 assert.match(css,/\.v40-map-credit\{[\s\S]*?left:calc\(env\(safe-area-inset-left,0px\) \+ 22px\);right:auto;bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 62px\)/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-left\{[\s\S]*?left:calc\(env\(safe-area-inset-left,0px\) \+ 14px\)/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-right,[\s\S]*?left:calc\(env\(safe-area-inset-left,0px\) \+ 16px\)/);
 assert.match(css,/\.map-page \.leaflet-bottom\.leaflet-right\{/);
 assert.doesNotMatch(css,/vano-provider-left-shift/);
});
test('location card clears legal credits and map stays responsive to narrow screens',()=>{
 assert.match(css,/\.map-page:not\(\.in-navigation\):not\(\.has-sheet\) \.v31-location-card\{[\s\S]*?\+ 16px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/in-navigation \.mapboxgl-ctrl-bottom-left/);
 assert.match(css,/\.map-page\.in-navigation \.v40-map-credit\{bottom:calc\(var\(--v36-nav-dock-height,180px\) \+ 60px\);z-index:2\}/);
 assert.match(css,/\.map-page\.in-navigation \.mapboxgl-ctrl-bottom-left\{[\s\S]*?\+ 8px\);\s*z-index:2/);
 assert.match(css,/\.map-page\.in-navigation \.mapboxgl-ctrl-bottom-right,[\s\S]*?\+ 34px\);\s*z-index:2/);
 assert.match(css,/has-sheet \.mapboxgl-ctrl-bottom-right/);
 assert.match(gps,/width:min\(357px/);
 assert.doesNotMatch(css,/\.mapboxgl-ctrl-bottom-right\{[^}]*display:none/);
});
test('compact extra OSM logo retains copyright link and native map credits',()=>{
 assert.match(overlay,/https:\/\/www\.openstreetmap\.org\/copyright/);
 assert.match(overlay,/credit\.textContent='OSM'/);
 assert.match(overlay,/osmLogo\.src='https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/b\/b0\/Openstreetmap_logo\.svg'/);
 assert.match(overlay,/credit\.setAttribute\('aria-label','© OpenStreetMap contributors/);
 assert.match(overlay,/CC BY 4\.0/);
 assert.match(map,/attributionControl:true/);
});
