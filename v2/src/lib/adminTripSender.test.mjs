import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminTripSender} from './adminTripSender.mjs';

test('tracking sends the first fix and never waits for network',async()=>{
 let resolve;const calls=[];
 const sender=createAdminTripSender({interval:0,random:{getRandomValues:b=>b.fill(1)},post:(path,body)=>{calls.push({path,body});if(path.endsWith('update'))return new Promise(r=>{resolve=r;});}});
 sender.add({coords:[0,0],accuracy:5,timestamp:1000});
 await Promise.resolve();assert.equal(calls.length,1);
 sender.add({coords:[0,0.0003],accuracy:5,timestamp:4000});
 sender.stop();resolve();
 await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(calls.map(c=>c.path),['/live-navigation/update','/live-navigation/stop']);
});

test('limits route detail while preserving the endpoints',async()=>{
 const calls=[],sender=createAdminTripSender({random:{getRandomValues:b=>b.fill(2)},post:(path,body)=>calls.push({path,body})});
 const coordinates=Array.from({length:300},(_,i)=>[i/1000,0]);
 sender.setRoute({type:'LineString',coordinates});
 sender.add({coords:[0,0],accuracy:5,timestamp:1000});
 await Promise.resolve();
 assert.equal(calls[0].body.route.length,160);
 assert.deepEqual(calls[0].body.route.at(0),coordinates.at(0));
 assert.deepEqual(calls[0].body.route.at(-1),coordinates.at(-1));
 sender.stop();
});
