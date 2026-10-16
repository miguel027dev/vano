import test from 'node:test';
import assert from 'node:assert/strict';
test('production MAVI first spoken greeting is fast before Cartesia audio synthesis',async()=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 const base='https://vanu-73xu.onrender.com';
 try{
  const b=await fetch(base+'/api/bootstrap',{signal:controller.signal});
  assert.equal(b.status,200);
  const cookie=(b.headers.get('set-cookie')||'').split(';')[0];
  const csrf=(await b.json()).csrfToken;
  const headers={'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':csrf};
  const send=(p,body)=>fetch(base+p,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
  const at=Date.now();
  const response=await send('/api/v2/assistant',{text:'Oi Mavi, tudo certo?',context:{firstMaviTurn:true}});
  const latencyMs=Date.now()-at;
  assert.equal(response.status,200);
  const answer=await response.json();
  console.info('MAVI instant greeting',JSON.stringify({latencyMs,intent:answer.intent,mode:answer.mode,length:answer.text?.length,hasTicket:!!answer.voiceTicket}));
  assert.equal(answer.intent,'greeting');
  assert.equal(answer.mode,'information');
  assert.ok(latencyMs<2800,'first greeting must not hit NVIDIA 5.6s cold start');
  assert.equal(typeof answer.voiceTicket,'string');
  const audioAt=Date.now();
  const speech=await send('/api/v2/assistant/speech',{ticket:answer.voiceTicket});
  const audioLatencyMs=Date.now()-audioAt;
  assert.equal(speech.status,200);
  const bytes=new Uint8Array(await speech.arrayBuffer());
  assert.ok(bytes.byteLength>=128&&bytes.byteLength<=2_000_000);
  console.info('MAVI first Cartesia MP3',JSON.stringify({audioLatencyMs,bytes:bytes.byteLength,mime:speech.headers.get('content-type')}));
 }finally{clearTimeout(timer);}
},{timeout:32000});
