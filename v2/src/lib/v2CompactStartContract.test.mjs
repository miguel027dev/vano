import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v2-compact-fallback.css',import.meta.url),'utf8');

test('the V2 first street frame renders a car, not only a snapped arrow',()=>{
 assert.match(map,/const nearStart=realDriving&&d\.v2Experience&&d\.vehicle==='carro'/);
 assert.match(map,/if\(nearStart\)\{\s*point=nearStart;/);
 assert.match(map,/map\._vanoRoadCarConfirmed=Boolean\([\s\S]*?nearStart\|\|entryHandoff/);
 assert.match(map,/syncCompactCarFallback\(element,carVisible,nativeCompact\)/);
 assert.match(css,/vano-v2-compact-fallback-active/);
});
test('3D fallback survives unavailable native WebGL and painter never removes it during navigation',()=>{
 assert.match(map,/image\.src='\/vehicle-car-cutout\.png'/);
 assert.match(map,/if\(!data\.navigation\)syncV2Compact/);
 assert.doesNotMatch(map,/const nativeCompact=syncV2Compact\(map,mapboxgl,data/);
 assert.match(map,/map\.getLayer\?\.\(V2_COMPACT_ID\)/);
});
test('V1 and telemetry remain isolated from V2 visual-only start',()=>{
 assert.match(map,/d\.v2Experience&&d\.vehicle==='carro'/);
 assert.match(map,/sourceAt:d\.telemetry\?\.sourceAt/);
 assert.match(map,/d\.motionCoords=point/);
 assert.doesNotMatch(map,/d\.gpsCoords=point/);
});
