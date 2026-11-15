import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const layer=readFileSync(new URL('./v2CompactLayer.mjs',import.meta.url),'utf8');

test('the V2 first street frame renders a car, not only a snapped arrow',()=>{
 assert.match(map,/const nearStart=realDriving&&d\.v2Experience&&d\.vehicle==='carro'/);
 assert.match(map,/if\(nearStart\)\{\s*point=nearStart;/);
 assert.match(map,/map\._vanoRoadCarConfirmed=Boolean\([\s\S]*?nearStart\|\|entryHandoff/);
 assert.doesNotMatch(map,/syncCompactCarFallback|vehicle-car-cutout|v2-compact-fallback/);
 assert.match(layer,/import \* as compactMesh/);
 assert.doesNotMatch(layer,/import\('\.\/v2CompactMesh/);
});
test('native car starts in the initial paint without road confirmation or image download',()=>{
 assert.match(map,/const nativeCompact=syncV2Compact\(map,mapboxgl,data,carPoint,carHeading,carEligible\)/);
 assert.match(layer,/mesh:compactMesh/);
 assert.match(layer,/gl\.depthRange\(0,\.01\)/);
 assert.match(layer,/gl\.depthRange\(0,1\)/);
});
test('V1 and telemetry remain isolated from V2 visual-only start',()=>{
 assert.match(map,/d\.v2Experience&&d\.vehicle==='carro'/);
 assert.match(map,/sourceAt:d\.telemetry\?\.sourceAt/);
 assert.match(map,/d\.motionCoords=point/);
 assert.doesNotMatch(map,/d\.gpsCoords=point/);
});
