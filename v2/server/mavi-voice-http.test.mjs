import test from 'node:test';
import assert from 'node:assert/strict';

// Fake provider only. No paid API key, upstream network calls or production deploy.
process.env.NODE_ENV='test';
process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_MAVI_ELEVEN_ENABLED='1';
process.env.ELEVENLABS_API_KEY='fake-elevenlabs-test-key';
process.env.ELEVENLABS_VOICE_ID='test-voice-1234567890';
process.env.VANO_SECURITY_SECRET='test-secret-mavi-integration-123456';
const {server}=await import('./index.mjs');

test('MAVI route reply authorizes exactly one protected ElevenLabs MP3 playback',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const networkFetch=globalThis.fetch;
 let upstreamCalls=0,upstreamBody=null;
 globalThis.fetch=async(url,opts)=>{
   if(String(url).startsWith('https://api.elevenlabs.io/')){
     upstreamCalls++;
     assert.equal(opts.headers['xi-api-key'],'fake-elevenlabs-test-key');
     upstreamBody=JSON.parse(opts.body);
     return new Response(new Uint8Array([73,68,51,0,1,2,3,4,5,6]),{
       headers:{'Content-Type':'audio/mpeg'},status:200
     });
   }
   return networkFetch(url,opts);
 };
 try{
   const boot=await networkFetch(base+'/api/bootstrap');
   assert.equal(boot.status,200);
   const session=(boot.headers.get('set-cookie')||'').split(';')[0];
   const {csrfToken}=await boot.json();
   assert.ok(session.includes('vano_guest='));
   assert.ok(csrfToken);
   const headers={'Content-Type':'application/json','Cookie':session,'X-VANO-CSRF':csrfToken};
   const post=(path,body,overrides={})=>networkFetch(base+path,{method:'POST',headers:{...headers,...overrides},body:JSON.stringify(body)});
   const assistant=await post('/api/v2/assistant',{text:'pedido sem intenção reconhecida'});
   assert.equal(assistant.status,200);
   const data=await assistant.json();
   assert.equal(data.mode,'information');
   assert.ok(typeof data.voiceTicket==='string'&&data.voiceTicket.length>25);
   assert.doesNotMatch(JSON.stringify(data),/fake-elevenlabs-test-key/);
   const blocked=await post('/api/v2/assistant/speech',{text:'qualquer texto'});
   assert.equal(blocked.status,403,'No arbitrary paid text-to-speech gateway');
   const voice=await post('/api/v2/assistant/speech',{ticket:data.voiceTicket});
   assert.equal(voice.status,200);
   assert.match(voice.headers.get('content-type'),/audio\/mpeg/);
   assert.equal(voice.headers.get('cache-control'),'no-store, private');
   assert.equal((await voice.arrayBuffer()).byteLength,10);
   assert.equal(upstreamCalls,1);
   assert.equal(upstreamBody.model_id,'eleven_v4_turbo');
   assert.equal(upstreamBody.language_code,'pt');
   assert.equal(upstreamBody.inputs[0].text,data.text);
   const replay=await post('/api/v2/assistant/speech',{ticket:data.voiceTicket});
   assert.equal(replay.status,409);
   assert.equal(upstreamCalls,1);
 }finally{
   globalThis.fetch=networkFetch;
   await new Promise(resolve=>server.close(resolve));
 }
});
