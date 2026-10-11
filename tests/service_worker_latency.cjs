const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const handlers={};
const cached={marker:'cached map tile'},fresh={ok:true,type:'basic',marker:'updated map tile',clone(){return this}};
let resolveNetwork,background,responded;
const cache={match:async()=>cached,put:async()=>{},keys:async()=>[]};
const network=new Promise(resolve=>resolveNetwork=resolve);
const context={URL,AbortController,setTimeout,clearTimeout,Response,
  fetch:()=>network,caches:{open:async()=>cache},
  self:{location:{href:'https://vano.invalid/vano-sw.js?v=abcdef1',origin:'https://vano.invalid'},
    addEventListener:(name,fn)=>handlers[name]=fn}};
vm.runInNewContext(fs.readFileSync('static/vano-sw.js','utf8'),context);
(async()=>{
  handlers.fetch({request:{method:'GET',url:'https://api.mapbox.com/v4/streets/11/1/2.vector.pbf'},
    respondWith:p=>responded=p,waitUntil:p=>background=p});
  const response=await Promise.race([responded,new Promise((_,reject)=>setTimeout(()=>reject(new Error('cached tile waited for network')),100))]);
  assert.equal(response,cached);
  assert.ok(background,'refresh is kept alive in background');
  resolveNetwork(fresh);
  await background;
  console.log('PASS: cached map tile returned while network request is pending');
})().catch(error=>{console.error(error);process.exitCode=1});
