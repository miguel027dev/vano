import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
const directory=mkdtempSync(path.join(tmpdir(),'mavi-stream-http-'));
process.env.NODE_ENV='test';
process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(directory,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-stream-http-test-secret-123456789';
process.env.NVIDIA_API_KEY='fake-nvidia-api-key-12345';
process.env.VANO_MAVI_NVIDIA_ENABLED='1';
process.env.VANO_MAVI_ELEVEN_ENABLED='0';
process.env.VANO_MAVI_CARTESIA_ENABLED='0';
const {server}=await import('./index.mjs');
const encoder=new TextEncoder();
test('read-only authenticated streaming conversation never issues map actions',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const orig=globalThis.fetch;
 let modelCalls=0,provided=null;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://integrate.api.nvidia.com/')){
   modelCalls++;provided=JSON.parse(init.body);
   const stream=new ReadableStream({start(ctrl){
    for(const text of ['Estou aqui para te ajudar. ','Como foi seu dia?'])
     ctrl.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n'));
    ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));ctrl.close();
   }});
   return new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream'}});
  }
  if(String(url).includes('mapbox.com'))throw Error('stream must not call routing');
  return orig(url,init);
 };
 try{
  const bootstrap=await orig(base+'/api/bootstrap');
  const cookie=(bootstrap.headers.get('set-cookie')||'').split(';')[0];
  const csrf=(await bootstrap.json()).csrfToken;
  const request=(text,headers={})=>orig(base+'/api/v2/assistant/talk-stream',{
   method:'POST',
   headers:{'Content-Type':'application/json',Cookie:cookie,...headers},
   body:JSON.stringify({text,context:{conversationHistory:[{role:'user',text:'Olá'}],
    userId:'SECRET_ACCOUNT',gps:[-46.67,-23.57]}})
  });
  const invalid=await request('Mavi, como você está?');
  assert.equal(invalid.status,403,'CSRF protection remains mandatory');
  const rejected=await request('Recalcule a minha rota',{'X-VANO-CSRF':csrf});
  assert.equal(rejected.status,422,'navigation commands are excluded from free-text streaming');
  const reply=await request('Mavi, como você está?',{'X-VANO-CSRF':csrf});
  assert.equal(reply.status,200);
  assert.match(reply.headers.get('content-type'),/application\/x-ndjson/);
  const packets=(await reply.text()).trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(packets.filter(x=>x.type==='chunk').length,2);
  assert.equal(packets.at(-1).type,'done');
  assert.equal(modelCalls,1);
  assert.equal(provided.stream,true);
  assert.doesNotMatch(JSON.stringify(provided),/SECRET_ACCOUNT|-46\.67/);
 }finally{
  globalThis.fetch=orig;
  await new Promise(resolve=>server.close(resolve));
  rmSync(directory,{recursive:true,force:true});
 }
});
