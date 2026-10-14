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
 assert.match(overlay,/void refreshRadars\(bbox\)/);
 assert.match(overlay,/radarController\?\.abort\(\)/);
 assert.match(overlay,/\[\.\.\.radarItems,\.\.\.remoteItems/);
 assert.match(overlay,/data\.features\.filter\(x=>x\?\.type==='radar'/);
 assert.match(overlay,/mergeSources\(\);\s*render\(\)/);
});
