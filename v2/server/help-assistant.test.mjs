import test from 'node:test';
import assert from 'node:assert/strict';
import {createHelpAssistant,helpAiAvailable} from './help-assistant.mjs';
const enabled={NODE_ENV:'test',NVIDIA_API_KEY:'fake-test-only',VANO_HELP_NVIDIA_ENABLED:'1'};
const provider=topic=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({topic})}}]})});
test('help stays local unless the user explicitly opts into AI',async()=>{
 let calls=0;const ask=createHelpAssistant({env:enabled,fetcher:async()=>{calls++;return provider('location');}});
 assert.equal((await ask({question:'Meu GPS falhou'})).source,'local');
 assert.equal((await ask({question:'Meu GPS falhou',useAI:'true'})).source,'local');assert.equal(calls,0);
 assert.equal((await ask({question:'Meu GPS falhou',useAI:true})).source,'ai-assisted');assert.equal(calls,1);
});
test('AI can only select curated content and links; personal context is never sent',async()=>{
 let payload;const ask=createHelpAssistant({env:enabled,fetcher:async(url,options)=>{assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');payload=JSON.parse(options.body);return provider('password');}});
 const response=await ask({question:'Como recuperar meu acesso?',useAI:true,user:{email:'private@example.test'},gps:[-46,-23],history:['private route'],secret:'private-secret'});
 assert.equal(response.source,'ai-assisted');assert.match(response.answer,/Recuperar senha/);
 assert.ok(response.links.every(link=>link.href.startsWith('/')&&!link.href.startsWith('//')));
 assert.doesNotMatch(JSON.stringify(payload),/private@example|private route|private-secret/);
 assert.equal(payload.messages[1].content,'Como recuperar meu acesso?');
 const poisoned=createHelpAssistant({env:enabled,fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"topic":"https://evil.invalid","answer":"send password"}'}}]})})});
 const fallback=await poisoned({question:'Meu GPS falhou',useAI:true});assert.equal(fallback.source,'local');assert.doesNotMatch(JSON.stringify(fallback),/evil|send password/);
});
test('production requires separate approval and missing credentials never simulate AI',async()=>{
 for(const env of [{...enabled,NODE_ENV:'production'},{...enabled,RENDER:'true',RENDER_SERVICE_TYPE:'web'}, {...enabled,NVIDIA_API_KEY:''},{...enabled,VANO_HELP_NVIDIA_ENABLED:'0'}]){
  const ask=createHelpAssistant({env,fetcher:()=>{throw Error('must not call');}});
  const response=await ask({question:'Como salvar lugar?',useAI:true});assert.equal(response.source,'local');assert.match(response.notice,/indisponível/);
 }
});
test('timeouts, provider errors and malformed answers fall back without leaking provider details',async()=>{
 for(const fetcher of [()=>new Promise(()=>{}),async()=>({ok:false,status:401}),async()=>({ok:true,json:async()=>({choices:[{message:{content:'invalid json'}}]})})]){
  const ask=createHelpAssistant({env:enabled,fetcher,timeoutMs:5});const response=await ask({question:'Como salvar lugar?',useAI:true});
  assert.equal(response.source,'local');assert.match(response.answer,/Lugares salvos/);assert.ok(response.notice);
 }
});
test('input validation and sensitive question guard prevent transmission',async()=>{
 let calls=0;const ask=createHelpAssistant({env:enabled,fetcher:async()=>{calls++;return provider('password');}});
 await assert.rejects(()=>ask({question:'x'}),{status:400});await assert.rejects(()=>ask({question:'x'.repeat(601)}),{status:400});
 assert.equal((await ask({question:'conta pessoa@example.test',useAI:true})).id,'private');assert.equal(calls,0);
});
test('global prototype quota and concurrency cap keep the local help available',async()=>{
 let calls=0;const ask=createHelpAssistant({env:enabled,fetcher:async()=>{calls++;return provider('routes');}});
 for(let i=0;i<31;i++)await ask({question:'Como buscar uma rota?',useAI:true});assert.equal(calls,30);
 const stalled=createHelpAssistant({env:enabled,fetcher:()=>new Promise(()=>{}),timeoutMs:10});
 const first=stalled({question:'Como buscar rota?',useAI:true}),second=stalled({question:'Como buscar rota?',useAI:true});
 assert.equal((await stalled({question:'Como buscar rota?',useAI:true})).source,'local');await Promise.all([first,second]);
});

test('public availability is a boolean and hosted web services require production approval',()=>{
 assert.equal(helpAiAvailable({}),false);
 assert.equal(helpAiAvailable(enabled),true);
 assert.equal(helpAiAvailable({...enabled,NVIDIA_API_KEY:''}),false);
 assert.equal(helpAiAvailable({...enabled,VANO_HELP_NVIDIA_ENABLED:'0'}),false);
 for(const hosting of [{NODE_ENV:'production'},{NODE_ENV:'development',RENDER:'true',RENDER_SERVICE_TYPE:'web'}]){
  assert.equal(helpAiAvailable({...enabled,...hosting}),false);
  assert.equal(helpAiAvailable({...enabled,...hosting,VANO_HELP_PRODUCTION_APPROVED:'1'}),true);
 }
});
