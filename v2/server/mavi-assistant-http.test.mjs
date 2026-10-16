import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'mavi-assistant-http-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-assistant-http-test-secret-12345678';
const {server}=await import('./index.mjs');

test('MAVI V2 can answer grounded questions without route or provider calls',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const native=globalThis.fetch;let providerCalls=0;
 globalThis.fetch=async(input,opts)=>{
   if(String(input).startsWith('https://api.mapbox.com')){providerCalls++;throw Error('Provider unexpectedly called for information intent');}
   return native(input,opts);
 };
 try{
  const boot=await native(base+'/api/bootstrap');assert.equal(boot.status,200);
  const token=(await boot.json()).csrfToken;
  const cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const post=async(text,context={})=>{
   const response=await native(base+'/api/v2/assistant',{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':token},
    body:JSON.stringify({text,context,origin:null,destination:null,vehicle:'carro',currentRouteKey:null})});
   assert.equal(response.status,200,text);
   return response.json();
  };
  const help=await post('Oi Mavi, me ajuda, o que você faz?');
  assert.equal(help.mode,'information');
  assert.match(help.text,/pedagio|pedágio|rota/i);
  const clock=await post('Mavi que horas são',{localClock:'14:37'});
  assert.match(clock.text,/14:37/);
  const beforeRoute=await post('Mavi, procura outra rota');
  assert.equal(beforeRoute.mode,'information');
  assert.match(beforeRoute.text,/escolha|calcule|rota/i);
  const context={hasRoute:true,navigationActive:true,gpsReady:true,
   destination:'Shopping Morumbi',vehicle:'carro',routeId:'fast',
   currentDuration:20,currentDistance:8,remainingMinutes:9,remainingKm:3.6,
   arrivalClock:'16:42',speedKmh:35,postedLimit:50,
   nextInstruction:'Vire à direita na Avenida Morumbi',nextDistanceMeters:90};
  assert.match((await post('Mavi quanto tempo falta',context)).text,/9 minutos/);
  assert.match((await post('Mavi a que horas chegamos',context)).text,/16:42/);
  assert.match((await post('qual é a próxima conversão',context)).text,/90 metros/);
  assert.match((await post('quanto falta em quilômetros',context)).text,/3,6/);
  const mute=await post('Mavi silenciar as orientações',context);
  assert.deepEqual([mute.mode,mute.action],['action','mute_guidance']);
  const unmute=await post('Mavi liga a voz',context);
  assert.deepEqual([unmute.mode,unmute.action],['action','unmute_guidance']);
  const noGps=await post('Mavi qual minha velocidade',{...context,gpsReady:false});
  assert.doesNotMatch(noGps.text,/35 quilômetros/);
  assert.equal(providerCalls,0);
 }finally{globalThis.fetch=native;await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
