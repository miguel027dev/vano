import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminTripSender} from './adminTripSender.mjs';

test('tracking sends only after threshold and never waits for network',async()=>{
 let resolve;const calls=[];
 const sender=createAdminTripSender({interval:0,random:{getRandomValues:b=>b.fill(1)},post:(path,body)=>{calls.push({path,body});if(path.endsWith('update'))return new Promise(r=>{resolve=r;});}});
 sender.add({coords:[0,0],accuracy:5,timestamp:1000});
 sender.add({coords:[0,0.0001],accuracy:5,timestamp:2000});
 await Promise.resolve();assert.equal(calls.length,0);
 sender.add({coords:[0,0.0002],accuracy:5,timestamp:3000});
 await Promise.resolve();assert.equal(calls.length,1);
 sender.add({coords:[0,0.0003],accuracy:5,timestamp:4000});
 sender.stop();resolve();
 await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(calls.map(c=>c.path),['/live-navigation/update','/live-navigation/stop']);
});
