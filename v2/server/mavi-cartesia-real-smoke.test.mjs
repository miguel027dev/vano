/**
 * Temporary non-merged live Cartesia smoke through Render.
 * Uses no privileged credentials, user GPS, real addresses, or secrets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
test('real VANO V2 Cartesia TTS generates authorized PT voice, MPEG and blocks ticket replay',async()=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),42000);
 const base='https://vanu-73xu.onrender.com';
 try{
  const boot=await fetch(base+'/api/bootstrap',{signal:controller.signal});
  assert.equal(boot.status,200);
  const {csrfToken}=await boot.json(),cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  assert.ok(csrfToken&&cookie.startsWith('vano_guest='));
  const headers={'Content-Type':'application/json','X-VANO-CSRF':csrfToken,'Cookie':cookie};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
  const assistant=await post('/api/v2/assistant',{text:'Mavi, qual é o limite de velocidade?',context:{navigationActive:false,hasRoute:false}});
  assert.equal(assistant.status,200);
  const reply=await assistant.json();
  assert.equal(reply.mode,'information');
  assert.equal(typeof reply.voiceTicket,'string','ticket must be active');
  assert.ok(reply.voiceTicket.length>25);
  const start=Date.now();
  const response=await post('/api/v2/assistant/speech',{ticket:reply.voiceTicket});
  const latency=Date.now()-start;
  console.info('Cartesia production TTS HTTP status',response.status,'latency_ms',latency,'mime',response.headers.get('content-type'));
  assert.equal(response.status,200,'Cartesia key/voice/model/credits must generate actual MP3');
  assert.match(response.headers.get('content-type')||'',/audio\/mpeg/);
  const buffer=new Uint8Array(await response.arrayBuffer());
  console.info('Cartesia voice bytes',buffer.byteLength,'audio_has_id3',String.fromCharCode(...buffer.slice(0,3))==='ID3');
  assert.ok(buffer.byteLength>=128&&buffer.byteLength<=2_000_000,'real MP3 content');
  assert.ok(
   String.fromCharCode(...buffer.slice(0,3))==='ID3'||
   (buffer[0]===255&&(buffer[1]&0xe0)===0xe0),
   'Cartesia audio must have a valid MPEG frame or ID3 header'
  );
  const repeat=await post('/api/v2/assistant/speech',{ticket:reply.voiceTicket});
  assert.equal(repeat.status,409,'voice ticket cannot be replayed or charged twice');
 }finally{clearTimeout(timeout);}
},{timeout:44000});
