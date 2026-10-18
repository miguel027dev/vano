import test from 'node:test';
import assert from 'node:assert/strict';
import {splitMaviSpeech,streamMaviTalk} from './mavi-talk-stream.mjs';

const enc=new TextEncoder();
const cfg={enabled:true,key:'fake-test-key-123456',model:'nvidia/nemotron-3.5-lightning-30b-a3b',talkTimeoutMs:3600};
const upstream=(texts)=>({
 ok:true,body:new ReadableStream({start(c){
  for(const text of texts)c.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n'));
  c.enqueue(enc.encode('data: [DONE]\n\n'));c.close();
 }})
});
test('sentence splitting does not start voice halfway through a word',()=>{
 assert.deepEqual(splitMaviSpeech('Você pode seguir na próxima rua. Mais detalhes em instantes.').sentences,['Você pode seguir na próxima rua.','Mais detalhes em instantes.']);
 assert.equal(splitMaviSpeech('Olá,').sentences.length,0);
});
test('NVIDIA SSE produces incremental spoken sentences without JSON intent or personal GPS',async()=>{
 const heard=[];
 const answer=await streamMaviTalk('Como você está?',[
  {role:'user',text:'Oi'}, {role:'assistant',text:'Estou pronta.'}
 ],{config:cfg,now:()=>Date.now()+7200000,
  onSentence:s=>heard.push(s),
  fetcher:async(_url,init)=>{
   const request=JSON.parse(init.body);
   assert.equal(request.stream,true);
   assert.equal(request.temperature,0.15);
   assert.deepEqual(request.messages.map(m=>m.role),['system','user','assistant','user']);
   assert.ok(!init.body.includes('GPS_COORD_SECRET'));
   return upstream(['Estou bem e pronta para ajudar. ','O que você precisa agora?']);
  }
 });
 assert.equal(answer.error,'');
 assert.equal(heard.length,2);
 assert.match(heard[0],/Estou bem/);
 assert.match(answer.text,/O que você precisa/);
});
test('cancelled conversational generation stops without fallback speech',async()=>{
 const controller=new AbortController();
 const result=streamMaviTalk('Mavi, posso conversar?',[],{
  config:cfg,signal:controller.signal,now:()=>Date.now()+14400000,
  fetcher:async(_url,init)=>new Promise((_res,rej)=>{
   init.signal.addEventListener('abort',()=>rej(new Error('cancelled')),{once:true});
   queueMicrotask(()=>controller.abort());
  })
 });
 assert.equal((await result).error,'cancelled');
});
