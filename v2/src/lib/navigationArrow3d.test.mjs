import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NAV_ARROW_VIEW_BOX,NAV_ARROW_OUTLINE,navigationArrowSvg} from './navigationArrow3d.js';

const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v39-vehicle3d.css',import.meta.url),'utf8');
const entry=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');

test('one procedural 3D arrow uses consistent orange face, white rim and raised cool-gray sides',()=>{
  const svg=navigationArrowSvg();
  assert.equal(NAV_ARROW_VIEW_BOX,'0 0 80 100');
  assert.ok(svg.includes('class="vano-arrow3d-svg"'));
  assert.ok(svg.includes('class="vano-arrow3d-face"'));
  assert.ok(svg.includes('class="vano-arrow3d-rim"'));
  assert.ok(svg.includes('class="vano-arrow3d-extrusion"'));
  assert.ok(svg.includes('class="vano-arrow3d-shadow"'));
  assert.ok(svg.includes('translate(0 9)'));
  assert.ok(svg.includes(NAV_ARROW_OUTLINE));
  assert.ok(svg.includes('fill="url(#vano-arrow3d-orange)"'));
  assert.ok(svg.includes('fill="url(#vano-arrow3d-side)"'));
  assert.ok(!svg.includes('<image')&&!svg.includes('base64,'));
});
test('Mapbox marker is grounded in map perspective and still rotates with heading',()=>{
  assert.match(map,/el\.innerHTML=navigationArrowSvg\(\)/);
  assert.match(map,/vano-3d-nav-marker/);
  assert.match(map,/pitchAlignment:type==='vehicle'\?'map':'viewport'/);
  assert.match(map,/rotationAlignment:type==='vehicle'\?'map':'viewport'/);
  assert.match(map,/marker\.setRotation\(state\.bearing\|\|0\)/);
  assert.match(map,/marker\.setLngLat\(point\)/);
});
test('Leaflet fallback retains real GPS heading while sharing the same SVG',()=>{
  assert.match(map,/html:markerElement\('vehicle',d\.vehicle\)\.outerHTML/);
  assert.match(map,/arrow\.style\.transform='rotate\('/);
  assert.match(map,/map\._vanoVehicleMarker\.setLatLng\(ll\(point\)\)/);
});
test('camera styles override legacy arrow and do not animate independently from GPS',()=>{
  assert.match(entry,/import '\.\/v39-vehicle3d\.css';/);
  assert.match(css,/\.vano-atlas-direction\.vano-direction-arrow\.vano-3d-nav-marker/);
  assert.match(css,/\.vano-arrow3d-svg/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/@keyframes/);
  assert.doesNotMatch(css,/background-image:\s*url\(/);
});
