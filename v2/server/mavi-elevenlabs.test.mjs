import test from 'node:test';
import assert from 'node:assert/strict';
import {maviElevenConfig,maviSpeechText,maviVoiceRequest,fetchMaviVoice,DEFAULT_MAVI_MODEL,MAVI_VOICE_MAX_CHARS} from './mavi-elevenlabs.mjs';

const env={VANO_MAVI_ELEVEN_ENABLED:'1',ELEVENLABS_API_KEY:'my-test-server-key',ELEVENLABS_VOICE_ID:'voice-12345678901234'};
const config=maviElevenConfig(env);

test('fails closed if feature flag, secret or voice selection are missing',()=>{
 assert.equal(maviElevenConfig({...env,VANO_MAVI_ELEVEN_ENABLED:'0'}).enabled,false);
 assert.equal(maviElevenConfig({...env,ELEVENLABS_API_KEY:''}).enabled,false);
 assert.equal(maviElevenConfig({...env,ELEVENLABS_VOICE_ID:''}).enabled,false);
 assert.equal(config.enabled,true);
 assert.equal(config.model,DEFAULT_MAVI_MODEL);
});
test('MAVI never sends invalid or overlong speech text',()=>{
 assert.equal(maviSpeechText(''),null);
 assert.equal(maviSpeechText('x'.repeat(MAVI_VOICE_MAX_CHARS+1)),null);
 assert.equal(maviSpeechText('bom dia\nnova linha'),null);
 assert.equal(maviSpeechText(' Encontrei outra rota. '),'Encontrei outra rota.');
});
test('v4 Turbo must use text-to-dialogue stream, never incompatible TTS websocket',()=>{
 const {endpoint,init}=maviVoiceRequest('Encontrei outra rota.',config);
 assert.match(endpoint,/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-dialogue\/stream\?/);
 assert.equal(init.method,'POST');
 assert.equal(init.headers['xi-api-key'],env.ELEVENLABS_API_KEY);
 assert.deepEqual(JSON.parse(init.body),{
   model_id:'eleven_v4_turbo',language_code:'pt',
   inputs:[{voice_id:env.ELEVENLABS_VOICE_ID,text:'Encontrei outra rota.'}]
 });
 assert.doesNotThrow(()=>maviVoiceRequest('Encontrada rota mais rápida',config));
 assert.throws(()=>maviVoiceRequest('x'.repeat(500),config));
});
test('fetcher validates upstream response and does not leak provider errors',async()=>{
 let upstreamUrl='',upstreamInit=null;
 const fake={ok:true,headers:{get:key=>key==='content-type'?'audio/mpeg':''},body:{[Symbol.asyncIterator]:async function*(){yield Uint8Array.of(1,2)}}};
 const r=await fetchMaviVoice('Rota recalculada.',config,{fetcher:async(url,init)=>{upstreamUrl=url;upstreamInit=init;return fake;}});
 assert.equal(r,fake);
 assert.equal(upstreamInit.headers['xi-api-key'],env.ELEVENLABS_API_KEY);
 assert.ok(upstreamUrl.startsWith('https://api.elevenlabs.io/'));
 await assert.rejects(fetchMaviVoice('Olá',config,{fetcher:async()=>({ok:false,status:429})}),/mavi_voice_provider_failed/);
 await assert.rejects(fetchMaviVoice('Olá',config,{fetcher:async()=>{throw Error('internal secret details')}}),/mavi_voice_unavailable/);
 await assert.rejects(fetchMaviVoice('Olá',config,{fetcher:async()=>({ok:true,headers:{get:()=> 'text/html'},body:{}})}),/mavi_voice_bad_media/);
});
