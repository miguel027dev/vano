import test from 'node:test';
import assert from 'node:assert/strict';
import {dryRunSafeRouting,evaluateApprovedEvidence} from './safe-routing/adapter.mjs';
const input={routes:[
 {id:'A',duration:10,geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},
 {id:'B',duration:12,geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}}
],source:'mapbox'};
test('unconfigured evidence provider keeps Mapbox response unchanged',async()=>{
 const r=await dryRunSafeRouting(input);
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'not-configured');
});
test('data service timeout keeps provider route',async()=>{
 const r=await dryRunSafeRouting(input,{timeoutMs:15,evidenceProvider:async()=>new Promise(()=>{})});
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'evidence-unavailable');
});
test('evidence failure is isolated and does not throw',async()=>{
 const r=await dryRunSafeRouting(input,{evidenceProvider:async()=>{throw Error('database unavailable')}});
 assert.strictEqual(r.providerResult,input);assert.equal(r.analysis.status,'evidence-unavailable');
});
const approval={layer:'geoportal:iluminacao_publica',licenseAccepted:true,crsValidated:true,geometryValidated:true,freshnessValidated:true,approvedForRouting:true,approvedBy:'operador',approvedAt:new Date().toISOString()};
const snapshot={stage:'approved',licenseReviewed:true,usedForRouting:true,layer:'geoportal:iluminacao_publica'};
const observations={A:[{lighting:'registered',lengthMeters:1000,sourceId:'geo',updatedAt:new Date().toISOString(),inventoryComplete:true,associationConfidence:.9}],B:[{lighting:'registered',lengthMeters:1000,sourceId:'geo',updatedAt:new Date().toISOString(),inventoryComplete:true,associationConfidence:.9}]};
test('unapproved snapshots never reach candidate ranking',()=>{
 const r=evaluateApprovedEvidence(input,{datasetApproval:approval,snapshot:{...snapshot,stage:'staging'},observationsByRoute:observations});
 assert.equal(r.status,'dataset-snapshot-not-approved');assert.equal(r.fallback,true);
});
test('approved public evidence can be evaluated in shadow mode',async()=>{
 const r=await dryRunSafeRouting(input,{requestedAt:new Date().toISOString(),latitude:-23.55,longitude:-46.63,evidenceProvider:async()=>({datasetApproval:approval,snapshot,observationsByRoute:observations})});
 assert.equal(r.analysis.shadowMode,true);assert.notEqual(r.analysis.status,'evidence-unavailable');
 assert.strictEqual(r.providerResult,input);
});
test('approved historical-hazard records never participate in route ranking',()=>{
 const hazardApproval={...approval,layer:'geoportal:risco_hidrologico'};
 const hazardSnapshot={...snapshot,layer:'geoportal:risco_hidrologico'};
 const r=evaluateApprovedEvidence(input,{datasetApproval:hazardApproval,snapshot:hazardSnapshot,observationsByRoute:observations});
 assert.equal(r.status,'dataset-not-eligible-for-ranking');assert.equal(r.fallback,true);
});
