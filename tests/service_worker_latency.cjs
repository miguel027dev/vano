const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const handlers={};
const cached={marker:'cached map tile'},fresh={ok:true,type:'basic',marker:'updated map tile',clone(){return this}};
let resolveNetwork,background,responded,networkRequest,savedKey;
const tile='https://api.mapbox.com/v4/streets/11/1/2.vector.pbf?access_token=public-test';
const cache={match:async key=>key===tile?cached:undefined,put:async key=>{savedKey=key},keys:async()=>[]};
const network=new Promise(resolve=>resolveNetwork=resolve);
const context={URL,AbortController,setTimeout,clearTimeout,Response,
  fetch:request=>{networkRequest=request;return network},caches:{open:async()=>cache},
  self:{location:{href:'https://vano.invalid/vano-sw.js?v=abcdef1',origin:'https://vano.invalid'},
    addEventListener:(name,fn)=>handlers[name]=fn}};
vm.runInNewContext(fs.readFileSync('static/vano-sw.js','utf8'),context);
(async()=>{
  handlers.fetch({request:{method:'GET',url:tile+'&sku=new-session'},
    respondWith:p=>responded=p,waitUntil:p=>background=p});
  const response=await Promise.race([responded,new Promise((_,reject)=>setTimeout(()=>reject(new Error('cached tile waited for network')),100))]);
  assert.equal(response,cached);
  assert.ok(background,'refresh is kept alive in background');
  resolveNetwork(fresh);
  await background;
  assert.equal(savedKey,tile,'cache key is stable across usage sessions');
  assert.equal(networkRequest.url,tile+'&sku=new-session','usage token remains on the network request');
  assert.notEqual(context.mapboxCacheKey({url:tile.replace('public-test','other-token')}),tile,'access tokens remain isolated');
  console.log('PASS: cached map tile returned while network request is pending');
})().catch(error=>{console.error(error);process.exitCode=1});
