import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(path.join(tmpdir(),'mavi-talk-http-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-talk-http-integration-test-secret-12345';
process.env.NVIDIA_API_KEY='fake-nvidia-key-talk-test-12345';
process.env.VANO_MAVI_NVIDIA_ENABLED='1';
process.env.VANO_MAVI_CARTESIA_ENABLED='0';process.env.VANO_MAVI_ELEVEN_ENABLED='0';
const {server}=await import('./index.mjs');
test('MAVI Talk has natural multi-turn chat without changing routes or sending GPS to NVIDIA',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const orig=globalThis.fetch;
 let providerCalls=0,upstreamRequest=null;
 let answer={action:'general',reply:'Tô por aqui e pronta pra conversar. Como você está hoje?'};
 globalThis.fetch=async(target,init)=>{
  if(String(target).startsWith('https://integrate.api.nvidia.com/')){
   providerCalls++;
   upstreamRequest=JSON.parse(init.body);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}),{
    status:200,headers:{'Content-Type':'application/json'}
   });
  }
  if(String(target).includes('api.mapbox.com'))throw Error('talk never invokes routing');
  return orig(target,init);
 };
 try{
  const boot=await orig(url+'/api/bootstrap');
  const cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const csrf=(await boot.json()).csrfToken;
  const ask=async(text,context={})=>{
   const res=await orig(url+'/api/v2/assistant',{
    method:'POST',
    headers:{'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':csrf},
    body:JSON.stringify({text,context,origin:[-46.7,-23.6],destination:[-46.8,-23.5],vehicle:'carro'})
   });
   assert.equal(res.status,200);
   return res.json();
  };
  const greeted=await ask('Oi Mavi, você tá bem?');
  assert.equal(greeted.mode,'information');
  assert.equal(greeted.intent,'general');
  assert.equal(greeted.text,answer.reply);
  assert.equal(providerCalls,1);
  assert.equal(JSON.parse(upstreamRequest.messages[1].content).context.talkMode,true);
  answer={action:'general',reply:'Poxa, parece que seu dia foi difícil. Quer me contar o que aconteceu?'};
  const prev=[{role:'user',text:'Oi Mavi, você tá bem?'},{role:'assistant',text:greeted.text}];
  const low=await ask('Hoje meu dia foi triste',{conversationHistory:prev,hasRoute:true,
   userId:'NEVER-LEAK-ACCOUNT',destination:'PRIVATE-PLACE',origin:[-46.7,-23.6]});
  assert.equal(low.intent,'general');
  assert.equal(low.text,answer.reply);
  const upstream=JSON.parse(upstreamRequest.messages[1].content);
  assert.equal(upstream.dialogue.length,2);
  assert.doesNotMatch(JSON.stringify(upstream),/NEVER-LEAK-ACCOUNT|PRIVATE-PLACE|-46\.7/);
  answer={action:'route',intent:'fast_route'};
  const follow=await ask('Nossa, sério?',{conversationHistory:prev});
  assert.equal(follow.intent,'general','conversational turn must not cause a route change');
  assert.equal(follow.mode,'information');
  const before=providerCalls;
  const quick=await ask('Oi Mavi!',{conversationHistory:prev});
  assert.equal(quick.intent,'greeting');
  assert.equal(providerCalls,before,'standalone greeting must stay local');
 }finally{
  globalThis.fetch=orig;
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
