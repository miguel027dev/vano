import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cameraTarget} from './navigationMotion.js';

const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');

test('approved V2 is the default only when navigation is active',()=>{
 assert.match(src,/experimentalCameraV2:Boolean\(d\.navigation\)/);
 assert.doesNotMatch(src,/d\.experimentalCameraV2/);
 assert.doesNotMatch(ui,/v2-camera-toggle|setCameraV2|experimentalCameraV2=|>V2<\/button>/);
 assert.match(ui,/v29-layer-control/,'original map-style button remains present');
 const p=[-46.68,-23.58],route={geometry:{coordinates:[p,[-46.67,-23.58]]}},telemetry={speed:12,heading:90,accuracy:8};
 const original=cameraTarget({navigation:true,position:p,route,telemetry,experimentalCameraV2:false});
 const approved=cameraTarget({navigation:true,position:p,route,telemetry,experimentalCameraV2:true});
 assert.ok(approved.zoom<original.zoom);
 assert.ok(approved.pitch>original.pitch);
 assert.ok(approved.center[0]>original.center[0]);
 assert.equal(approved.bearing,original.bearing);
 assert.deepEqual(p,[-46.68,-23.58]);
});
