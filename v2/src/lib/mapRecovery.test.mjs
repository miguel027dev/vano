import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vectorStartupDecision,MAPBOX_VECTOR_PROBE_MS,MAPBOX_VECTOR_MAX_WAIT_MS,WEBGL_CONTEXT_RESTORE_MS} from './mapRecovery.mjs';

test('slow custom map keeps its chosen vector style and retries only the original',()=>{
 assert.equal(MAPBOX_VECTOR_PROBE_MS,40000);
 assert.equal(MAPBOX_VECTOR_MAX_WAIT_MS,120000);
 assert.equal(vectorStartupDecision({elapsedMs:14500,usingCustomStyle:true}),'wait');
 assert.equal(vectorStartupDecision({elapsedMs:20000,usingCustomStyle:true}),'wait');
 assert.equal(vectorStartupDecision({elapsedMs:40000,usingCustomStyle:true}),'retry-original-vector');
 assert.equal(vectorStartupDecision({elapsedMs:55000,usingCustomStyle:true,retriedOriginalStyle:true}),'wait');
 assert.equal(vectorStartupDecision({elapsedMs:120000,usingCustomStyle:true,retriedOriginalStyle:true}),'raster');
});
test('ready vector map always wins; permanent failures retain final raster fallback',()=>{
 assert.equal(vectorStartupDecision({elapsedMs:130000,loaded:true}),'ready');
 assert.equal(vectorStartupDecision({elapsedMs:60000,loaded:false,usingCustomStyle:true,retriedOriginalStyle:false}),'retry-original-vector');
 assert.equal(vectorStartupDecision({elapsedMs:120000,loaded:false,usingCustomStyle:true,retriedOriginalStyle:true}),'raster');
});
test('Mapbox preserves recoverable WebGL contexts and clears timers on unmount',()=>{
 const src=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.equal(WEBGL_CONTEXT_RESTORE_MS,30000);
 assert.match(src,/webglcontextrestored/);
 assert.match(src,/clearTimeout\(webglRecoveryTimer\)/);
 assert.match(src,/vectorStartupDecision\(/);
 assert.match(src,/setForceRaster\(true\)/);
 assert.match(src,/map\.setStyle\(selectedStyle,\{diff:false\}\)/);
 assert.doesNotMatch(src,/map\.setStyle\(standard,\{diff:false\}\)/);
 assert.doesNotMatch(src,/contextLostHandler=e=>\{e\.preventDefault\?\.\(\);if\(!deleted\)setForceRaster\(true\)/);
});
