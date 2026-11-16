import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetryClient,cleanParams} from './telemetryClient.mjs';
const make=(send=async()=>{})=>{
 let next=0;const native=[];
 const c=createTelemetryClient({send,host:x=>native.push(x),id:()=>String(++next),clock:()=>Date.parse('2026-11-16T12:00:00Z'),timer:()=>1,cancel:()=>{}});
 return {c,native};
};
test('collection stays off without explicit consent and drops identifying input',()=>{
 const {c,native}=make();assert.equal(c.record('route_requested'),false);assert.equal(native.length,0);
 c.consent(true);c.record('navigation_started',{vehicle:'moto',coords:[0,0],email:'private',error_code:'private'});
 assert.deepEqual(native[1].params,{vehicle:'moto'});
 assert.deepEqual(cleanParams({status_code:999,duration_ms:NaN,address:'private'}),{});
 c.consent(false);assert.equal(c.stats().queued,0);assert.equal(c.record('route_requested'),false);
});
test('delivery retries retain IDs but do not duplicate the native Firebase event',async()=>{
 const calls=[];let fail=true;const {c,native}=make(async batch=>{calls.push(batch);if(fail)throw Error('offline');});
 c.consent(true);c.record('route_requested');await c.flush();fail=false;await c.flush();
 assert.deepEqual(calls[0],calls[1]);assert.equal(native.filter(x=>x.action==='telemetry').length,1);assert.equal(c.stats().queued,0);
});
test('revocation while a request is in flight cannot re-enable collection',async()=>{
 let done;const {c}=make(()=>new Promise(resolve=>{done=resolve;}));
 c.consent(true);c.record('route_requested');const pending=c.flush();c.consent(false);done();await pending;
 assert.deepEqual(c.stats(),{allowed:false,queued:0,dropped:0});
});
test('errors are cooled down, automatic events rejected and delivery attempts bounded',async()=>{
 const {c}=make(async()=>{throw Error('offline');});c.consent(true);
 assert.equal(c.record('first_open'),false);assert.equal(c.record('session_start'),false);
 c.record('map_load_failed');assert.equal(c.record('map_load_failed'),false);
 for(let i=0;i<6;i++)await c.flush();assert.equal(c.stats().queued,0);assert.equal(c.stats().dropped,1);
});
test('consent revalidation preserves pending events and session identity',()=>{
 const {c,native}=make();c.consent(true);c.record('route_requested');
 const session=native[1].event_id;c.consent(true);
 assert.equal(c.stats().queued,1);assert.equal(native.length,2);assert.equal(native[1].event_id,session);
});
