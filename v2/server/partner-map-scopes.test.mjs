import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTNER_SCOPE_CATALOG,PARTNER_SCOPES,DEFAULT_PARTNER_SCOPES,MAP_SERVICE_SCOPE,partnerMapServices,filterPartnerMapFeatures} from './partner-map-scopes.mjs';

test('scope catalog is unique and recommended permissions never grant writes',()=>{
 assert.equal(new Set(PARTNER_SCOPES).size,PARTNER_SCOPES.length);
 assert.equal(PARTNER_SCOPE_CATALOG.length,PARTNER_SCOPES.length);
 assert.deepEqual(DEFAULT_PARTNER_SCOPES,['map:read','places:read','routes:read','radars:read','signals:read','signs:read','pois:read']);
 assert.ok(!DEFAULT_PARTNER_SCOPES.includes('reports:write'));
 assert.ok(!DEFAULT_PARTNER_SCOPES.includes('traffic:read'));
});
test('mixed public features require their specific scope',()=>{
 const input=[
  {type:'hospital'},{type:'radar'},{type:'relato-radar'},{type:'semaforo'},
  {type:'pare'},{type:'lombada'},{type:'relato-acidente'}
 ];
 assert.deepEqual(filterPartnerMapFeatures(input,['signals:read']).map(x=>x.type),['semaforo']);
 assert.deepEqual(filterPartnerMapFeatures(input,['radars:read']).map(x=>x.type),['radar','relato-radar']);
 assert.deepEqual(filterPartnerMapFeatures(input,['signs:read']).map(x=>x.type),['pare','lombada']);
 assert.deepEqual(filterPartnerMapFeatures(input,['pois:read']).map(x=>x.type),['hospital']);
 assert.deepEqual(filterPartnerMapFeatures(input,['reports:read']).map(x=>x.type),['relato-acidente']);
 assert.deepEqual(filterPartnerMapFeatures(input,[]),[]);
 assert.deepEqual(filterPartnerMapFeatures(input,DEFAULT_PARTNER_SCOPES).map(x=>x.type),
  ['hospital','radar','relato-radar','semaforo','pare','lombada']);
});
test('base map alone cannot request optional overlays',()=>{
 assert.deepEqual(partnerMapServices([]),[]);
 assert.deepEqual(partnerMapServices(['map:read']),[]);
 assert.deepEqual(partnerMapServices(['radars:read']),[]);
 assert.deepEqual(partnerMapServices(['map:read','signals:read']),['map-features']);
 assert.deepEqual(partnerMapServices(['map:read','radars:read']),['map-features','map-radars']);
 assert.ok(partnerMapServices(DEFAULT_PARTNER_SCOPES).includes('places/tomtom'));
 assert.equal(MAP_SERVICE_SCOPE['map-radars'],'radars:read');
 assert.equal(MAP_SERVICE_SCOPE['traffic/incidents/tomtom'],'traffic:read');
});
