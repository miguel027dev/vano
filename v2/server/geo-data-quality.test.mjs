import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceMetadata,validateGeoSampaLights} from './geo-data-quality.mjs';
const meta={sourceId:'geosampa_sp_iluminacao',publisher:'Prefeitura de Sao Paulo',
  downloadUrl:'https://download.geosampa.prefeitura.sp.gov.br/',
  license:'TO_VERIFY_BEFORE_PRODUCTION',datasetVersion:'mock-v1',updatedAt:'2026-09-01T00:00:00Z',
  downloadedAt:'2026-10-15T00:00:00Z',crs:'EPSG:4326'};
const sample={type:'FeatureCollection',features:[{type:'Feature',id:'poste-1',
  geometry:{type:'Point',coordinates:[-46.67,-23.56]},properties:{ownerEmail:'never-import'}}]};
test('accepts normalized point and removes unneeded personal properties',()=>{
 const result=validateGeoSampaLights(sample,meta);
 assert.equal(result.accepted.length,1);
 assert.equal(result.accepted[0].sourceId,'poste-1');
 assert.equal('ownerEmail' in result.accepted[0],false);
 assert.equal(result.checksum.length,64);
});
test('refuses projected GeoJSON until accurately reprojected',()=>{
 const projected={...sample,crs:{type:'name',properties:{name:'EPSG:31983'}}};
 assert.throws(()=>validateGeoSampaLights(projected,meta),/transformed/);
});
test('rejects out-of-city points and incomplete metadata',()=>{
 assert.throws(()=>validateGeoSampaLights({...sample,features:[{...sample.features[0],geometry:{type:'Point',coordinates:[0,0]}}]},meta),/quarantined/);
 assert.throws(()=>validateSourceMetadata({...meta,crs:'EPSG:31983'}),/metadata/);
});
test('quarantines duplicate source IDs rather than double counting fixtures',()=>{
 assert.throws(()=>validateGeoSampaLights({...sample,features:[...sample.features,...sample.features]},meta),/quarantined/);
});
