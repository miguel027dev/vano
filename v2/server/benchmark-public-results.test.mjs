import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedPublicBenchmarks,publicBenchmarkPayload} from './benchmark-public-results.mjs';
const item={id:'test-route-01',published:true,publicPlacesOnly:true,measuredAt:'2026-10-31T10:00:00Z',origin:'Local público A',destination:'Local público B',category:'centro',profile:'driving',reference:{source:'vano_fastest',etaMin:15,distanceKm:9,measuredAt:'2026-10-31T10:00:00Z'},vano:{mode:'safest',etaMin:14,distanceKm:10,measuredAt:'2026-10-31T10:01:00Z',latencyMs:530}};
test('empty report has no invented metrics',()=>{const r=publicBenchmarkPayload();assert.equal(r.total,0);assert.equal(r.statistics.meanEtaDifferenceMin,null);assert.deepEqual(r.records,[])});
test('rejected unpublished or privacy-uncleared benchmarks',()=>{assert.equal(validatedPublicBenchmarks([{...item,published:false}]).length,0);assert.equal(validatedPublicBenchmarks([{...item,publicPlacesOnly:false}]).length,0)});
test('internal baseline has explicit provenance and ETA differences',()=>{const r=validatedPublicBenchmarks([item]);assert.equal(r.length,1);assert.equal(r[0].delta.etaMin,1);assert.equal(r[0].reference.source,'vano_fastest')});
test('Google results require evidence and contemporaneous measurements',()=>{assert.equal(validatedPublicBenchmarks([{...item,reference:{...item.reference,source:'google_maps'}}]).length,0);assert.equal(validatedPublicBenchmarks([{...item,reference:{...item.reference,measuredAt:'2026-10-31T09:00:00Z'}}]).length,0)});
