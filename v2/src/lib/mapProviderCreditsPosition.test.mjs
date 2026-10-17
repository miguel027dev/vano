import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const gps=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('OSM and TomTom badges are physically bottom-right, including navigation',()=>{
 assert.match(css,/\.v40-map-credit\{[\s\S]*?right:calc\(env\(safe-area-inset-right,0px\) \+ 5px\);\s*bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 3px\)/);
 assert.match(css,/\.v40-tomtom-credit\{[\s\S]*?right:calc\(env\(safe-area-inset-right,0px\) \+ 31px\)/);
 assert.match(css,/\.map-page\.in-navigation \.v40-map-credit,[\s\S]*?bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 3px\);z-index:2/);
 assert.doesNotMatch(css,/\.map-page\.in-navigation \.v40-map-credit[^}]*--v36-nav-dock-height/);
 assert.doesNotMatch(css,/\.map-page\.has-sheet \.v40-map-credit[^}]*--v33-panel-clearance/);
 assert.match(css,/\.v40-map-credit\[hidden\]\{display:none!important\}/);
});
test('custom credits are above dock stacking context and preserve links',()=>{
 assert.match(overlay,/const creditHost=map\.getContainer\(\)\.closest\?\.\('\.map-page'\)\|\|map\.getContainer\(\)/);
 assert.match(overlay,/creditHost\.append\(credit\)/);
 assert.match(overlay,/creditHost\.append\(tomtomCredit\)/);
 assert.match(overlay,/credit\.remove\(\);tomtomCredit\.remove\(\)/);
 assert.match(overlay,/https:\/\/www\.openstreetmap\.org\/copyright/);
 assert.match(overlay,/credit\.textContent='OSM'/);
 assert.match(overlay,/credit\.setAttribute\('aria-label','© OpenStreetMap contributors/);
 assert.match(overlay,/https:\/\/www\.tomtom\.com\/legal\//);
 assert.match(overlay,/tomtomCredit\.textContent='© TomTom'/);
 assert.match(overlay,/CC BY 4\.0/);
});
test('native Mapbox/Leaflet attribution remains enabled, responsive, and unhidden',()=>{
 assert.match(map,/attributionControl:true,logoPosition:'bottom-left'/);
 assert.match(map,/attributionControl:true/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-left\{/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-right,/);
 assert.match(css,/\.map-page \.leaflet-bottom\.leaflet-right\{/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(gps,/width:min\(357px/);
 assert.doesNotMatch(css,/\.mapboxgl-ctrl-bottom-right\{[^}]*display:none/);
 assert.match(css,/\.map-page \.mapboxgl-ctrl-bottom-right,\s*\.map-page \.leaflet-bottom\.leaflet-right\{z-index:0!important\}/);
 assert.match(css,/\.v40-map-credit\{[\s\S]*?z-index:2;/);
});
