import test from 'node:test';
import assert from 'node:assert/strict';
import {readMaviTalkStream} from './maviTalkStream.mjs';
const encoder=new TextEncoder();
function stream(parts){
 return new ReadableStream({start(c){for(const s of parts)c.enqueue(encoder.encode(s));c.close();}});
}
test('NDJSON frames split across transport chunks are played in order',async()=>{
 const input=stream(['{"type":"ch','unk","text":"Olá","voiceTicket":"123"}\n{"type":"',
 'chunk","text":" Mundo!"}\n{"type":"done","text":"Olá Mundo!"}\n']);
 const items=[];for await(const part of readMaviTalkStream(input))items.push(part);
 assert.deepEqual(items,[{type:'chunk',text:'Olá',voiceTicket:'123'},
  {type:'chunk',text:' Mundo!',voiceTicket:null},{type:'done',text:'Olá Mundo!',fallback:false}]);
});
test('malformed and truncated streams are rejected, not silently accepted',async()=>{
 for(const parts of [['broken\n'],['{"type":"chunk","text":"Opa"}\n']]){
  await assert.rejects(async()=>{for await(const item of readMaviTalkStream(stream(parts)))void item;});
 }
});
test('client limits excessively large streams',async()=>{
 await assert.rejects(async()=>{for await(const item of readMaviTalkStream(stream(['a'.repeat(200)]),{maxBytes:100}))void item;});
});
