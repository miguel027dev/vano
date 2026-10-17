import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radarOverpassQuery,normalizeMappedRadars,queryPublicRadars,RADAR_OVERPASS_SERVERS} from './map-radars.mjs';

const area=[-46.69,-23.59,-46.66,-23.57];
const camera=(id,lon=-46.68,lat=-23.58)=>({
 type:'node',id,lon,lat,tags:{highway:'speed_camera'}
});
test('dedicated radar query requests only mapped speed cameras in a bounded box',()=>{
 const q=radarOverpassQuery(area);
 assert.match(q,/highway"="speed_camera/);
 assert.match(q,/enforcement"="maxspeed/);
 assert.ok(!q.includes('traffic_signals'));
 assert.ok(!q.includes('supermarket'));
 assert.match(q,/-23\.59000,-46\.69000,-23\.57000,-46\.66000/);
 assert.throws(()=>radarOverpassQuery([0,0,180,90]),RangeError);
});
test('radars are always real, valid OSM point nodes',()=>{
 const mapped=normalizeMappedRadars([
  camera(1),camera(1),
  {type:'node',id:2,lon:-46.67,lat:-23.58,tags:{enforcement:'maxspeed'}},
  {type:'node',id:3,lon:-46.68,lat:-23.58,tags:{highway:'traffic_signals'}},
  {type:'way',id:4,center:{lon:-46.68,lat:-23.58},tags:{enforcement:'maxspeed'}},
  camera(5,200,0)
 ]);
 assert.deepEqual(mapped.map(x=>x.id),['osm-node-1','osm-node-2']);
 assert.ok(mapped.every(x=>x.type==='radar'&&x.source==='OpenStreetMap'));
});
test('fallback succeeds when the primary endpoint fails',async()=>{
 let calls=0;
 const fetcher=async (_url,options)=>{
  calls++;
  assert.equal(options.method,'POST');
  if(calls===1)throw Error('blocked primary');
  return {ok:true,json:async()=>({elements:[camera(53)]})};
 };
 const result=await queryPublicRadars([-46.812,-23.711,-46.801,-23.701],
  {fetcher,now:()=>100000,useSnapshot:false,servers:['https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.private.coffee/api/interpreter']});
 assert.equal(calls,2);
 assert.equal(result.features[0].type,'radar');
 assert.equal(result.stale,false);
});
test('successful speed-camera lookup is cached and not queried on every pan',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return {ok:true,json:async()=>({elements:[camera(62)]})};};
 const bb=[-46.902,-23.745,-46.891,-23.733];
 const opts={fetcher,now:()=>120000,useSnapshot:false,servers:[RADAR_OVERPASS_SERVERS[0]]};
 const a=await queryPublicRadars(bb,opts);
 const b=await queryPublicRadars(bb,opts);
 assert.equal(a.features.length,1);
 assert.equal(b.cacheHit,true);
 assert.equal(calls,1);
});
test('failed radar host never fabricates results and is negatively cached',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('simulated radar outage');};
 const bb=[-46.982,-23.845,-46.971,-23.832];
 const opts={fetcher,now:()=>130000,useSnapshot:false,servers:[RADAR_OVERPASS_SERVERS[0],RADAR_OVERPASS_SERVERS[1]]};
 const first=await queryPublicRadars(bb,opts);
 const next=await queryPublicRadars(bb,opts);
 assert.deepEqual(first.features,[]);
 assert.ok(first.stale&&first.error);
 assert.ok(next.cacheHit);
 assert.equal(calls,2);
});
test('radar endpoint is isolated from non-radar POIs and client retains them',()=>{
 const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../src/lib/mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(server,/pathname==='\/api\/map-radars'/);
 assert.match(server,/queryPublicRadars\(bbox\)/);
 assert.match(overlay,/if\(radarBbox\)void refreshRadars\(radarBbox\)/);
 assert.match(overlay,/radarController\?\.abort\(\)/);
 assert.match(overlay,/nearbyPublicFeatures\(sourceCache/);
 assert.match(overlay,/data\.features\.filter\(x=>x\?\.type==='radar'/);
 assert.match(overlay,/mergeSources\(\);\s*render\(\)/);
});

test('large London-scale international viewport reaches genuine Overpass instead of being suppressed',async()=>{
 // The real /api/map-radars viewer asks for as much as 0.30 degrees.
 const london=[-0.25,51.42,0.04,51.69];
 let count=0,body='';
 const fetcher=async(_url,options)=>{
  count++;body=String(options.body||'');
  return {ok:true,json:async()=>({elements:[
   {type:'node',id:93100,lon:-.125,lat:51.512,tags:{highway:'speed_camera'}}
  ]})};
 };
 const result=await queryPublicRadars(london,{
  fetcher,useWorldSnapshot:false,useSnapshot:false,servers:[RADAR_OVERPASS_SERVERS[0]],
  now:()=>1900000
 });
 assert.equal(count,1);
 assert.equal(result.features.length,1);
 assert.deepEqual(result.features[0].coords,[-.125,51.512]);
 assert.equal(result.coverage,'mapped-only');
 assert.ok(body.includes('51.42000'));
});
test('global lookup remains bounded; a continent-wide request is still rejected',async()=>{
 await assert.rejects(()=>queryPublicRadars([-10,40,10,60],{useSnapshot:false}),RangeError);
});
test('map refresh retries international radar snapshot warming promptly',()=>{
 const overlay=readFileSync(new URL('../src/lib/mapPublicOverlay.js',import.meta.url),'utf8');
 assert.ok(overlay.includes('radarRetryTimer=setTimeout'));
 assert.ok(overlay.includes('radarRetryCount<(data.refreshing===true?5:3)'));
 assert.ok(overlay.includes('data.refreshing===true?6000:5000'));
 const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.ok(server.includes("result.refreshing===true||result.error?'no-store'"));
 assert.ok(overlay.includes('if(visible)void refreshRadars(visible)'));
});
