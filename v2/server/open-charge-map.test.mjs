import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenChargeGateway,normalizeOpenChargeMap} from './open-charge-map.mjs';
const box=[-46.66,-23.57,-46.61,-23.53];
const entry={ID:15,AddressInfo:{Latitude:-23.55,Longitude:-46.64,Title:'Estação exemplo',Town:'São Paulo'},
 Connections:[{PowerKW:50,ConnectionType:{Title:'CCS'}}]};
test('Open Charge Map does not accept inaccurate points, duplicates or nonworking chargers',()=>{
 const values=normalizeOpenChargeMap([entry,entry,{...entry,ID:16,StatusType:{IsOperational:false}},
  {...entry,ID:17,AddressInfo:{Latitude:0,Longitude:0}},
  {...entry,ID:18,AddressInfo:{Latitude:null,Longitude:null}}],box);
 assert.equal(values.length,1);
 assert.equal(values[0].id,'ocm-15');
 assert.equal(values[0].type,'estacao-recarga');
 assert.equal(values[0].sourceUrl,'https://openchargemap.org/site/poi/details/15');
 assert.equal(values[0].liveAvailability,false);
});
test('Open Charge Map requires a server-side key, returns immediately, caches and never exposes token',async()=>{
 let calls=0;
 const gateway=createOpenChargeGateway({clock:()=>1000000,fetcher:async(url,opts)=>{
  calls++;
  assert.equal(url.origin,'https://api.openchargemap.io');
  assert.equal(url.searchParams.get('opendata'),'true');
  assert.equal(url.searchParams.get('key'),null);
  assert.equal(opts.headers['X-API-Key'],'secret-key');
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify([entry])};
 }});
 const off=gateway.snapshot(box);
 assert.equal(off.enabled,false);
 assert.equal(calls,0);
 const loading=gateway.snapshot(box,'secret-key');
 assert.equal(loading.status,'loading');
 assert.equal(loading.features.length,0);
 await new Promise(setImmediate);
 const ready=gateway.snapshot(box,'secret-key');
 assert.equal(ready.status,'fresh');
 assert.equal(ready.features.length,1);
 assert.equal(calls,1);
 assert.equal(JSON.stringify(ready).includes('secret-key'),false);
 assert.throws(()=>gateway.snapshot([-180,-85,180,85],'secret-key'),RangeError);
});
test('cached charging stations survive temporary upstream failure, without blocking the map',async()=>{
 let now=1000000,requests=0;
 const gateway=createOpenChargeGateway({clock:()=>now,fetcher:async()=>{
  requests++;
  if(requests>1)throw Error('provider outage');
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify([entry])};
 }});
 gateway.snapshot(box,'token');
 await new Promise(setImmediate);
 now+=13*60_000;
 const stale=gateway.snapshot(box,'token');
 assert.equal(stale.features.length,1);
 await new Promise(setImmediate);
 assert.equal(gateway.snapshot(box,'token').features.length,1);
 now+=46*60_000;
 assert.equal(gateway.snapshot(box,'token').features.length,0);
});
