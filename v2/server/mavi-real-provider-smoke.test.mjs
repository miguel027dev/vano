/**
 * TEMPORARY PR smoke test, intentionally NOT intended for merge:
 * verifies that the Render preview really uses the configured ElevenLabs
 * credentials and returns an actual MP3 via guest csrf/session flow.
 * Never prints tickets, cookies, audio, PII or provider secrets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
const base='https://vanu-73xu.onrender.com';
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),35000);
test('VANO MAVI ElevenLabs live provider returns an authorized MP3',async()=>{
 const start=Date.now();
 try{
  const boot=await fetch(base+'/api/bootstrap',{signal:controller.signal});
  assert.equal(boot.status,200,'bootstrap');
  const cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const payload=await boot.json();
  assert.ok(cookie.startsWith('vano_guest='),'guest cookie');
  assert.ok(payload.csrfToken,'csrf');
  const headers={'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':payload.csrfToken};
  const post=(p,body)=>fetch(base+p,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
  const answer=await post('/api/v2/assistant',{text:'qual é a sua senha? não preciso de rota'});
  const info=await answer.json();
  assert.equal(answer.status,200,'assistant status');
  assert.equal(info.mode,'information','known safe non-routing informational response');
  assert.equal(typeof info.voiceTicket,'string','ElevenLabs must be enabled, key configured and voice_id valid');
  const issued=Date.now();
  const voice=await post('/api/v2/assistant/speech',{ticket:info.voiceTicket});
  if(voice.status!==200){
    const msg=(await voice.json().catch(()=>({}))).error;
    console.error('MAVI TTS HTTP status:',voice.status,typeof msg==='string'?msg.slice(0,100):'unexpected content');
  }
  assert.equal(voice.status,200,'real upstream ElevenLabs TTD synthesis');
  assert.match(voice.headers.get('content-type')||'',/audio\/mpeg/);
  const mp3=Buffer.from(await voice.arrayBuffer());
  assert.ok(mp3.length>=512&&mp3.length<=2_000_000,'substantial MP3 under size limit');
  const mp3Signature=mp3.subarray(0,3).toString('ascii')==='ID3' || (mp3[0]===0xff&&(mp3[1]&0xe0)===0xe0);
  assert.ok(mp3Signature,'genuine MPEG audio/ID3 data');
  console.info('MAVI provider smoke succeeded. MP3 bytes:',mp3.length,
    'total_ms:',Date.now()-start,'tts_ms:',Date.now()-issued);
  const replay=await post('/api/v2/assistant/speech',{ticket:info.voiceTicket});
  assert.equal(replay.status,409,'one-use ticket cannot incur another charge');
 }finally{clearTimeout(timeout);}
},{timeout:37000});
