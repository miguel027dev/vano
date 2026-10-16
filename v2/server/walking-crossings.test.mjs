import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOsmCrossing,walkingCrossingsFromOsm,findWalkingCrossings} from './walking-crossings.mjs';
const a=[-46.69,-23.59],b=[-46.688,-23.59];
const geometry={type:'LineString',coordinates:[a,b]};
const node=(id,lng,lat,tags)=>({type:'node',id,lon:lng,lat,tags});
test('only explicit OSM crossing evidence yields labelled facilities',()=>{
 assert.equal(classifyOsmCrossing({highway:'crossing'}),null);
 assert.equal(classifyOsmCrossing({highway:'crossing',crossing:'unmarked'}),null);
 assert.equal(classifyOsmCrossing({highway:'crossing',crossing:'marked'}).type,'marked');
 assert.equal(classifyOsmCrossing({highway:'crossing',crossing:'traffic_signals'}).type,'signals');
 assert.equal(classifyOsmCrossing({highway:'traffic_signals',crossing:'marked'}),null);
});
test('nearby crosswalk is annotated only if near geometry and not at unrelated parallel road',()=>{
 const features=walkingCrossingsFromOsm(geometry,[
  node(1,-46.689,-23.59,{highway:'crossing',crossing:'marked'}),
  node(2,-46.68899,-23.59,{highway:'crossing',crossing:'marked'}),
  node(3,-46.689,-23.5897,{highway:'crossing',crossing:'traffic_signals'}),
  node(4,-46.6887,-23.59,{highway:'crossing',crossing:'unmarked'})
 ]);
 assert.equal(features.length,1);
 assert.equal(features[0].source,'OpenStreetMap');
 assert.equal(features[0].id,'osm-crossing-1');
 assert.ok(features[0].routeMeters>50);
 assert.ok(features[0].distanceFromRouteMeters<2);
});
test('third-party outages are ignored; API bounds the geographic area and caches rows',async()=>{
 let count=0;
 const sample=node(122,-46.689,-23.59,{highway:'crossing',crossing:'marked'});
 const fetcher=async(url,init)=>{
  count++;
  assert.equal(new URL(url).hostname,'overpass-api.de');
  assert.equal(init.method,'POST');
  assert.match(init.body.get('data'),/highway/);
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({elements:[sample]})};
 };
 const first=await findWalkingCrossings(geometry,{fetcher});
 const second=await findWalkingCrossings(geometry,{fetcher});
 assert.equal(first.length,1);assert.equal(second.length,1);assert.equal(count,1);
 assert.deepEqual(await findWalkingCrossings(geometry,{enabled:false,fetcher}),[]);
 assert.deepEqual(await findWalkingCrossings({coordinates:[[0,0],[90,90]]},{fetcher}),[]);
 assert.deepEqual(await findWalkingCrossings({coordinates:[a,b]},{fetcher:()=>{throw Error('down');},now:()=>Date.now()+1e8}),[]);
});
