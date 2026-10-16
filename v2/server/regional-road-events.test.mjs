import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseRegionalRoadBBox,normalizeTflRoadEvents,normalizeDriveBcRoadEvents,
 normalizeFintrafficRoadEvents,createKeylessRegionalGateway,KEYLESS_ROAD_SOURCES
} from './regional-road-events.mjs';

const london=[-.25,51.4,.05,51.6];
const bc=[-123.3,49,-123,49.4];
const finland=[24.7,60,25.1,60.4];
const tfl=[{id:'TIMS-10',status:'Active',category:'Works',geography:{type:'Point',coordinates:[-.1,51.5]},
 comments:'Repair work',lastModifiedTime:'2026-10-16T12:00:00Z'},
 {id:'TIMS-11',status:'Active',category:'Collision',geography:{type:'Point',coordinates:[-.12,51.51]},
 comments:'Incident reported'},
 {id:'TIMS-12',status:'Active',category:'Works',geography:{type:'Point',coordinates:[-3,51.5]}}];
test('country source registry is public and routing-neutral',()=>{
 assert.equal(KEYLESS_ROAD_SOURCES.length,4);
 assert.ok(KEYLESS_ROAD_SOURCES.every(s=>!s.keyRequired&&s.routingImpact==='none'));
});
test('invalid geographic bounds cannot reach upstream providers',()=>{
 for(const value of ['',',,,','0,0,200,40','-100,50,-101,51','-1,0,2,2'])
  assert.equal(parseRegionalRoadBBox(value),null);
 assert.deepEqual(parseRegionalRoadBBox('-.2,51.3,.1,51.6'),[-.2,51.3,.1,51.6]);
});
test('TfL work markers and incidents need real point geometry and current status',()=>{
 const got=normalizeTflRoadEvents(tfl,london,Date.parse('2026-10-16T14:00:00Z'));
 assert.equal(got.length,2);
 assert.equal(got[0].type,'obra');
 assert.equal(got[1].type,'alerta-via');
 assert.ok(got.every(x=>x.routingVerified===false&&x.regional===true));
});
test('DriveBC extracts real nested geometry and rejects planned or archived events',()=>{
 const data={events:[
  {id:'bc/1',status:'ACTIVE',event_type:'CONSTRUCTION',headline:'Lane work',
   created:'2026-10-15T12:00:00Z',geography:{type:'Point',coordinates:[[-123.15,49.25]]}},
  {id:'bc/2',status:'ARCHIVED',event_type:'INCIDENT',geography:{type:'Point',coordinates:[-123.14,49.25]}},
  {id:'bc/3',status:'ACTIVE',event_type:'CONSTRUCTION',geography:{type:'Point',coordinates:[-120,50]}}
 ]};
 const got=normalizeDriveBcRoadEvents(data,bc,Date.parse('2026-10-16T12:00:00Z'));
 assert.equal(got.length,1);
 assert.equal(got[0].type,'obra');
 assert.deepEqual(got[0].coords,[-123.15,49.25]);
});
test('Fintraffic only displays events with mappable real geometry',()=>{
 const f={features:[
  {properties:{situationId:'fi1',situationType:'ROAD_WORK',announcements:[{language:'FI',title:'Tietöitä'}]},
   geometry:{type:'Point',coordinates:[24.95,60.17]}},
  {properties:{situationId:'fi2',situationType:'ROAD_WORK'},geometry:null}
 ]};
 const got=normalizeFintrafficRoadEvents(f,finland);
 assert.equal(got.length,1);assert.equal(got[0].type,'obra');
});
test('regional provider selects only local country; no calls from Brazil',async()=>{
 let calls=0;
 const gateway=createKeylessRegionalGateway({fetcher:async()=>{calls++;return new Response('[]')}});
 const data=gateway.snapshot([-46.7,-23.6,-46.6,-23.5]);
 assert.deepEqual(data.sources,[]);
 assert.deepEqual(data.features,[]);
 assert.equal(data.affectsRouting,false);
 await new Promise(setImmediate);
 assert.equal(calls,0);
});
test('cold regional response is nonblocking, then serves cached event without another network request',async()=>{
 let resolveFetch,requests=0;
 const gate=new Promise(resolve=>{resolveFetch=resolve});
 const gateway=createKeylessRegionalGateway({
  fetcher:async()=>{requests++;await gate;return new Response(JSON.stringify(tfl),{status:200})}
 });
 const started=performance.now(),cold=gateway.snapshot(london);
 assert.ok(performance.now()-started<35);
 assert.equal(cold.sources.length,1);
 assert.equal(cold.sources[0].status,'loading');
 assert.deepEqual(cold.features,[]);
 await Promise.resolve();
 assert.equal(requests,1);
 resolveFetch();
 await new Promise(setImmediate);
 const ready=gateway.snapshot(london);
 assert.equal(ready.features.length,2);
 assert.equal(ready.sources[0].status,'fresh');
 assert.equal(requests,1);
});
test('failed provider never blocks a regional map or makes fake closures',async()=>{
 const gateway=createKeylessRegionalGateway({
  fetcher:async()=>{throw Error('offline')}
 });
 const first=gateway.snapshot(london);
 assert.equal(first.affectsRouting,false);
 assert.deepEqual(first.features,[]);
 await new Promise(setImmediate);
 const failure=gateway.snapshot(london);
 assert.equal(failure.sources[0].status,'unavailable');
 assert.deepEqual(failure.features,[]);
});
