import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
test('consent gates both sinks, free text is discarded, retries reuse event IDs',async()=>{
 const originalWindow=globalThis.window,originalTimer=globalThis.setTimeout,originalCrypto=globalThis.crypto;
 const storage=new Map(),native=[],sent=[],timers=[];
 const fake={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},VanoHost:{postMessage:s=>native.push(JSON.parse(s))}};fake.top=fake;
 globalThis.window=fake;globalThis.setTimeout=fn=>{timers.push(fn);return {unref(){}};};
 if(!globalThis.crypto)globalThis.crypto={randomUUID};
 try{
  const {observe,setObservabilityConsent,configureObservability}=await import('./observability.mjs');
  configureObservability(async body=>{sent.push(body);if(sent.length===1)throw Error('offline');});
  observe('route_request');assert.equal(native.length,0);assert.equal(timers.length,0);
  setObservabilityConsent(true);
  observe('first_open');assert.equal(timers.length,0);
  observe('route_request',{duration_ms:50,kind:'route',latitude:-23.5,address:'private'});
  assert.equal(native.filter(e=>e.action==='observabilityEvent').length,1);
  assert.deepEqual(native.at(-1).params,{duration_ms:50,kind:'route'});
  timers.shift()();await new Promise(resolve=>setImmediate(resolve));
  timers.shift()();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sent.length,2);assert.equal(sent[0].events[0].id,sent[1].events[0].id);
  assert.ok(!JSON.stringify(sent).includes('private'));
  setObservabilityConsent(false);observe('route_request');assert.equal(timers.length,0);
  assert.equal(native.at(-1).granted,false);
 }finally{globalThis.window=originalWindow;globalThis.setTimeout=originalTimer;if(!originalCrypto)delete globalThis.crypto;}
});
