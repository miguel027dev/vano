import test from 'node:test';
import assert from 'node:assert/strict';
import {entirelyBrazilCore,overlapsBrazilBounds} from './radar-geography.mjs';
import {queryRadarSnapshot} from './radar-catalog.mjs';
import {queryPublicRadars,mergeRadarSources} from './map-radars.mjs';

const point=(id,lon,lat)=>({type:'node',id,lon,lat,tags:{highway:'speed_camera',maxspeed:'50'}});
const box=(lon,lat)=>[lon-.01,lat-.01,lon+.01,lat+.01];
const fixture=(id,lon,lat)=>({ok:true,json:async()=>({elements:[point(id,lon,lat)]})});
test('Brazil interior is an optimization, never a worldwide latitude/longitude blockade',()=>{
 for(const coord of [[-46.63,-23.55],[-43.20,-22.90],[-60.0,-3.12],[-47.9,-15.8],[-51.23,-30.02]]){
  assert.ok(entirelyBrazilCore(box(...coord)),String(coord));
 }
 for(const coord of [[4.83,45.75],[9.19,45.46],[-0.12,51.51],[28.97,41.01],
  [-73.99,40.75],[2.35,48.85],[-57.6,-25.3],[-68.12,-16.50],[-56.16,-34.9]]){
  assert.equal(entirelyBrazilCore(box(...coord)),false,String(coord));
 }
 assert.equal(overlapsBrazilBounds(box(4.83,45.75)),false);
 assert.equal(overlapsBrazilBounds(box(-57.6,-25.3)),true);
});
test('Brazil keeps existing offline snapshot and never requests Overpass in its core',async()=>{
 const b=box(-46.63,-23.55);
 const original=queryRadarSnapshot(b);
 assert.ok(original?.source==='VANO Radar Catalog');
 let calls=0;
 const actual=await queryPublicRadars(b,{fetcher:async()=>{calls++;throw Error('must not fetch');}});
 assert.deepEqual(actual,original);
 assert.equal(calls,0);
});
test('mapped international speed cameras work in France Italy UK Turkey and the Americas',async()=>{
 const places=[
  ['Lyon',4.83,45.75,190101],
  ['Milano',9.19,45.46,190102],
  ['London',-.12,51.51,190103],
  ['Istanbul',28.97,41.01,190104],
  ['New York',-73.99,40.75,190105],
  ['Asuncion',-57.6,-25.3,190106]
 ];
 for(const [name,lon,lat,id] of places){
  let calls=0;
  const opts={fetcher:async()=>{calls++;return fixture(id,lon,lat);},
   now:()=>100000,servers:['https://test.example/']};
  const first=await queryPublicRadars(box(lon,lat),opts);
  const second=await queryPublicRadars(box(lon,lat),opts);
  assert.deepEqual(first.features.map(f=>f.id),['osm-node-'+id],name);
  assert.equal(first.source,'OpenStreetMap',name);
  assert.equal(first.stale,false,name);
  assert.equal(second.cacheHit,true,name);
  assert.equal(calls,1,name);
 }
});
test('near borders Brazil catalog coordinates win and international cameras complement them',()=>{
 const national={features:[{id:'radar-catalog-a',type:'radar',coords:[-54.6,-25.5]}],source:'VANO Radar Catalog'};
 const international={features:[
  {id:'osm-node-1',type:'radar',coords:[-54.60005,-25.50006]},
  {id:'osm-node-2',type:'radar',coords:[-54.6200,-25.51]}],source:'OpenStreetMap',stale:false};
 const merged=mergeRadarSources(national,international);
 assert.deepEqual(merged.features.map(x=>x.id),['radar-catalog-a','osm-node-2']);
 assert.equal(merged.source,'VANO Radar Catalog + OpenStreetMap');
 assert.equal(mergeRadarSources(national,{features:[],error:'timeout'}).features.length,1);
 assert.equal(mergeRadarSources(national,{features:[],error:'timeout'}).internationalUnavailable,true);
});
test('international lookup failure does not hide Brazilian snapshot or invent cameras',async()=>{
 const b=box(-54.61,-25.51);
 const snapshot=queryRadarSnapshot(b);
 const found=await queryPublicRadars(b,{
  fetcher:async()=>{throw Error('offline');},now:()=>170000,
  servers:['https://offline.example/']});
 assert.ok(Array.isArray(found.features));
 assert.equal(found.features.length,snapshot?.features.length||0);
 if(snapshot?.features.length)assert.ok(found.features.every(f=>f.id.startsWith('radar-catalog-')));
});
