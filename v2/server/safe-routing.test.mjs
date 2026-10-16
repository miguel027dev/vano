import test from 'node:test';
import assert from 'node:assert/strict';
import {solarPhase,summarizeLighting,evaluateSafeCandidates} from './safe-routing/engine.mjs';
import {normalizePublicLightingGeoJson} from './safe-routing/geojson.mjs';
import {fetchGeoSampaSnapshot,validateGeoSampaUrl} from './safe-routing/source-fetch.mjs';
const now='2026-10-15T23:00:00Z';
const routes=[{id:'A',duration:12,distance:4.7,geometry:{type:'LineString',coordinates:[[-46.7,-23.5],[-46.6,-23.6]]}},
 {id:'B',duration:15,distance:5.6,geometry:{type:'LineString',coordinates:[[-46.7,-23.5],[-46.61,-23.59]]}}];
const seg=(lighting,lengthMeters=1000,patch={})=>({lighting,lengthMeters,sourceId:'geosampa-lamps',
 inventoryComplete:true,associationConfidence:.95,updatedAt:now,...patch});
const observations={A:[seg('registered',300),seg('no_record',700)],B:[seg('registered',900),seg('no_record',100)]};
test('solar phase separates Sao Paulo night and day',()=>{
 assert.equal(solarPhase('2026-10-15T23:00:00Z',-23.55,-46.63).phase,'night');
 assert.equal(solarPhase('2026-10-15T15:00:00Z',-23.55,-46.63).phase,'day');
});
test('invalid coordinate/time cannot pretend to know solar phase',()=>{
 assert.equal(solarPhase('bad',-23.55,-46.63).phase,'unknown');
 assert.equal(solarPhase(now,-200,-46.63).phase,'unknown');
});
test('lighting mode may prefer registered inventory with guarded detour',()=>{
 const r=evaluateSafeCandidates(routes,{at:now,observationsByRoute:observations,preference:'lighting'});
 assert.equal(r.status,'evaluated');assert.equal(r.recommendedRouteId,'B');
 assert.equal(r.hasVerifiedSafety,false);assert.equal(r.routes[1].verifiedSafety,false);
 assert.deepEqual(r.routes[0].geometry,routes[0].geometry);
});
test('daylight preserves provider default',()=>{
 const r=evaluateSafeCandidates(routes,{at:'2026-10-15T15:00:00Z',observationsByRoute:observations,preference:'lighting'});
 assert.equal(r.recommendedRouteId,'A');assert.equal(r.fallback,true);
});
test('incomplete inventory preserves provider route',()=>{
 const r=evaluateSafeCandidates(routes,{at:now,observationsByRoute:{A:[seg('registered',1000)],
  B:[seg('registered',1000,{inventoryComplete:false})]},preference:'lighting'});
 assert.equal(r.status,'insufficient-comparable-evidence');assert.equal(r.recommendedRouteId,'A');
});
test('stale inventory cannot count as recent',()=>{
 const r=summarizeLighting([seg('registered',900,{updatedAt:'2025-01-01T00:00:00Z'}),seg('no_record',100)],{now});
 assert.equal(r.coveredMeters,100);assert.equal(r.lampFunctionConfirmed,false);
});
test('low-confidence geospatial join is not evidence',()=>{
 const r=summarizeLighting([seg('registered',1000,{associationConfidence:.1})],{now});
 assert.equal(r.coverageFraction,0);
});
test('detour cap prevents unreasonable selection',()=>{
 const r=evaluateSafeCandidates([routes[0],{...routes[1],duration:25}],
  {at:now,observationsByRoute:observations,preference:'lighting'});
 assert.equal(r.recommendedRouteId,'A');
});
test('invalid candidates fail closed',()=>assert.equal(evaluateSafeCandidates([{id:'A',duration:-1}],{at:now}).fallback,true));
test('projected EPSG coordinates are rejected before ingestion',()=>{
 assert.throws(()=>normalizePublicLightingGeoJson({type:'FeatureCollection',crs:{properties:{name:'EPSG:31983'}},features:[]},
  {idField:'ID',snapshotId:'sample-2026'}),/EPSG:4326/);
});
test('GeoJSON checks duplicate ID and city bounds',()=>{
 const f={type:'FeatureCollection',features:[
  {properties:{ID:'p1'},geometry:{type:'Point',coordinates:[-46.62,-23.57]}},
  {properties:{ID:'p1'},geometry:{type:'Point',coordinates:[-46.61,-23.57]}},
  {properties:{ID:'p2'},geometry:{type:'Point',coordinates:[-70,-25]}},
  {properties:{ID:''},geometry:{type:'Point',coordinates:[-46.6,-23.5]}}]};
 const r=normalizePublicLightingGeoJson(f,{idField:'ID',snapshotId:'sample-2026'});
 assert.equal(r.acceptedCount,1);assert.equal(r.rejectedCount,3);
 assert.equal(r.stage,'staging-unverified');
});
test('download origin allowlist refuses external addresses',()=>{
 assert.throws(()=>validateGeoSampaUrl('https://127.0.0.1/private'),/HTTPS GeoSampa/);
 assert.throws(()=>validateGeoSampaUrl('http://download.geosampa.prefeitura.sp.gov.br/file'),/HTTPS GeoSampa/);
});
test('download calculates checksum and leaves data unapproved',async()=>{
 const b=Buffer.from('{"type":"FeatureCollection","features":[]}');
 const r=await fetchGeoSampaSnapshot('https://download.geosampa.prefeitura.sp.gov.br/file.geojson',{
  fetcher:async(_,o)=>{assert.equal(o.redirect,'manual');
   return new Response(b,{status:200,headers:{'content-type':'application/json','content-length':String(b.length)}})}});
 assert.equal(r.byteLength,b.length);assert.equal(r.sha256.length,64);assert.equal(r.stage,'raw-unapproved');
});
test('download refuses accidental HTML responses',async()=>{
 await assert.rejects(()=>fetchGeoSampaSnapshot('https://download.geosampa.prefeitura.sp.gov.br/file',{
  fetcher:async()=>new Response('<html></html>',{status:200,headers:{'content-type':'text/html'}})}),/HTML/);
});
