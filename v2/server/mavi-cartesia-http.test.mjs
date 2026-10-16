import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const dir=mkdtempSync(path.join(tmpdir(),'mavi-cartesia-http-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-cartesia-test-secret-secure-1234567';
process.env.CARTESIA_API_KEY='sk_car_fake_key_only_for_unit_test_000';
process.env.CARTESIA_MAVI_VOICE_ID='8a6d0b8e-8cd8-4952-a41e-b7af18662135';
process.env.VANO_MAVI_CARTESIA_ENABLED='1';
process.env.VANO_MAVI_ELEVEN_ENABLED='0';
const {server}=await import('./index.mjs');

test('MAVI Cartesia issues one signed ticket only, streams MP3, blocks replay and arbitrary texts',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,originalFetch=globalThis.fetch;
 const audio=Uint8Array.from([73,68,51,...Array(300).fill(36)]);
 let seen=null,count=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.cartesia.ai/')){
   count++;seen={url,init};
   return new Response(audio,{status:200,headers:{'Content-Type':'audio/mpeg'}});
  }
  if(String(url).startsWith('https://api.elevenlabs.io/'))throw Error('ElevenLabs must not be invoked');
  if(String(url).startsWith('https://integrate.api.nvidia.com/'))throw Error('NVIDIA should not be needed for local information');
  return originalFetch(url,init);
 };
 try{
  const bootstrap=await originalFetch(base+'/api/bootstrap');
  assert.equal(bootstrap.status,200);
  const {csrfToken}=await bootstrap.json(),cookie=(bootstrap.headers.get('set-cookie')||'').split(';')[0];
  const headers={'Content-Type':'application/json','X-VANO-CSRF':csrfToken,'Cookie':cookie};
  const post=(endpoint,body,additional={})=>originalFetch(base+endpoint,{
   method:'POST',headers:{...headers,...additional},body:JSON.stringify(body)
  });
  const command=await post('/api/v2/assistant',{text:'Mavi, qual seu nome?',context:{hasRoute:false}});
  assert.equal(command.status,200);
  const reply=await command.json();
  assert.ok(reply.voiceTicket?.length>25);
  assert.doesNotMatch(JSON.stringify(reply),/sk_car_/);
  const unsafe=await post('/api/v2/assistant/speech',{text:'Texto arbitrário'});
  assert.equal(unsafe.status,403,'no unrestricted TTS proxy');
  const noCsrf=await post('/api/v2/assistant/speech',{ticket:reply.voiceTicket},{'X-VANO-CSRF':''});
  assert.equal(noCsrf.status,403);
  const voice=await post('/api/v2/assistant/speech',{ticket:reply.voiceTicket});
  assert.equal(voice.status,200);
  assert.match(voice.headers.get('content-type'),/audio\/mpeg/);
  assert.equal(voice.headers.get('cache-control'),'no-store, private');
  assert.deepEqual(new Uint8Array(await voice.arrayBuffer()),audio);
  assert.equal(count,1);
  assert.equal(seen.url,'https://api.cartesia.ai/tts/bytes');
  const params=JSON.parse(seen.init.body);
  assert.equal(params.model_id,'sonic-3.6');
  assert.equal(params.transcript,reply.text);
  assert.equal(params.voice,process.env.CARTESIA_MAVI_VOICE_ID);
  assert.equal(params.language,'pt');
  assert.equal(params.output_format.bit_rate,64000);
  const replay=await post('/api/v2/assistant/speech',{ticket:reply.voiceTicket});
  assert.equal(replay.status,409);
  assert.equal(count,1,'replay cannot spend provider credits');
  // Even with ElevenLabs disabled, existing navigation and assistant stay usable.
 }finally{
  globalThis.fetch=originalFetch;
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
