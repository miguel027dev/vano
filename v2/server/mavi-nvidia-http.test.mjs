import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'mavi-nvidia-http-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-nvidia-mocked-http-secret-123456';
process.env.NVIDIA_API_KEY='mock-nvapi-key-for-test-1234567890';
process.env.VANO_MAVI_NVIDIA_ENABLED='1';
const {server}=await import('./index.mjs');
test('guest voice assistant accepts NVIDIA structured intent but never directly runs unauthorized actions',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='http://127.0.0.1:'+server.address().port;
 const native=globalThis.fetch;
 let providerCalls=0,providerContent={action:'general',reply:'Olá! Posso conversar e ajudar no seu trajeto.'};
 globalThis.fetch=async(url,opts)=>{
  if(String(url).startsWith('https://integrate.api.nvidia.com/')){
   providerCalls++;
   assert.equal(opts.headers.Authorization,'Bearer '+process.env.NVIDIA_API_KEY);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(providerContent)}}]}),{
    status:200,headers:{'Content-Type':'application/json'}});
  }
  if(String(url).includes('api.mapbox.com'))throw Error('No route search should happen for readonly responses');
  return native(url,opts);
 };
 try{
  const response=await native(endpoint+'/api/bootstrap');
  assert.equal(response.status,200);
  const cookie=(response.headers.get('set-cookie')||'').split(';')[0];
  const csrf=(await response.json()).csrfToken;
  const ask=async(text,context={})=>{
   const r=await native(endpoint+'/api/v2/assistant',{method:'POST',
    headers:{'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':csrf},
    body:JSON.stringify({text,context,origin:null,destination:null})});
   assert.equal(r.status,200);
   return r.json();
  };
  const chat=await ask('Mavi, bate um papo bem rápido comigo');
  assert.equal(chat.mode,'information');
  assert.equal(chat.text,providerContent.reply);
  providerContent={action:'information',intent:'arrival',reply:'Você chegará em 10 segundos, confia'};
  const arrival=await ask('Mavi, que horas eu chego?',{
    hasRoute:true,navigationActive:true,gpsReady:true,
    currentDuration:18,remainingMinutes:8,arrivalClock:'16:42'
  });
  assert.equal(arrival.intent,'arrival');
  assert.match(arrival.text,/16:42/);
  assert.doesNotMatch(arrival.text,/10 segundos/);
  providerContent={action:'route',intent:'delete_user'};
  const invalid=await ask('Mavi, faça uma coisa estranha comigo');
  assert.equal(invalid.mode,'information');
  assert.equal(invalid.intent,'unknown');
  providerContent={action:'information',intent:'greeting',reply:'Oi, sou sua MAVI. Como posso ajudar no caminho?'};
  const greet=await ask('Oi Mavi!');
  assert.equal(greet.intent,'greeting');
  assert.match(greet.text,/Oi, sou sua MAVI/);
  assert.equal(providerCalls,3,'read-only GPS ETA should never query NVIDIA when local answer exists');
 }finally{
  globalThis.fetch=native;
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
