import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeOverturePlaces,overtureExtractUrl,createOvertureGateway} from './overture-places.mjs';
import {normalizePrfRiskGrid,prfHistoricalSnapshot} from './prf-historical.mjs';
const bbox=[-46.68,-23.6,-46.61,-23.53];
const sample={type:'FeatureCollection',features:[
 {type:'Feature',id:'overture-one',geometry:{type:'Point',coordinates:[-46.65,-23.55]},
  properties:{name:'Hospital Exemplo',category:'hospital'}},
 {type:'Feature',id:'overture-unknown',geometry:{type:'Point',coordinates:[-46.65,-23.55]},
  properties:{name:'Some unknown place',category:'unknown_category'}},
 {type:'Feature',id:'overture-outside',geometry:{type:'Point',coordinates:[8,8]},
  properties:{name:'Outside',category:'hospital'}}
]};
test('Overture places preserve valid categories and bounded genuine coordinates',()=>{
 const result=normalizeOverturePlaces(sample,bbox);
 assert.equal(result.length,1);
 assert.equal(result[0].type,'hospital');
 assert.equal(result[0].source,'Overture Maps');
 assert.equal(result[0].poi,true);
 assert.equal(overtureExtractUrl('http://127.0.0.1:9999/private'),null);
 assert.equal(overtureExtractUrl('https://wrong-provider.example/test'),null);
});
test('Overture region extract is optional, nonblocking and survives upstream outages',async()=>{
 let calls=0,clock=1000000;
 const gateway=createOvertureGateway({clock:()=>clock,fetcher:async()=>{
  calls++;return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(sample)};
 }});
 assert.equal(gateway.snapshot(bbox).enabled,false);
 const started=gateway.snapshot(bbox,'https://cdn.vanomaps.online/maps/sao-paulo.geojson');
 assert.equal(started.status,'loading');
 assert.equal(started.features.length,0);
 await new Promise(setImmediate);
 assert.equal(gateway.snapshot(bbox,'https://cdn.vanomaps.online/maps/sao-paulo.geojson').features.length,1);
 assert.equal(calls,1);
 clock+=13*60*60_000;
 assert.equal(gateway.snapshot(bbox,'https://cdn.vanomaps.online/maps/sao-paulo.geojson').features.length,1);
});
test('PRF history cannot be confused with current road incidents and never changes routes',()=>{
 assert.equal(normalizePrfRiskGrid({historical:true,live:false,rows:[
  [-46.65,-23.55,4],[-46.66,-23.56,1],[99,99,500]
 ]},bbox).length,1);
 const d=mkdtempSync(join(tmpdir(),'vano-prf-'));
 const f=join(d,'risk.json');
 try{
  writeFileSync(f,JSON.stringify({historical:true,live:false,importedAt:'2026-10-01',rows:[[-46.65,-23.55,7]]}));
  const response=prfHistoricalSnapshot(bbox,f);
  assert.equal(response.enabled,true);
  assert.equal(response.historical,true);
  assert.equal(response.live,false);
  assert.equal(response.cells[0].incidents,7);
  assert.equal(response.affectsRouting,false);
 }finally{rmSync(d,{force:true,recursive:true});}
});
test('public overlays include OCM and Overture without remounting the map',()=>{
 const client=readFileSync(new URL('../src/lib/mapPublicOverlay.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(client,/void refreshCharge\(bbox\)/);
 assert.match(client,/void refreshOverture\(bbox\)/);
 assert.match(api,/pathname==='\/api\/places\/openchargemap'/);
 assert.match(api,/pathname==='\/api\/places\/overture'/);
 assert.match(api,/pathname==='\/api\/historical\/prf'/);
 assert.match(api,/officialRoadSnapshot\(bbox\)/);
});
