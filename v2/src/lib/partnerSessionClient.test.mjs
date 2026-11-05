import test from 'node:test';import assert from 'node:assert/strict';
import {createPartnerSessionClient} from './partnerSessionClient.mjs';
test('browser transport rejects permanent secrets, unwraps feeds and rotates the session token',async()=>{
 assert.throws(()=>createPartnerSessionClient({token:'vp_secret',baseURL:'https://vano.example/api/partner/v1'}));
 const calls=[];const client=createPartnerSessionClient({token:'temporary',baseURL:'https://vano.example/api/partner/v1',fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:url.endsWith('/renew')?{browser_token:'next',expires_at:'2030-01-01T00:00:00Z'}:{features:[{id:'real'}]}})};}});
 const response=await client.overlayRequest('/api/map-features?bbox=1,2,3,4');assert.deepEqual(await response.json(),{features:[{id:'real'}]});assert.match(calls[0].url,/map-data\?service=map-features/);assert.equal(calls[0].options.credentials,'omit');
 await client.renew();await client.request('/places/search?q=Rua');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer next');
 await assert.rejects(client.request('//evil.example'));client.close();await assert.rejects(client.request('/capabilities'));
});
