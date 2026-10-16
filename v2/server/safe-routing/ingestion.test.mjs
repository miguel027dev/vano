import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeGeoSampaFeature,sanitizeGeoSampaPage} from './ingestion.mjs';
const layer='geoportal:iluminacao_publica',snapshotId='geosampa-lights-20261016-abc12345';
const point={type:'Feature',id:'lamp.1',geometry:{type:'Point',coordinates:[-46.63,-23.55]},properties:{dt_carga:'2026-01-01',tx_endereco:'Rua pública, 10',nm_operador:'não deve vazar'}};
test('sanitizer preserves only geometry, source ID and freshness',()=>{
 const item=sanitizeGeoSampaFeature(point,{layer,snapshotId});
 assert.deepEqual(item.properties,{sourceLayer:layer,sourceFeatureId:'lamp.1',snapshotId,sourceUpdatedAt:'2026-01-01T00:00:00.000Z'});
 assert.equal(item.geometry.type,'Point');assert.equal('tx_endereco' in item.properties,false);
});
test('sanitizer rejects invalid geometry and unknown layers',()=>{
 assert.equal(sanitizeGeoSampaFeature({...point,geometry:{type:'Point',coordinates:[-47,-23.55]}},{layer,snapshotId}),null);
 assert.throws(()=>sanitizeGeoSampaFeature(point,{layer:'geoportal:unknown',snapshotId}),/não registrada/);
});
test('page sanitizer deduplicates and stops poor-quality pages',()=>{
 const good=sanitizeGeoSampaPage({features:[point,{...point,id:'lamp.2',geometry:{type:'Point',coordinates:[-46.64,-23.56]}}]},{layer,snapshotId});
 assert.equal(good.features.length,2);
 assert.throws(()=>sanitizeGeoSampaPage({features:[point,...Array.from({length:6},(_,i)=>({...point,id:'bad'+i,geometry:null}))]},{layer,snapshotId}),/Qualidade/);
});
