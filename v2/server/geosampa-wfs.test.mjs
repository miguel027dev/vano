import test from 'node:test';
import assert from 'node:assert/strict';
import {readLightingFeatureType,inspectGeoSampaLighting,fetchGeoSampaLightPage,normalizeWfsLightingPage} from './safe-routing/geosampa-wfs.mjs';
import {stageSamplePage,assertDedicatedSafeDatabase} from '../scripts/safe-routing/import-geosampa.mjs';
const xml='<?xml version="1.0"?><wfs:WFS_Capabilities><wfs:FeatureTypeList><wfs:FeatureType><wfs:Name>geoportal:iluminacao_publica</wfs:Name></wfs:FeatureType></wfs:FeatureTypeList></wfs:WFS_Capabilities>';
const geojson={type:'FeatureCollection',numberMatched:500000,features:[
 {type:'Feature',id:'iluminacao_publica.1',geometry:{type:'Point',coordinates:[-46.633,-23.550]},properties:{}},
 {type:'Feature',id:'iluminacao_publica.2',geometry:{type:'Point',coordinates:[-46.7,-23.6]},properties:{}}
]};
const mock=async (url,opt)=>{
 assert.equal(new URL(url).hostname,'wfs.geosampa.prefeitura.sp.gov.br');
 assert.equal(opt.redirect,'error');
 const u=new URL(url);
 if(u.searchParams.get('request')==='GetCapabilities')return new Response(xml,{status:200,headers:{'content-type':'text/xml'}});
 if(u.searchParams.get('request')==='GetFeature'){
  assert.equal(u.searchParams.get('typeNames'),'geoportal:iluminacao_publica');
  assert.equal(u.searchParams.get('srsName'),'EPSG:4326');
  return new Response(JSON.stringify(geojson),{status:200,headers:{'content-type':'application/json'}});
 }
 return new Response('',{status:400});
};
test('WFS typename must be found in capabilities, not guessed',()=>{
 assert.equal(readLightingFeatureType(xml),'geoportal:iluminacao_publica');
 assert.throws(()=>readLightingFeatureType('<error/>'));
});
test('WFS official site discovery and one-page sample',async()=>{
 const info=await inspectGeoSampaLighting({fetcher:mock});
 assert.equal(info.layer,'geoportal:iluminacao_publica');
 const page=await fetchGeoSampaLightPage({layer:info.layer,fetcher:mock});
 assert.equal(page.returned,2);assert.equal(page.numberMatched,500000);
 assert.equal(page.sha256.length,64);
 const normalized=normalizeWfsLightingPage(page,'sample-20261015');
 assert.equal(normalized.accepted.length,2);
 assert.equal(normalized.stage,'staging-unverified');
});
test('probes real-data adapter only in dry-run mode',async()=>{
 const report=await stageSamplePage({fetcher:mock});
 assert.equal(report.stage,'dry-run');
 assert.equal(report.accepted,2);
 assert.equal(report.complete,false);
 assert.equal(report.usedForRouting,false);
});
test('reject unknown layers and excessive requests',async()=>{
 await assert.rejects(()=>fetchGeoSampaLightPage({layer:'other:private',fetcher:mock}));
 await assert.rejects(()=>fetchGeoSampaLightPage({layer:'geoportal:iluminacao_publica',count:100000,fetcher:mock}));
});
test('source normalization refuses swapped UTM coordinates and missing ids',()=>{
 const page={startIndex:0,features:[
  {id:'x',geometry:{type:'Point',coordinates:[341000,7394000]}},
  {geometry:{type:'Point',coordinates:[-46.6,-23.55]}}
 ]};
 const r=normalizeWfsLightingPage(page,'sample-20261015');
 assert.equal(r.accepted.length,0);
 assert.equal(r.rejectedCount,2);
});
test('separate DB guard does not allow VANO main database',()=>{
 assert.throws(()=>assertDedicatedSafeDatabase('postgresql://user:abcdefghijk@localhost:5432/vano_prod'));
 assert.throws(()=>assertDedicatedSafeDatabase('postgresql://user:abcdefghijk@localhost:5432/safe_vano',
 'postgresql://user:abcdefghijk@localhost:5432/safe_vano'));
 assert.equal(assertDedicatedSafeDatabase('postgresql://user:abcdefghijk@localhost:5432/safe_sp_db'),true);
});
