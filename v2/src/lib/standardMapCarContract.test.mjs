import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');

test('/mapa alone explicitly opts into the normal compact car',()=>{
 assert.match(page,/v2Experience=\{location\.pathname==='\/v2'\} standardMapCar=\{location\.pathname==='\/mapa'\}/);
 assert.match(src,/standardCar:sameRoadRun&&standardMapCar\?visual\.current\.standardCar:null/);
 assert.match(src,/state\.standardCar=standardMapCarPose\(/);
 assert.match(src,/const carVisible=Boolean\([\s\S]*?\(d\.standardMapCar&&state\.standardCar\?\.visible\)/);
});
test('normal car start/heading only changes marker, NOT V1 camera, GPS, motion or navigation',()=>{
 assert.match(src,/d\.motionCoords=point;d\.motionBearing=state\.bearing\|\|0;/);
 assert.match(src,/cameraTarget\(\{position:d\.motionCoords\|\|d\.gpsCoords/);
 assert.match(src,/const markerPoint=d\.standardMapCar&&state\.standardCar\?\.visible\?/);
 assert.match(src,/marker\.setLngLat\(markerPoint\)/);
 assert.match(src,/syncV2Compact\(map,mapboxgl,d,markerPoint,markerBearing,carVisible\)/);
 assert.doesNotMatch(src,/d\.motionCoords=markerPoint/);
 assert.doesNotMatch(src,/d\.gpsCoords=markerPoint/);
 assert.doesNotMatch(src,/cameraTarget\(\{position:markerPoint/);
 assert.doesNotMatch(src,/motion\.current\?\.start\(markerPoint/);
});
test('React repaint uses same latched car pose as animation, preventing car/arrow flip-flop',()=>{
 assert.match(src,/map\._vanoStandardMapCarPose=d\.standardMapCar&&d\.navigation&&state\.standardCar\?\.visible\?/);
 assert.match(src,/marker\('current',data\.standardMapCar&&data\.navigation&&map\._vanoStandardMapCarPose\?\.visible/);
 assert.match(src,/const carEligible=Boolean\(data\.navigation&&data\.vehicle==='carro'&&/);
 assert.match(src,/syncCompactCarFallback\(element,carEligible,nativeCompact\)/);
 assert.match(src,/if\(!data\.navigation\)syncV2Compact/);
});
