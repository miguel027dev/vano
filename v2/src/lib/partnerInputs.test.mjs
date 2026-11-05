import test from 'node:test';import assert from 'node:assert/strict';
import {partnerPlace,partnerAddress,resolvePartnerPlace,locatePartnerUser} from './partnerInputs.mjs';
test('partner inputs accept GPS positions and existing coordinate/address contracts without assuming a camera center',()=>{
 for(const value of [{lat:-23.56,lng:-46.65},{coords:[-46.65,-23.56]},{coords:{longitude:-46.65,latitude:-23.56}},{position:{coords:{longitude:-46.65,latitude:-23.56}}},{location:{lat:-23.56,lng:-46.65}},[-46.65,-23.56]])assert.deepEqual(partnerPlace(value).coords,[-46.65,-23.56]);
 assert.equal(partnerPlace({center:[-46.65,-23.56]}),null);assert.equal(partnerPlace({lat:100,lng:1}),null);assert.equal(partnerPlace({lat:'0',lng:'0'}),null);assert.deepEqual(partnerPlace({lat:0,lng:0}).coords,[0,0]);assert.equal(partnerAddress({address:'  Avenida Paulista, 1000  '}),'Avenida Paulista, 1000');
});
test('external address and selected place references resolve from real search results',async()=>{
 const search=async q=>{assert.equal(q,'Endereço do parceiro');return [{name:'Destino real',coords:[-46.7,-23.6]}];};
 assert.deepEqual((await resolvePartnerPlace('Endereço do parceiro',{search})).coords,[-46.7,-23.6]);
 assert.equal((await resolvePartnerPlace({place_id:'reference'},{details:async id=>{assert.equal(id,'reference');return {lat:-23.6,lng:-46.7,name:'Referência'};}})).name,'Referência');
 await assert.rejects(resolvePartnerPlace('Sem resultado',{search:async()=>[]}),e=>e.code==='ADDRESS_NOT_FOUND');
});
test('GPS is actually requested and permission denial never falls back to a fictional location',async()=>{
 const calls=[];const nav={geolocation:{getCurrentPosition(ok,fail,options){calls.push(options);ok({coords:{longitude:-46.65,latitude:-23.56,accuracy:8}});}}};
 const p=await locatePartnerUser(nav);assert.deepEqual(p.coords,[-46.65,-23.56]);assert.equal(p.source,'gps');assert.equal(p.accuracy_m,8);assert.equal(calls.length,1);assert.equal(calls[0].enableHighAccuracy,true);
 let denied=0;await assert.rejects(locatePartnerUser({geolocation:{getCurrentPosition(ok,fail){denied++;fail({code:1});}}}),e=>e.code==='LOCATION_PERMISSION_REQUIRED');assert.equal(denied,1);
 await assert.rejects(locatePartnerUser({}),e=>e.code==='LOCATION_UNAVAILABLE');
});
test('GPS retries an unavailable precise fix with bounded cached positioning',async()=>{
 const modes=[];const p=await locatePartnerUser({geolocation:{getCurrentPosition(ok,fail,options){modes.push(options.enableHighAccuracy);if(options.enableHighAccuracy)fail({code:3});else ok({coords:{latitude:-23.56,longitude:-46.65,accuracy:90}});}}});
 assert.deepEqual(modes,[true,false]);assert.equal(p.accuracy_m,90);
});
