import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFrameIntervals,recordMotionFrames} from './motionDiagnostics.mjs';

test('an empty or interrupted trace does not report invented performance',()=>{
  assert.deepEqual(summarizeFrameIntervals([]),{frames:0,fps:0,p95Ms:null,p99Ms:null,maxMs:null,jankRate:0});
  assert.equal(summarizeFrameIntervals([0,-10,Infinity,NaN,1000]).frames,0);
});

test('sampling computes frame intervals and filters suspended tab outliers',()=>{
  const result=summarizeFrameIntervals([16,16,16,16,50,1000]);
  assert.equal(result.frames,5);
  assert.equal(result.p95Ms,50);
  assert.equal(result.maxMs,50);
  assert.equal(result.jankRate,20);
  assert.ok(result.fps>0&&result.fps<60);
});

test('sampler does not require a browser for imported unit tests',async()=>{
  const result=await recordMotionFrames({raf:null,cancel:null});
  assert.equal(result.reason,'unsupported');
});

test('debug instrumentation is opt-in and does not access GPS or network',async()=>{
  const {readFileSync}=await import('node:fs');
  const entry=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
  const probe=readFileSync(new URL('./motionDiagnostics.mjs',import.meta.url),'utf8');
  assert.match(entry,/get\('vanoMotionDebug'\) === '1'/);
  assert.match(entry,/import\('\.\/lib\/motionDiagnostics\.mjs'\)/);
  assert.doesNotMatch(probe, /fetch\s*\(|XMLHttpRequest|geolocation|localStorage|sessionStorage|sendBeacon/i);
});
