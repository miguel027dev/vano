import test from 'node:test';
import assert from 'node:assert/strict';
import {geometryBounds,geometryTiles,pointGeometryDistance,inspectLayer} from './safe-routing/spatial-context.mjs';
import {validateContextIndex,compareInfrastructure} from './safe-routing/context-grid.mjs';
import {sanitizeGeoSampaFeature} from './safe-routing/ingestion.mjs';
import {readB2Object} from './safe-routing/b2-storage.mjs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const route={id:'candidate',geometry:{type:'LineString',coordinates:[[-46.655,-23.56],[-46.655,-23.561]]}};
test('spatial context separates nearby parallel roads and does not claim current flooding',()=>{
 const f={id:'road',geometry:route.geometry,properties:{nm_logradouro:'Rua teste'}};
 const hit=inspectLayer(route,[f],{key:'roads',radius:25});assert.equal(hit.nearSamples,hit.assessedSamples);assert.equal(hit.associationConfirmed,false);
 assert.equal(inspectLayer(route,[{...f,geometry:{type:'LineString',coordinates:[[-46.65,-23.56],[-46.65,-23.561]]}}],{key:'roads'}).matchedFeatures,0);
 const historic=inspectLayer(route,[f],{key:'floodHistory',radius:50});assert.equal(historic.currentFloodConfirmed,false);assert.equal(historic.usedForRanking,false);
});
test('polygon holes are excluded, geometry bounds and queries are limited',()=>{
 const polygon={type:'Polygon',coordinates:[[[-46.66,-23.57],[-46.65,-23.57],[-46.65,-23.55],[-46.66,-23.55],[-46.66,-23.57]],[[-46.657,-23.562],[-46.653,-23.562],[-46.653,-23.558],[-46.657,-23.558],[-46.657,-23.562]]]};
 assert.ok(pointGeometryDistance([-46.655,-23.56],polygon)>100);
 assert.equal(pointGeometryDistance([-46.659,-23.56],polygon),0);
 assert.deepEqual(geometryBounds(route.geometry),[-46.655,-23.561,-46.655,-23.56]);assert.ok(geometryTiles(route.geometry).length>0);
 assert.throws(()=>geometryBounds({coordinates:[0,0]}));assert.throws(()=>inspectLayer(route,new Array(150001)));
});
test('engineering fields retained, arbitrary names and ages excluded',()=>{
 const f=sanitizeGeoSampaFeature({id:'calcada.1',geometry:route.geometry,properties:{qt_largura_minima_trecho:1.5,nome:'Pessoa',idade:12,tx_situacao:'Cadastrada'}},{layer:'geoportal:calcada',snapshotId:'private-test'});
 assert.equal(f.properties.qt_largura_minima_trecho,1.5);assert.equal(f.properties.nome,undefined);assert.equal(f.properties.idade,undefined);
});
test('context index rejects incomplete, routing-enabled and escaping tiles',()=>{
 const index={kind:'context-grid-v1',key:'roads',sourceLayer:'geoportal:segmento_logradouro',snapshotId:'test',complete:true,gridScale:50,usedForRouting:false,stage:'private-evaluation-unapproved',tiles:{},features:1,rejected:0,reportedTotal:1};
 assert.equal(validateContextIndex(index,'roads','test'),index);
 assert.throws(()=>validateContextIndex({...index,complete:false},'roads','test'));assert.throws(()=>validateContextIndex({...index,usedForRouting:true},'roads','test'));
 assert.throws(()=>validateContextIndex({...index,tiles:{bad:{path:'elsewhere'}}},'roads','test'));
});
test('missing grids fail closed instead of reporting complete',async()=>{
 await assert.rejects(()=>compareInfrastructure([route],{env:{}}));
});
test('B2 range reads require exact partial response and byte count',async()=>{
 const config={keyId:'test-key-id',applicationKey:'not-a-real-secret',bucketId:'bucket-test-id',bucketName:'vano-safe-routing-sp-staging-20261016'};
 const args={authorization:{downloadUrl:'https://f005.backblazeb2.com',authorizationToken:'test'},config,path:'snapshots/private-test/bundles/0.bin',range:{offset:3,length:2}};
 const body=await readB2Object({...args,fetcher:async(url,opts)=>{assert.equal(opts.headers.Range,'bytes=3-4');return new Response('ab',{status:206,headers:{'content-range':'bytes 3-4/10'}});}});assert.equal(body.toString(),'ab');
 await assert.rejects(()=>readB2Object({...args,fetcher:async()=>new Response('ab')}),/intervalo/);
 await assert.rejects(()=>readB2Object({...args,fetcher:async()=>new Response('a',{status:206,headers:{'content-range':'bytes 3-4/10'}})}),/incompleto/);
});
test('five-layer integration verifies ranges and hashes for real-shaped candidate geometry',async()=>{
 const names={roads:'segmento_logradouro',sidewalks:'calcada',busLanes:'faixa_onibus',hydrologicalRisk:'risco_hidrologico',floodHistory:'risco_ocorrencia_alagamento'};
 const ids=Object.fromEntries(Object.keys(names).map(k=>[k,`geosampa-${k.toLowerCase()}-unit-context`]));
 const body=gzipSync(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',id:'fixture',geometry:route.geometry,properties:{sourceUpdatedAt:null}}]}));
 const env={VANO_SAFE_B2_APPLICATION_KEY_ID:'unit-key-id',VANO_SAFE_B2_APPLICATION_KEY:'not-a-real-secret',VANO_SAFE_B2_BUCKET_ID:'unit-bucket-id',VANO_SAFE_B2_BUCKET:'vano-safe-routing-sp-staging-20261016',VANO_SAFE_B2_CONTEXT_GRIDS:JSON.stringify(ids)};
 let ranges=0;
 const fetcher=async(url,options)=>{
  if(String(url).includes('b2_authorize_account'))return new Response(JSON.stringify({authorizationToken:'test-token',apiInfo:{storageApi:{apiUrl:'https://api005.backblazeb2.com',downloadUrl:'https://f005.backblazeb2.com',allowed:{buckets:[{id:'unit-bucket-id',name:env.VANO_SAFE_B2_BUCKET}],namePrefix:'snapshots/',capabilities:['writeFiles','readFiles']}}}}));
  const key=Object.keys(ids).find(k=>String(url).includes(ids[k]));assert.ok(key);
  if(String(url).endsWith('index.json'))return new Response(JSON.stringify({kind:'context-grid-v1',key,sourceLayer:`geoportal:${names[key]}`,snapshotId:ids[key],complete:true,gridScale:50,usedForRouting:false,stage:'private-evaluation-unapproved',features:1,rejected:0,reportedTotal:1,tiles:{'-2333_-1179':{path:`snapshots/${ids[key]}/bundles/0.bin`,offset:10,bytes:body.length,features:1,sha256:createHash('sha256').update(body).digest('hex')}}}));
  ranges++;assert.equal(options.headers.Range,`bytes=10-${9+body.length}`);
  return new Response(body,{status:206,headers:{'content-range':`bytes 10-${9+body.length}/${body.length+10}`}});
 };
 const result=await compareInfrastructure([route],{env,fetcher});assert.equal(result.complete,true);assert.equal(result.usedForRouting,false);assert.equal(ranges,5);
 assert.equal(Object.keys(result.layers).length,5);assert.equal(result.layers.roads.comparisons[0].matchedFeatures,1);
});
