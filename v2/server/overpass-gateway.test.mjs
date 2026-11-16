import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverpassGateway} from './overpass-gateway.mjs';
const hosts=['https://primary.example/api','https://backup.example/api'];
const good=()=>({ok:true,json:async()=>({elements:[]})});
test('backup succeeds without waiting for a hung primary and cancels loser',async()=>{
 let aborted=false;
 const gateway=createOverpassGateway({hedgeMs:5,timeoutMs:200,log:()=>{},fetcher:async(url,{signal})=>{
  if(url===hosts[1])return good();
  return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}));
 }});
 assert.deepEqual(await gateway.query(hosts,'query'),[]);
 assert.equal(aborted,true);
});
test('provider circuits skip failing hosts across viewports and exponentially back off',async()=>{
 let clock=1,calls=0;
 const gateway=createOverpassGateway({now:()=>clock,hedgeMs:1,cooldownMs:100,maxCooldownMs:400,log:()=>{},fetcher:async()=>{calls++;throw Error('offline');}});
 await assert.rejects(gateway.query(hosts,'region A'));assert.equal(calls,2);
 await assert.rejects(gateway.query(hosts,'region B'));assert.equal(calls,2);
 clock+=101;await assert.rejects(gateway.query(hosts,'region C'));assert.equal(calls,4);
 clock+=101;await assert.rejects(gateway.query(hosts,'region D'));assert.equal(calls,4);
 clock+=100;await assert.rejects(gateway.query(hosts,'region E'));assert.equal(calls,6);
});
test('deadline aborts both attempts within one budget',async()=>{
 let calls=0;
 const gateway=createOverpassGateway({timeoutMs:40,hedgeMs:5,log:()=>{},fetcher:async(url,{signal})=>{
  calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('deadline')),{once:true}));
 }});
 const start=Date.now();await assert.rejects(gateway.query(hosts,'query'));
 assert.equal(calls,2);assert.ok(Date.now()-start<200);
});
test('incomplete Overpass responses are rejected, recovery closes the circuit',async()=>{
 let clock=1,healthy=false,calls=0;
 const gateway=createOverpassGateway({now:()=>clock,hedgeMs:1,cooldownMs:10,log:()=>{},fetcher:async()=>{
  calls++;return {ok:true,json:async()=>healthy?{elements:[]}:{elements:[],remark:'runtime timeout'}};
 }});
 await assert.rejects(gateway.query([hosts[0]],'query'));
 clock+=11;healthy=true;assert.deepEqual(await gateway.query([hosts[0]],'query'),[]);
 assert.deepEqual(await gateway.query([hosts[0]],'query'),[]);assert.equal(calls,3);
});
