import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sanitizeObservabilityBatch} from './observability-policy.mjs';
const now=Date.now();
const batch=()=>({consent:true,installation:randomUUID(),session:randomUUID(),events:[{id:randomUUID(),name:'route_request',version:'3.1.8',timestamp:now,params:{duration_ms:100,status:200,kind:'route',latitude:-23.55,url:'https://private',name:'Miguel',email:'private@example.com'}}]});
test('event schema strips PII, GPS, URL, arbitrary labels and hashes identifiers',()=>{
 const body=batch(),result=sanitizeObservabilityBatch(body,'secret',now);
 assert.deepEqual(result[0].params,{duration_ms:100,status:200,kind:'route'});
 assert.equal(result[0].subject.length,64);assert.ok(!JSON.stringify(result).includes(body.installation));
 assert.equal(result[0].occurredAt,new Date(now).toISOString());
});
test('consent, bounded batch, valid clock and known custom events are mandatory',()=>{
 for(const mutate of [b=>b.consent=false,b=>b.events[0].name='first_open',b=>b.events[0].name='session_start',b=>b.events[0].timestamp=now+400000,b=>b.events[0].timestamp=0,b=>b.events=Array(21).fill(b.events[0]),b=>b.installation='user@example.com']){
  const body=batch();mutate(body);assert.throws(()=>sanitizeObservabilityBatch(body,'secret',now));
 }
});
test('unbounded durations and text labels cannot be stored',()=>{
 const body=batch();body.events[0].params={duration_ms:Infinity,kind:'Rua privada 123',status:600};
 assert.deepEqual(sanitizeObservabilityBatch(body,'secret',now)[0].params,{});
});
