import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchGeoSampaRecoveringPage} from './safe-routing/geosampa-wfs.mjs';
import {sanitizeGeoSampaPage} from './safe-routing/ingestion.mjs';
test('one source reprojection failure preserves all other records and records the rejected index',async()=>{
 const fetcher=async url=>{
  const start=Number(url.searchParams.get('startIndex')),count=Number(url.searchParams.get('count'));
  if(start<=2&&start+count>2)return new Response('<ExceptionText>A transformation exception occurred while reprojecting data</ExceptionText>',{status:400});
  return new Response(JSON.stringify({type:'FeatureCollection',numberMatched:4,features:Array.from({length:count},(_,i)=>({type:'Feature',id:'road.'+(start+i),geometry:{type:'LineString',coordinates:[[-46.63,-23.55],[-46.64,-23.56]]}}))}));
 };
 const page=await fetchGeoSampaRecoveringPage({layer:'geoportal:segmento_logradouro',count:4,fetcher});
 assert.equal(page.returned,4);assert.equal(page.numberMatched,4);assert.deepEqual(page.sourceRejectedIndices,[2]);
 const sanitized=sanitizeGeoSampaPage(page,{layer:'geoportal:segmento_logradouro',snapshotId:'test-reprojection'});
 assert.equal(sanitized.features.length,3);assert.equal(sanitized.source.rejected,1);
 assert.ok(sanitized.features.every(f=>f.geometry!==null));
});
test('unrelated HTTP errors are never converted to accepted/rejected source records',async()=>{
 await assert.rejects(fetchGeoSampaRecoveringPage({layer:'geoportal:segmento_logradouro',count:4,fetcher:async()=>new Response('Forbidden',{status:403})}),/HTTP 403/);
});
