import test from 'node:test';
import assert from 'node:assert/strict';
import {maviInstantAnswer,MAVI_FAST_OPENING_INTENTS} from './mavi-instant.mjs';

test('opening MAVI phrases are short, grounded and varied without a hosted model',()=>{
 for(const intent of ['greeting','help','identity','about','thanks']){
  assert.ok(MAVI_FAST_OPENING_INTENTS.has(intent));
  const first=maviInstantAnswer(intent,()=>0);
  const second=maviInstantAnswer(intent,()=>0.55);
  const third=maviInstantAnswer(intent,()=>0.99);
  assert.equal(typeof first,'string');
  assert.ok(first.length>20&&first.length<450,intent);
  assert.notEqual(first,second);
  assert.notEqual(second,third);
 }
 assert.equal(maviInstantAnswer('arrival'),null);
 assert.equal(maviInstantAnswer('traffic_info'),null);
 assert.equal(maviInstantAnswer('fast_route'),null);
});
test('opening messages neither assert location nor promise actions without consent',()=>{
 for(const intent of MAVI_FAST_OPENING_INTENTS){
  for(const sample of [0.01,0.4,0.95]){
   const reply=maviInstantAnswer(intent,()=>sample);
   assert.doesNotMatch(reply,/sua localização atual é|sua rota já foi alterada|acidente confirmado/i);
  }
 }
});
