import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTomTomBBox,normalizeTomTomIncidents,createTomTomGateway,TOMTOM_ENV_NAME} from './tomtom-incidents.mjs';

const box=[-46.70,-23.61,-46.63,-23.54],clock=Date.parse('2026-10-16T18:00:00Z');
const item=(id,cat,geometry={type:'Point',coordinates:[-46.67,-23.58]},changes={})=>({
 type:'Feature',geometry,properties:{id,iconCategory:cat,timeValidity:'present',
 startTime:'2026-10-16T15:00:00Z',endTime:'2026-10-16T22:00:00Z',
 events:[{description:'Maintenance on road'}],...changes}
});
test('ENV name is server private and bbox is geographically bounded',()=>{
 assert.equal(TOMTOM_ENV_NAME,'VANO_TOMTOM_API_KEY');
 for(const v of ['','-180,-90,180,90','-46,-23,-46,-23','-46,-23,-44,-21','0,NaN,1,2'])
  assert.equal(parseTomTomBBox(v),null);
 assert.deepEqual(parseTomTomBBox(box.join(',')),box);
});
test('TomTom Orbis categories are mapped without inventing coordinates or closures',()=>{
 const result=normalizeTomTomIncidents({incidents:[
  item('work1','roadWorks'),item('closed','roadClosed'),
  item('lane','laneClosed'),item('accident','accident'),item('jam','jam'),
  item('future','roadWorks',undefined,{timeValidity:'future'}),
  item('expired','roadWorks',undefined,{endTime:'2026-10-16T12:00:00Z'}),
  item('outside','roadWorks',{type:'Point',coordinates:[12,40]}),
  item('bad','roadWorks',{type:'LineString',coordinates:[[12,40],[13,41]]}),
  item('line','roadWorks',{type:'LineString',coordinates:[[-46.672,-23.581],[-46.671,-23.580]]}),
  item('work1','roadWorks')
 ]},box,clock);
 assert.equal(result.length,6);
 assert.deepEqual(result.map(x=>x.type),['obra','alerta-via','alerta-via','alerta-via','alerta-via','obra']);
 assert.ok(result.every(x=>x.source==='TomTom Traffic'&&!x.routingVerified&&x.regional));
 assert.ok(result[0].description.includes('Maintenance'));
});
test('without API key the adapter never fetches external data',async()=>{
 let calls=0;
 const gateway=createTomTomGateway({fetcher:async()=>{calls++;throw Error('should not call')},clock:()=>clock});
 assert.deepEqual(gateway.snapshot(box,'').features,[]);
 assert.equal(gateway.snapshot(box,'').status,'unconfigured');
 await Promise.resolve();assert.equal(calls,0);
});
test('first query returns immediately; key goes only in private request header',async()=>{
 let resolveFetch,called=0,request;
 const pause=new Promise(resolve=>{resolveFetch=resolve});
 const gateway=createTomTomGateway({fetcher:async(url,opts)=>{
  called++;request={url,headers:opts.headers};await pause;
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({incidents:[item('works','roadWorks')]})};
 },clock:()=>clock});
 const first=gateway.snapshot(box,'secret-test');
 assert.equal(first.status,'loading');
 assert.deepEqual(first.features,[]);
 await Promise.resolve();
 assert.equal(called,1);
 assert.ok(request.url.includes('apiVersion=2'));
 assert.ok(request.url.includes('timeValidity=present'));
 assert.ok(!request.url.includes('secret-test'));
 assert.equal(request.headers['TomTom-Api-Key'],'secret-test');
 assert.ok(request.headers.Attributes.includes('iconCategory'));
 resolveFetch();
 await new Promise(setImmediate);
 const ready=gateway.snapshot(box,'secret-test');
 assert.equal(ready.features.length,1);
 assert.equal(ready.status,'fresh');
 assert.equal(ready.affectsRouting,false);
 assert.equal(called,1);
 assert.ok(!JSON.stringify(ready).includes('secret-test'));
});
test('failed provider and unauthorized account do not produce fabricated incidents',async()=>{
 let calls=0;
 const gateway=createTomTomGateway({fetcher:async()=>{calls++;return {ok:false,status:401}},clock:()=>clock});
 assert.equal(gateway.snapshot(box,'invalid-key').status,'loading');
 await new Promise(setImmediate);
 assert.equal(gateway.snapshot(box,'invalid-key').status,'unavailable');
 assert.deepEqual(gateway.snapshot(box,'invalid-key').features,[]);
 assert.equal(calls,1);
});
test('app exposes only a bounded public status, and client uses existing map icon pipeline',()=>{
 const index=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../src/lib/mapPublicOverlay.js',import.meta.url),'utf8');
 assert.ok(index.includes("process.env[TOMTOM_ENV_NAME]"));
 assert.ok(index.includes("pathname==='/api/traffic/incidents/tomtom'"));
 assert.ok(index.includes("parseTomTomBBox(u.searchParams.get('bbox'))"));
 assert.ok(overlay.includes('void refreshTomTom(bbox)'));
 assert.ok(overlay.includes('rememberPublicFeatures(sourceCache,data.features'));
 assert.ok(overlay.includes('tomtomCredit.hidden=!allowed.some'));
 assert.ok(overlay.includes('tomtomDisabled=true'));
});
