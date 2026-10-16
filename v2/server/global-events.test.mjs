import test from 'node:test';
import assert from 'node:assert/strict';
import {createGlobalEventGateway,parseGlobalEventFeed,parseGlobalEventQuery,GLOBAL_EVENT_SOURCES} from './global-events.mjs';

test('international providers remain advisory-only',()=>{
 assert.deepEqual(GLOBAL_EVENT_SOURCES.map(x=>x.id),['nasa-eonet','usgs-earthquakes']);
 assert.ok(GLOBAL_EVENT_SOURCES.every(x=>x.routeImpact==='none'));
});
test('queries reject invalid GPS and expensive radii',()=>{
 const make=q=>parseGlobalEventQuery(new URLSearchParams(q));
 assert.equal(make('lat=NaN&lon=20'),null);
 assert.equal(make('lat=0&lon=182'),null);
 assert.equal(make('lat=-23.5&lon=-46.6&radius_km=500'),null);
 assert.deepEqual(make('lat=-23.5&lon=-46.6'),{lat:-23.5,lon:-46.6,radiusKm:100});
});
test('NASA locations with polygon-only geometry never become precise pins',()=>{
 const items=parseGlobalEventFeed('nasa-eonet',{events:[
  {id:'a',title:'<incêndio>',geometry:[{type:'Polygon',coordinates:[[[1,2]]]},
    {type:'Point',coordinates:[-46.6,-23.5],date:'2026-10-16'}],categories:[{id:'wildfires'}]},
  {id:'b',geometry:[{type:'Polygon',coordinates:[]}]},
  {id:'c',closed:'2026-01-01',geometry:[{type:'Point',coordinates:[0,0]}]}
 ]});
 assert.equal(items.length,1);
 assert.equal(items[0].name,'incêndio');
 assert.equal(items[0].routeImpact,'none');
 assert.deepEqual(items[0].coords,[-46.6,-23.5]);
});
test('USGS normalization only accepts bounded point geometry',()=>{
 const items=parseGlobalEventFeed('usgs-earthquakes',{features:[
  {id:'q',geometry:{type:'Point',coordinates:[-46.6,-23.5,5]},
    properties:{mag:4.8,title:'Quake',time:1792180000000}},
  {id:'r',geometry:{type:'Point',coordinates:[190,0]},properties:{mag:9}}
 ]});
 assert.equal(items.length,1);assert.equal(items[0].magnitude,4.8);
});
test('cold queries are nonblocking, singleflight and geo-filtered',async()=>{
 let resolveFetch,called=0,time=100_000;
 const gate=new Promise(resolve=>{resolveFetch=resolve;});
 const gateway=createGlobalEventGateway({
  now:()=>time,
  fetcher:async url=>{
   called++;await gate;
   if(url.includes('eonet'))return new Response(JSON.stringify({events:[
    {id:'one',title:'Evento',geometry:[{type:'Point',coordinates:[-46.6,-23.5]}]},
    {id:'far',title:'Fora',geometry:[{type:'Point',coordinates:[2,48]}]}
   ]}));
   return new Response(JSON.stringify({features:[]}));
  }
 });
 const t=performance.now(),first=gateway.query({lat:-23.5,lon:-46.6,radiusKm:25});
 assert.ok(performance.now()-t<30);
 assert.equal(first.events.length,0);assert.equal(first.routeImpact,'none');
 for(let i=0;i<7;i++)gateway.query({lat:-23.5,lon:-46.6,radiusKm:25});
 await Promise.resolve();
 assert.equal(called,2,'one request per provider');
 resolveFetch();await new Promise(setImmediate);
 const second=gateway.query({lat:-23.5,lon:-46.6,radiusKm:25});
 assert.equal(second.events.length,1);assert.equal(second.events[0].id,'eonet:one');
 assert.ok(second.sources.every(s=>s.status==='fresh'));
 time+=700_000;gateway.query({lat:-23.5,lon:-46.6,radiusKm:25});
 const stale=gateway.query({lat:-23.5,lon:-46.6,radiusKm:25});
 assert.equal(stale.events.length,1);
 assert.ok(stale.sources.some(s=>s.status==='stale'));
});
test('provider outages fail open without touching route engine',async()=>{
 const gateway=createGlobalEventGateway({
  fetcher:async()=>new Response('',{status:503})
 });
 const a=gateway.query({lat:0,lon:0,radiusKm:100});
 assert.equal(a.routeImpact,'none');
 await new Promise(setImmediate);
 const b=gateway.query({lat:0,lon:0,radiusKm:100});
 assert.equal(b.events.length,0);
 assert.ok(b.sources.every(s=>s.status==='unavailable'));
});
