import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRouteTrafficRequest,normalizeRouteFlow,createRouteTrafficGateway} from './route-traffic.mjs';
const coords=Array.from({length:30},(_,i)=>[-46.75+i*.0005,-23.58]);
const request=()=>parseRouteTrafficRequest({geometry:{type:'LineString',coordinates:coords},vehicle:'carro'});
const raw=points=>({flowSegmentData:{currentSpeed:0,freeFlowSpeed:50,confidence:.95,roadClosure:false,
 coordinates:{coordinate:points.map(([longitude,latitude])=>({longitude,latitude}))}}});
test('route requests bound geometry, distance, vehicle and malformed values',()=>{
 assert.ok(request());assert.equal(parseRouteTrafficRequest({geometry:request().geometry,vehicle:'a-pe'}),null);
 assert.equal(parseRouteTrafficRequest({geometry:request().geometry,vehicle:'carro',fromMeters:Infinity}),null);
 assert.equal(parseRouteTrafficRequest({geometry:request().geometry,vehicle:'carro',fromMeters:-1}),null);
 assert.equal(parseRouteTrafficRequest({geometry:{type:'LineString',coordinates:Array(701).fill(coords[0])},vehicle:'carro'}),null);
});
test('zero flow is accepted, provider road direction and location are enforced',()=>{
 const r=request(),reading=normalizeRouteFlow(raw(coords.slice(3,10)),r.index,coords[5],123);
 assert.equal(reading.currentKmh,0);assert.equal(reading.observedAt,123);
 assert.equal(normalizeRouteFlow(raw(coords.slice(3,10).reverse()),r.index,coords[5],123),null);
 const weak=raw(coords.slice(3,10));weak.flowSegmentData.confidence=.2;
 assert.equal(normalizeRouteFlow(weak,r.index,coords[5],123),null);
});
test('provider requests are bounded, cached, redacted and never adjust ETA',async()=>{
 let calls=0,active=0,maxActive=0;
 const gateway=createRouteTrafficGateway({clock:()=>1800000000000,fetcher:async(url)=>{
  calls++;active++;maxActive=Math.max(maxActive,active);
  const u=new URL(url),[lat,lon]=u.searchParams.get('point').split(',').map(Number);
  assert.equal(u.searchParams.get('key'),'test-route-secret');assert.equal(u.hostname,'api.tomtom.com');
  const nearest=Math.min(coords.length-3,Math.max(2,Math.round((lon-coords[0][0])/.0005)));
  assert.ok(Math.abs(lat+23.58)<.00001);await Promise.resolve();active--;
  return new Response(JSON.stringify(raw(coords.slice(nearest-1,nearest+2))),{status:200});
 }});
 const first=await gateway.snapshot(request(),'test-route-secret');
 assert.ok(calls>0&&calls<=8);assert.ok(maxActive<=2);assert.ok(first.flow.length>0);
 assert.equal(first.affectsEta,false);assert.doesNotMatch(JSON.stringify(first),/test-route-secret/);
 const previous=calls;await gateway.snapshot(request(),'test-route-secret');assert.equal(calls,previous);
 const absent=await gateway.snapshot(request(),'');assert.equal(absent.status,'unconfigured');assert.equal(calls,previous);
});
test('provider permission failure opens a cooldown and never invents flow',async()=>{
 let calls=0;const gateway=createRouteTrafficGateway({clock:()=>1800000000000,fetcher:async()=>{calls++;return new Response('',{status:403});}});
 const result=await gateway.snapshot(request(),'test-key');assert.equal(result.status,'unavailable');
 assert.equal(result.flow.length,0);assert.ok(calls<=2);
 await gateway.snapshot(request(),'test-key');assert.ok(calls<=2);
});
