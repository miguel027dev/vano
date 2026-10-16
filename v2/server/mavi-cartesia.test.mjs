import test from 'node:test';
import assert from 'node:assert/strict';
import {maviCartesiaConfig,cartesiaVoiceRequest,fetchMaviCartesiaVoice,MAVI_CARTESIA_API_VERSION,MAVI_CARTESIA_MODEL} from './mavi-cartesia.mjs';
const fakeEnv={
 VANO_MAVI_CARTESIA_ENABLED:'1',
 CARTESIA_API_KEY:'sk_car_fake_key_for_test_only_000000',
 CARTESIA_MAVI_VOICE_ID:'8a6d0b8e-8cd8-4952-a41e-b7af18662135'
};
const config=maviCartesiaConfig(fakeEnv);

test('Cartesia remains off by default and requires server-side key plus real voice UUID',()=>{
 assert.equal(maviCartesiaConfig({}).enabled,false);
 assert.equal(maviCartesiaConfig({...fakeEnv,VANO_MAVI_CARTESIA_ENABLED:'0'}).enabled,false);
 assert.equal(maviCartesiaConfig({...fakeEnv,CARTESIA_API_KEY:''}).enabled,false);
 assert.equal(maviCartesiaConfig({...fakeEnv,CARTESIA_MAVI_VOICE_ID:'javascript:alert(1)'}).enabled,false);
 assert.equal(config.enabled,true);
 assert.equal(config.model,MAVI_CARTESIA_MODEL);
 assert.equal(MAVI_CARTESIA_API_VERSION,'2026-08-14');
});
test('Sonic 3.6 uses Cartesia REST API with low-bandwidth MP3, PT language and chosen voice',()=>{
 const {endpoint,init}=cartesiaVoiceRequest('  Em 150 metros, vire à direita.  ',config);
 assert.equal(endpoint,'https://api.cartesia.ai/tts/bytes');
 assert.equal(init.method,'POST');
 assert.equal(init.headers['Authorization'],'Bearer '+fakeEnv.CARTESIA_API_KEY);
 assert.equal(init.headers['Cartesia-Version'],'2026-08-14');
 assert.equal(init.headers.Accept,'audio/mpeg');
 assert.deepEqual(JSON.parse(init.body),{
  model_id:'sonic-3.6',
  transcript:'Em 150 metros, vire à direita.',
  voice:fakeEnv.CARTESIA_MAVI_VOICE_ID,
  language:'pt',
  output_format:{container:'mp3',sample_rate:24000,bit_rate:64000},
  generation_config:{speed:1,volume:1}
 });
 assert.throws(()=>cartesiaVoiceRequest('x'.repeat(451),config));
 assert.throws(()=>cartesiaVoiceRequest('oi',maviCartesiaConfig({...fakeEnv,VANO_MAVI_CARTESIA_ENABLED:'0'})));
});
test('provider validates audio content, quota size and sanitized errors',async()=>{
 let seen;
 const mock={ok:true,headers:{get:key=>key==='content-type'?'audio/mpeg':key==='content-length'?'143':null},body:{}};
 const actual=await fetchMaviCartesiaVoice('Bom dia!',config,{
  fetcher:async(url,init)=>{seen={url,init};return mock;}
 });
 assert.equal(actual,mock);
 assert.equal(seen.url,'https://api.cartesia.ai/tts/bytes');
 assert.equal(seen.init.headers['Authorization'],'Bearer '+fakeEnv.CARTESIA_API_KEY);
 const statuses=[402,403,429,500];
 for(const status of statuses)await assert.rejects(
  fetchMaviCartesiaVoice('Olá',config,{fetcher:async()=>({ok:false,status})}),
  e=>e.message==='mavi_cartesia_provider'&&e.upstreamStatus===status
 );
 await assert.rejects(fetchMaviCartesiaVoice('Olá',config,{fetcher:async()=>{throw Error('secret exposed inside error');}}),/mavi_cartesia_transport/);
 await assert.rejects(fetchMaviCartesiaVoice('Olá',config,{fetcher:async()=>({ok:true,body:{},headers:{get:()=> 'text/html'}})}),/mavi_cartesia_media/);
 await assert.rejects(fetchMaviCartesiaVoice('Olá',config,{fetcher:async()=>({ok:true,body:{},headers:{get:k=>k==='content-type'?'audio/mpeg':'3000000'}})}),/mavi_cartesia_oversize/);
});
