import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseWorldCameraCsv,parseUkCameraJson,resetWorldRadarCatalogForTests,
 queryWorldRadarCatalog,WORLD_CAMERA_EXPORT,UK_CAMERA_EXPORT
} from './world-radar-catalog.mjs';
import {queryPublicRadars} from './map-radars.mjs';

const london=[-.119,51.509],milan=[9.19,45.46],istanbul=[28.97,41.01];
const around=([x,y])=>[x-.12,y-.10,x+.12,y+.10];
function fixtures(){
 const lines=['osm_id,country_code,latitude,longitude,maxspeed'];
 lines.push('1,GB,51.509,-0.119,30 mph');
 lines.push('2,IT,45.46,9.19,50');
 lines.push('3,TR,41.01,28.97,70');
 for(let i=0;i<1105;i++)lines.push((i+100)+',GB,52.50,'+(-1.5+i*.00005)+',50');
 const world=lines.join('\n');
 const uk={cameras:[
  {id:1,lat:51.509,lon:-.119,maxspeed:'30 mph'},
  ...Array.from({length:310},(_,i)=>({id:i+5000,lat:53.4+i*.00006,lon:-1.1,maxspeed:40}))
 ]};
 return {world,uk};
}
test('world CSV validates coordinate headers and preserves recorded limits without inventing locations',()=>{
 const parsed=parseWorldCameraCsv('osm_id,country_code,latitude,longitude,maxspeed\n123,GB,51.509,-.119,30 mph\n124,GB,,,.\n125,BR,-23.55,-46.63,50');
 assert.equal(parsed.length,2);
 assert.deepEqual([parsed[0].lon,parsed[0].lat],london);
 assert.equal(parsed[0].speed,'30 mph');
 assert.equal(parsed[0].country,'GB');
 assert.throws(()=>parseWorldCameraCsv('name,address\nno,coordinates'),/missing coordinates/);
 const uk=parseUkCameraJson({type:'FeatureCollection',features:[
  {id:51,type:'Feature',geometry:{type:'Point',coordinates:london},properties:{maxspeed:30}},
  {id:52,type:'Feature',geometry:{type:'Point',coordinates:[999,999]},properties:{}}
 ]});
 assert.equal(uk.length,1);
});
test('world and UK catalog snapshots serve London Milan Istanbul without per-pan external calls',async()=>{
 resetWorldRadarCatalogForTests();
 const {world,uk}=fixtures(),requests=[];
 const fetcher=async url=>{
  requests.push(url);
  return {ok:true,headers:{get:()=>null},text:async()=>url===WORLD_CAMERA_EXPORT?world:JSON.stringify(uk)};
 };
 const opts={fetcher,now:()=>1000000};
 const a=await queryWorldRadarCatalog(around(london),opts);
 const b=await queryWorldRadarCatalog(around(milan),opts);
 const c=await queryWorldRadarCatalog(around(istanbul),opts);
 assert.equal(a.available,true);
 assert.ok(a.datasetCount>=1400);
 assert.ok(a.features.some(x=>x.coords[0]===london[0]&&x.coords[1]===london[1]));
 assert.ok(b.features.some(x=>x.coords[0]===milan[0]));
 assert.ok(c.features.some(x=>x.coords[0]===istanbul[0]));
 assert.equal(requests.length,2,'same one-time global downloads reused across viewports');
 assert.ok(a.features.every(x=>x.source==='OpenStreetMap'&&x.verified===false));
 assert.equal(a.sourceAsOf,null,'do not claim snapshot freshness');
});
test('dedicated radar endpoint prioritizes snapshot results and never hits failing Overpass',async()=>{
 resetWorldRadarCatalogForTests();
 const {world,uk}=fixtures();let upstreamCalls=0,downloads=0;
 const result=await queryPublicRadars(around(london),{
  fetcher:async()=>{upstreamCalls++;throw Error('broken Overpass');},
  worldFetcher:async url=>{downloads++;return {ok:true,headers:{get:()=>null},
   text:async()=>url===WORLD_CAMERA_EXPORT?world:JSON.stringify(uk)};},
  useWorldSnapshot:true,now:()=>2000000
 });
 assert.equal(upstreamCalls,0);
 assert.equal(downloads,2);
 assert.ok(result.features.some(x=>x.type==='radar'&&x.coords[0]===london[0]));
 assert.equal(result.available,true);
});
