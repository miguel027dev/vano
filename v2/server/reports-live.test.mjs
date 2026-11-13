import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createReportStreamHub,pointInsideBBox} from './reports-live.mjs';

function fakeStream(){
  const res=new EventEmitter();
  res.chunks=[];res.destroyed=false;res.writableEnded=false;
  res.writeHead=(code,headers)=>{res.status=code;res.headers=headers;};
  res.write=chunk=>{res.chunks.push(chunk);return true;};
  return res;
}
test('SSE tells only nearby clients to refetch, without leaking private data',()=>{
  const hub=createReportStreamHub({capacity:2,heartbeatMs:100000});
  const reqA=new EventEmitter(),reqB=new EventEmitter(),reqC=new EventEmitter();
  const a=fakeStream(),b=fakeStream(),c=fakeStream();
  assert.equal(hub.subscribe(reqA,a,[-46.7,-23.6,-46.6,-23.5]),true);
  assert.equal(hub.subscribe(reqB,b,[0,0,1,1]),true);
  assert.equal(hub.subscribe(reqC,c,[0,0,1,1]),false);
  const sent=hub.publish({coords:[-46.65,-23.55],owner:'secret-account',description:'Private'});
  assert.equal(sent,1);
  assert.match(a.chunks.join(''),/event: reports-changed/);
  assert.doesNotMatch(a.chunks.join(''),/secret-account|Private|-46\.65/);
  assert.doesNotMatch(b.chunks.join(''),/reports-changed/);
  a.emit('close');b.emit('close');
  assert.equal(hub.subscriberCount(),0);
});
test('report updates match geographic bounding boxes precisely',()=>{
  assert.equal(pointInsideBBox([-46.6,-23.55],[-46.7,-23.6,-46.6,-23.5]),true);
  assert.equal(pointInsideBBox([20,0],[-46.7,-23.6,-46.6,-23.5]),false);
  assert.equal(pointInsideBBox([NaN,0],[0,-1,1,1]),false);
});


test('SSE enforces active streams per client and frees the slot on disconnect',()=>{
  const hub=createReportStreamHub({capacity:5,maxPerClient:2,heartbeatMs:100000,maxLifetimeMs:100000});
  const a=fakeStream(),b=fakeStream(),c=fakeStream(),d=fakeStream();
  const bbox=[-47,-24,-46,-23];
  assert.equal(hub.subscribe(new EventEmitter(),a,bbox,{},'client-a'),true);
  assert.equal(hub.subscribe(new EventEmitter(),b,bbox,{},'client-a'),true);
  assert.equal(hub.subscribe(new EventEmitter(),c,bbox,{},'client-a'),false);
  assert.equal(hub.subscribe(new EventEmitter(),d,bbox,{},'client-b'),true);
  a.emit('close');
  assert.equal(hub.subscribe(new EventEmitter(),c,bbox,{},'client-a'),true);
  b.emit('close');c.emit('close');d.emit('close');
  assert.equal(hub.subscriberCount(),0);
});


test('admin report purge invalidates ALL subscribed regions without disclosing removed reports',()=>{
 const hub=createReportStreamHub({capacity:5,heartbeatMs:100000});
 const reqA=new EventEmitter(),reqB=new EventEmitter();
 const a=fakeStream(),b=fakeStream();
 assert.equal(hub.subscribe(reqA,a,[-47,-24,-46,-23]),true);
 assert.equal(hub.subscribe(reqB,b,[10,10,11,11]),true);
 assert.equal(hub.publishAll(),2);
 for(const client of [a,b]){
  assert.match(client.chunks.join(''),/event: reports-changed\ndata: \{\}\n\n/);
  assert.doesNotMatch(client.chunks.join(''),/owner|coords|description|private/i);
 }
 a.emit('close');b.emit('close');
 assert.equal(hub.publishAll(),0);
});
