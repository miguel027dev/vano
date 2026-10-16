import test from 'node:test';
import assert from 'node:assert/strict';
import {shareV1Work} from './v1-singleflight.mjs';
test('coalesces simultaneous identical requests, without retaining completed routes',async()=>{
 let count=0;const fetcher=async()=>{};
 const args=['http://localhost:5000',[-46,-23],[-46.1,-23.1],'carro',{},{}];
 const compute=async()=>{count++;await Promise.resolve();return {routes:[{duration:10}]};};
 const [a,b]=await Promise.all([shareV1Work(compute,args,fetcher),shareV1Work(compute,args,fetcher)]);
 assert.equal(count,1);
 assert.notEqual(a,b);
 a.routes[0].duration=100;
 assert.equal(b.routes[0].duration,10);
 await shareV1Work(compute,args,fetcher);
 assert.equal(count,2);
});
test('GPS reroutes never coalesce',async()=>{
 let count=0;const fetcher=async()=>{};
 const args=['https://example.org',[1,2],[3,4],'carro',{}, {reroute:true}];
 await Promise.all([shareV1Work(async()=>{count++;return {ok:true}},args,fetcher),
  shareV1Work(async()=>{count++;return {ok:true}},args,fetcher)]);
 assert.equal(count,2);
});
test('failed in-flight calculation gets removed',async()=>{
 let count=0;const fetcher=async()=>{};
 const args=['https://example.org',[1,2],[3,4],'moto',{},{}];
 await assert.rejects(()=>shareV1Work(async()=>{count++;throw Error('offline')},args,fetcher));
 const success=await shareV1Work(async()=>{count++;return {routes:[]}},args,fetcher);
 assert.equal(count,2);
 assert.deepEqual(success,{routes:[]});
});
