import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v49-map-appearance.css',import.meta.url),'utf8');
test('map day/night toggle reuses existing saved user theme, with instant feedback',()=>{
 assert.match(page,/savePreference\(\{theme:next\}\)/);
 assert.match(page,/setMapThemeOverride\(next\)/);
 assert.match(page,/selectedAppearance==='dark'\?'Ativar mapa claro':'Ativar mapa escuro'/);
 assert.match(page,/aria-pressed=\{selectedAppearance==='dark'\}/);
 assert.match(page,/data-map-appearance=\{selectedAppearance\}/);
 assert.match(page,/appearance=\{selectedAppearance\}/);
});
test('styling change keeps the same map instance, routing and GPS unaffected',()=>{
 assert.match(renderer,/map\.setStyle\(style,\{diff:false\}\)/);
 assert.match(renderer,/\},\[layer,appearance,token\]\)/);
 assert.match(renderer,/paintMapbox\(map,latest\.current,lastSelection\)/);
 assert.match(renderer,/leafletTilesFor\(layer,token,appearance\)/);
 assert.match(renderer,/classList\.toggle\('v49-dark-raster-legacy'/);
 assert.doesNotMatch(page,/key=\{selectedAppearance\}/);
});
test('contrast and accessibility are respected on tiny screens and reduced-motion devices',()=>{
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-height:690px/);
 assert.match(css,/mapboxgl-popup-content/);
 assert.match(css,/v31-location-card/);
 assert.match(css,/v49-theme-glyph/);
});
