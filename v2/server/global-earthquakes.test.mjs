import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsgsEarthquakes,createSeismicGateway} from './global-earthquakes.mjs';

const fakeEarthquakes={features:[
 {id:'a',geometry:{type:'Point',coordinates:[-46.6,-23.5,11]},properties:{title:'M 4.0 - SP',mag:4,time:1792100000000}},
 {id:'b',geometry:{type:'Point',coordinates:[2.35,48.85]},properties:{title:'Europe',mag:3,time:1792100000000}},
 {id:'out',geometry:{type:'Point',coordinates:[200,2]},properties:{title:'Wrong'}}
]};
test('USGS returns finite real map coordinates and informative-only records',()=>{
 const result=normalizeUsgsEarthquakes(fakeEarthquakes);
 assert.equal(result.length,2);
 assert.deepEqual(result[0].coords,[-46.6,-23.5]);
 assert.equal(result[0].routingVerified,false);
 assert.equal(result[0].source,'USGS');
});
test('USGS never blocks cold map response, deduplicates, honors bbox and caches',async()=>{
 let resolve;
 const deferred=new Promise(r=>resolve=r);
 let calls=0,clock=100_000;
 const gateway=createSeismicGateway({clock:()=>clock,fetcher:async()=>{calls++;await deferred;
  return new Response(JSON.stringify(fakeEarthquakes));}});
 const bbox=[-46.7,-23.6,-46.5,-23.4];
 const start=performance.now();
 const initial=gateway(bbox);
 assert.ok(performance.now()-start<20);
 assert.equal(initial.events.length,0);
 assert.equal(initial.source.status,'loading');
 gateway(bbox);gateway(bbox);
 await Promise.resolve();
 assert.equal(calls,1);
 resolve();
 await new Promise(setImmediate);
 const ready=gateway(bbox);
 assert.equal(ready.events.length,1);
 assert.equal(ready.events[0].id,'usgs-a');
 assert.equal(ready.source.status,'fresh');
 clock+=100_000;
 const stale=gateway(bbox);
 assert.equal(stale.events.length,1);
 assert.equal(stale.source.status,'stale');
});
test('provider failure is fail-open and never returns an invented blockage',async()=>{
 const gateway=createSeismicGateway({clock:()=>400_000,fetcher:async()=>{throw Error('offline');}});
 const initial=gateway([-1,-1,1,1]);assert.equal(initial.events.length,0);
 await new Promise(setImmediate);
 const after=gateway([-1,-1,1,1]);assert.equal(after.events.length,0);
 assert.equal(after.source.status,'unavailable');
});
