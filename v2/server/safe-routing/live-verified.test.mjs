import test from 'node:test';
import assert from 'node:assert/strict';
import {applySafeVerifiedReportRanking,safeEvidenceScore} from './live-verified.mjs';
const line=(offset=0)=>({type:'LineString',coordinates:[[-46.70,-23.55+offset],[-46.69,-23.55+offset]]});
const route=(id,offset,duration)=>({id,duration,distance:2,geometry:line(offset),steps:[]});
test('safe mode chooses lower verified event exposure even when travel takes longer',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z');
 const reports=[1,2].map(i=>({status:'verificado',type:'acidente',coords:[-46.695+(i-1)*.001,-23.55],createdAt:new Date(now-86400000).toISOString()}));
 const result={source:'mapbox-v1-candidates',routes:[route('safe',0,12),route('fast',.007,8)]};
 const selected=applySafeVerifiedReportRanking(result,reports,{now});
 assert.equal(selected.routes[0].geometry.coordinates[0][1],-23.543);
 assert.equal(selected.routes[0].id,'safe');
 assert.equal(selected.routes[0].verifiedSafety,false);
 assert.equal(selected.routes[1].duration,8);
});
test('unverified or missing evidence keeps provider selection',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z');
 const result={source:'mapbox-v1-candidates',routes:[route('safe',0,12),route('fast',.007,8)]};
 const only=[{type:'risco',status:'nao_verificado',coords:[-46.695,-23.55],createdAt:new Date(now).toISOString()}];
 assert.deepEqual(applySafeVerifiedReportRanking(result,only,{now}).routes,result.routes);
});
test('does not override original python safety calculations',()=>{
 const result={source:'vano-original-python',routes:[route('safe',0,10),route('fast',.01,8)]};
 assert.deepEqual(applySafeVerifiedReportRanking(result,[]),result);
});
test('invalid geometry is rejected',()=>assert.equal(safeEvidenceScore({geometry:{type:'Point',coordinates:[]}},[]),null));
