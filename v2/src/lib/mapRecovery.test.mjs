import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vectorStartupDecision,MAPBOX_VECTOR_PROBE_MS,MAPBOX_VECTOR_MAX_WAIT_MS,WEBGL_CONTEXT_RESTORE_MS} from './mapRecovery.mjs';

test('slow V2 map does not prematurely switch to flat Leaflet before vector retry',()=>{
 assert.equal(MAPBOX_VECTOR_PROBE_MS,20000);
 assert.equal(MAPBOX_VECTOR_MAX_WAIT_MS,55000);
 assert.equal(vectorStartupDecision({elapsedMs:14500,usingCustomStyle:true}),'wait');
 assert.equal(vectorStartupDecision({elapsedMs:20000,usingCustomStyle:true}),'retry-default-vector');
 assert.equal(vectorStartupDecision({elapsedMs:28000,usingCustomStyle:false,retriedDefaultStyle:true}),'wait');
 assert.equal(vectorStartupDecision({elapsedMs:55000,usingCustomStyle:false,retriedDefaultStyle:true}),'raster');
});
test('ready vector map always wins; permanent failures retain final raster fallback',()=>{
 assert.equal(vectorStartupDecision({elapsedMs:60000,loaded:true}),'ready');
 assert.equal(vectorStartupDecision({elapsedMs:60000,loaded:false,usingCustomStyle:true,retriedDefaultStyle:false}),'retry-default-vector');
 assert.equal(vectorStartupDecision({elapsedMs:60000,loaded:false,usingCustomStyle:false,retriedDefaultStyle:true}),'raster');
});
test('Mapbox preserves recoverable WebGL contexts and clears timers on unmount',()=>{
 const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.equal(WEBGL_CONTEXT_RESTORE_MS,12000);
 assert.match(src,/webglcontextrestored/);
 assert.match(src,/clearTimeout\(webglRecoveryTimer\)/);
 assert.match(src,/vectorStartupDecision\(/);
 assert.match(src,/setForceRaster\(true\)/);
 assert.doesNotMatch(src,/contextLostHandler=e=>\{e\.preventDefault\?\.\(\);if\(!deleted\)setForceRaster\(true\)/);
});
