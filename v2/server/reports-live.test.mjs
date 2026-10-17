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
