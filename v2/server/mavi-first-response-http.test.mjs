import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(path.join(tmpdir(),'mavi-first-response-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='first-response-voice-test-secret-123456';
process.env.VANO_MAVI_NVIDIA_ENABLED='1';
process.env.NVIDIA_API_KEY='test-only-nvidia-key-123456789012345';
process.env.VANO_MAVI_CARTESIA_ENABLED='0';
process.env.VANO_MAVI_ELEVEN_ENABLED='0';
const {server}=await import('./index.mjs');

test('first greeting has no provider cold start, while first unfamiliar query uses bounded inference',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const native=globalThis.fetch;
 let nvidiaCalls=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('integrate.api.nvidia.com')){
   nvidiaCalls++;
   return await new Promise((resolve,reject)=>{
    if(init.signal?.aborted){reject(new Error('aborted'));return;}
    init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
   });
  }
  return native(url,init);
 };
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const boot=await native(base+'/api/bootstrap');
  assert.equal(boot.status,200);
  const cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const csrf=(await boot.json()).csrfToken;
  const send=async(text,firstMaviTurn)=>{
   const start=performance.now();
   const res=await native(base+'/api/v2/assistant',{method:'POST',
    headers:{'Content-Type':'application/json','X-VANO-CSRF':csrf,'Cookie':cookie},
    body:JSON.stringify({text,context:{firstMaviTurn}})});
   assert.equal(res.status,200);
   return {...(await res.json()),elapsed:performance.now()-start};
  };
  const greeting=await send('Oi Mavi, tudo certo?',true);
  assert.equal(greeting.intent,'greeting');
  assert.ok(greeting.elapsed<1200,'greeting must never wait for NVIDIA cold start: '+Math.round(greeting.elapsed));
  const help=await send('Mavi, o que você consegue fazer?',false);
  assert.equal(help.intent,'help');
  assert.equal(nvidiaCalls,0);
  const general=await send('Mavi, conta uma historinha divertida sobre estrelas?',true);
  assert.equal(general.mode,'information');
  assert.equal(general.intent,'unknown');
  assert.equal(nvidiaCalls,1);
  assert.ok(general.elapsed>=1750&&general.elapsed<3600,'first unknown turn must fall back within two seconds + HTTP margin: '+Math.round(general.elapsed));
 }finally{
  globalThis.fetch=native;
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
},{timeout:12000});
