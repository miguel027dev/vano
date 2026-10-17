import test from 'node:test';
import assert from 'node:assert/strict';
import {officialRoadFeedConfig,officialRoadSources,normalizeOfficialRoadEvents,createOfficialRoadGateway} from './official-road-providers.mjs';
const box=[-0.22,51.45,-0.10,51.55],config={
 VANO_UK_ROADS_GEOJSON_URL:'https://developer.data.nationalhighways.co.uk/geojson',
 VANO_UK_ROADS_API_KEY:'uk-test-secret'
};
const payload={type:'FeatureCollection',features:[
 {type:'Feature',id:'rd-19',geometry:{type:'Point',coordinates:[-0.14,51.52]},
  properties:{status:'active',event_type:'roadworks',description:'Lane closure ahead'}},
 {type:'Feature',id:'rd-21',geometry:{type:'Point',coordinates:[-0.15,51.51]},
  properties:{status:'inactive',description:'Stale incident'}},
 {type:'Feature',id:'rd-20',geometry:{type:'Point',coordinates:[10,45]},
  properties:{status:'active',description:'Outside UK'}}
]};
test('country feed registry never leaks keys and does not enable unconfigured sources',()=>{
 const sources=officialRoadSources(config);
 assert.equal(sources.length,9);
 assert.equal(sources.find(x=>x.id==='uk-national').enabled,true);
 assert.equal(sources.find(x=>x.id==='us-wzdx').enabled,false);
 assert.equal(JSON.stringify(sources).includes('uk-test-secret'),false);
 assert.equal(officialRoadFeedConfig({
  VANO_UK_ROADS_GEOJSON_URL:'http://localhost:8080/private'
 }).find(x=>x.id==='uk-national').enabled,false);
 assert.equal(officialRoadFeedConfig({
  VANO_UK_ROADS_GEOJSON_URL:'https://attacker.example/geojson'
 }).find(x=>x.id==='uk-national').enabled,false);
});
test('verified-format official GeoJSON accepts only geographically valid current events',()=>{
 const spec=officialRoadFeedConfig(config).find(x=>x.id==='uk-national');
 const found=normalizeOfficialRoadEvents(payload,spec,box);
 assert.equal(found.length,1);
 assert.equal(found[0].type,'obra');
 assert.equal(found[0].providerId,'uk-national');
 assert.equal(found[0].routingVerified,false);
});
test('advisory provider wakes in background, caches responses and never blocks routes',async()=>{
 let calls=0;
 const gateway=createOfficialRoadGateway({env:config,clock:()=>1000000,fetcher:async(url,opts)=>{
  calls++;assert.ok(url.startsWith('https://developer.data.nationalhighways.co.uk/'));
  assert.equal(opts.headers['Ocp-Apim-Subscription-Key'],'uk-test-secret');
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(payload)};
 }});
 const first=gateway.snapshot(box);
 assert.equal(first.features.length,0);
 assert.equal(first.sources.find(x=>x.id==='uk-national').status,'loading');
 await new Promise(setImmediate);
 const ready=gateway.snapshot(box);
 assert.equal(ready.features.length,1);
 assert.equal(ready.sources.find(x=>x.id==='uk-national').status,'fresh');
 assert.equal(calls,1);
 assert.equal(JSON.stringify(ready).includes('uk-test-secret'),false);
});
test('malformed DATEX/XML cannot masquerade as GeoJSON or alter current routes',async()=>{
 const gateway=createOfficialRoadGateway({env:config,clock:()=>1000000,fetcher:async()=>({
  ok:true,headers:{get:()=>null},text:async()=>'<d2LogicalModel></d2LogicalModel>'
 })});
 gateway.snapshot(box);
 await new Promise(setImmediate);
 const result=gateway.snapshot(box);
 assert.equal(result.features.length,0);
 assert.equal(result.affectsRouting,false);
});
test('Australian fire incidents are excluded and NSW/Victoria remain independently scoped',()=>{
 const spec=officialRoadFeedConfig({}).find(x=>x.id==='au-vic');
 const a=[144.8,-37.9,145.1,-37.7];
 const result=normalizeOfficialRoadEvents({type:'FeatureCollection',features:[
  {type:'Feature',id:'fire',geometry:{type:'Point',coordinates:[144.95,-37.8]},
   properties:{event_type:'bushfire',description:'Bushfire nearby'}},
  {type:'Feature',id:'road',geometry:{type:'Point',coordinates:[144.96,-37.8]},
   properties:{event_type:'incident',description:'Road closure'}}
 ]},spec,a);
 assert.deepEqual(result.map(x=>x.id),['official-au-vic-road']);
});
