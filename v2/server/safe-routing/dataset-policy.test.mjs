import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_ROUTING_DATASET_POLICY,assertNoPersonalRouteInputs,validateDatasetApproval,canUseSnapshotForRanking} from './dataset-policy.mjs';

const approval={layer:'geoportal:iluminacao_publica',licenseAccepted:true,crsValidated:true,geometryValidated:true,freshnessValidated:true,approvedForRouting:true,approvedBy:'operador-responsavel',approvedAt:'2026-10-16T12:00:00Z'};
test('all discovered GeoSampa pilot layers start blocked from routing and bulk storage',()=>{
 assert.equal(Object.keys(SAFE_ROUTING_DATASET_POLICY).length,8);
 for(const rule of Object.values(SAFE_ROUTING_DATASET_POLICY)){
  assert.equal(rule.approval,'pending-license-crs-quality-review');
  assert.equal(rule.mayUploadFullSnapshot,false);assert.equal(rule.mayInfluenceAutomaticRanking,false);
 }
});
test('historical hazard data cannot label people or penalize a neighbourhood in ranking',()=>{
 for(const key of ['hydrologicalRisk','floodHistory']){
  assert.equal(SAFE_ROUTING_DATASET_POLICY[key].routingUse,'display-not-routing');
  assert.equal(SAFE_ROUTING_DATASET_POLICY[key].sensitivePopulationContext,true);
 }
});
test('names, age and account information are prohibited from route calculation',()=>{
 assert.equal(assertNoPersonalRouteInputs({requestedAt:'2026-10-16T12:00:00Z'}),true);
 for(const input of [{name:'Miguel'},{age:22},{userId:'u1'},{preciseLocationHistory:[]}])assert.throws(()=>assertNoPersonalRouteInputs(input),/proibido/);
});
test('dataset approval requires all review gates and expires',()=>{
 const now=Date.parse('2026-10-16T13:00:00Z');
 assert.equal(validateDatasetApproval(approval,{now}).approved,true);
 assert.equal(validateDatasetApproval({...approval,crsValidated:false},{now}).reason,'incomplete-approval');
 assert.equal(validateDatasetApproval({...approval,approvedAt:'2026-08-01T12:00:00Z'},{now}).reason,'expired-approval');
});
test('only an approved matching snapshot can reach ranking',()=>{
 const now=Date.parse('2026-10-16T13:00:00Z');
 const snapshot={stage:'approved',licenseReviewed:true,usedForRouting:true,layer:'geoportal:iluminacao_publica'};
 assert.deepEqual(canUseSnapshotForRanking({datasetApproval:approval,snapshot,now}),{allowed:true,layer:'geoportal:iluminacao_publica',routingUse:'inventory-context'});
 assert.equal(canUseSnapshotForRanking({datasetApproval:approval,snapshot:{...snapshot,stage:'staging'},now}).reason,'snapshot-not-approved');
 assert.equal(canUseSnapshotForRanking({datasetApproval:approval,snapshot:{...snapshot,layer:'geoportal:calcada'},now}).reason,'approval-snapshot-mismatch');
});
