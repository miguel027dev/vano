import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchMaviRoute} from './maviRouteDispatch.mjs';
test('routing begins before TTS acknowledgement and never waits on missing onend',async()=>{
 const steps=[];
 const stalledSpeech=()=>{steps.push('speech');return new Promise(()=>{});};
 const route=(command)=>{steps.push('route');return Promise.resolve({ok:true,command});};
 const result=await dispatchMaviRoute('troca a rota',route,stalledSpeech);
 assert.deepEqual(steps,['route','speech']);
 assert.deepEqual(result,{ok:true,command:'troca a rota'});
});
test('audio rejection or synchronous exceptions do not cancel recalculation',async()=>{
 assert.equal(await dispatchMaviRoute('recalcula',()=>2,()=>{throw Error('TTS blocked');}),2);
 assert.equal(await dispatchMaviRoute('recalcula',()=>3,()=>Promise.reject(Error('device voice missing'))),3);
});
test('route request errors are still reported when voice is silent',async()=>{
 await assert.rejects(dispatchMaviRoute('recalcula',()=>{throw Error('network');},()=>{}),/network/);
});
