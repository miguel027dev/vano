import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBBox,normalizeOsmElements,overpassQuery,classifyOsm,queryPublicMap,filterVerifiedReports} from './map-public-data.mjs';

const bbox='-46.69,-23.59,-46.66,-23.57';
const elem=(id,highway,lon=-46.68,lat=-23.58)=>({type:'node',id,lon,lat,tags:{highway}});
test('global viewport is bounded and blocks invalid, huge or inverted geometry',()=>{
 assert.deepEqual(parseBBox(bbox),[-46.69,-23.59,-46.66,-23.57]);
 for(const b of ['-180,-90,180,90','0,0,0,0','1,2,3','-46.7,-23.58,-46.8,-23.5',
   '-181,-30,-180,-29','-46.69,NaN,-46.67,-23.57','-46.69,-23.59,-46.68,Infinity',null])
   assert.equal(parseBBox(b),null);
});
test('radar, signage, traffic calming, road work and critical public services use actual OSM tags',()=>{
 const expected=[
  [{highway:'speed_camera'},'radar'],[{highway:'traffic_signals'},'semaforo'],
  [{traffic_calming:'bump'},'lombada'],[{highway:'stop'},'pare'],
  [{highway:'give_way'},'preferencia'],[{traffic_sign:'BR:R-1'},'placa'],
  [{railway:'level_crossing'},'ferrovia'],[{highway:'construction'},'obra'],
  [{amenity:'hospital'},'hospital'],[{amenity:'fire_station'},'bombeiros'],
  [{amenity:'police'},'policia-base'],[{amenity:'charging_station'},'eletroposto']
 ];
 for(const [tags,type]of expected)assert.equal(classifyOsm(tags)[0],type);
 assert.equal(classifyOsm({shop:'sweets'}),null);
});
test('radars sort first and duplicated / spoofed or malformed features do not enter the UI',()=>{
 const raw=[elem(2,'traffic_signals'),elem(1,'speed_camera'),elem(1,'speed_camera'),
   {...elem(3,'speed_camera'),lat:999},{...elem(4,'stop'),tags:{highway:'stop',name:'<script>alert(1)</script>'}}];
 const items=normalizeOsmElements(raw);
 assert.equal(items[0].type,'radar');
 assert.equal(items.length,3);
 assert.ok(!items.some(x=>x.name.includes('<')));
 assert.ok(items.every(x=>x.source==='OpenStreetMap'));
});
test('Overpass asks only for known tags within an explicitly bounded area',()=>{
 const query=overpassQuery(parseBBox(bbox));
 assert.match(query,/speed_camera/);
 assert.match(query,/traffic_calming/);
 assert.match(query,/amenity/);
 assert.match(query,/railway/);
 assert.match(query,/out body 150;/);
 assert.match(query,/out body 1250;/);
 assert.ok(query.indexOf('speed_camera')<query.indexOf('traffic_signals'));
 assert.match(query,/-23\.59000,-46\.69000,-23\.57000,-46\.66000/);
});
test('Overpass query is cached and never invents unmapped radars',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return{ok:true,json:async()=>({elements:[elem(72,'speed_camera')]})};};
 const result=await queryPublicMap(bbox,{fetcher});
 assert.equal(result.features.length,1);
 assert.equal(result.features[0].type,'radar');
 assert.equal(result.source,'OpenStreetMap');
 const second=await queryPublicMap(bbox,{fetcher});
 assert.equal(calls,1);
 assert.equal(second.cacheHit,true);
});
test('community incidents render only after verification, within bounds and recency',()=>{
 const now=Date.now();
 const reports=[
  {id:'yes',type:'acidente',coords:[-46.68,-23.58],status:'verificado',createdAt:new Date(now-3600000).toISOString(),description:'Bloqueio na via',owner:'PRIVATE'},
  {id:'no',type:'acidente',coords:[-46.68,-23.58],status:'nao_verificado',createdAt:new Date(now-3600000).toISOString()},
  {id:'old',type:'radar',coords:[-46.68,-23.58],status:'verificado',createdAt:new Date(now-30*86400000).toISOString()}
 ];
 const visible=filterVerifiedReports(reports,parseBBox(bbox),now);
 assert.deepEqual(visible.map(x=>x.id),['report-yes']);
 assert.equal(visible[0].owner,undefined);
 assert.equal(visible[0].verified,true);
});

test('dense traffic signals never exhaust hospital and emergency-service feature slots',()=>{
 const many=Array.from({length:250},(_,i)=>elem(i+100,'traffic_signals'));
 const hospital={...elem(777,'',-46.68,-23.58),tags:{amenity:'hospital'}};
 const radar=elem(778,'speed_camera');
 const result=normalizeOsmElements([...many,hospital,radar]);
 assert.equal(result[0].type,'radar');
 assert.ok(result.some(x=>x.type==='hospital'));
 assert.ok(result.length<=180);
});
test('reports no fabricated features when both network sources are unavailable',async()=>{
 const fetcher=async()=>{throw new Error('simulated timeout');};
 const response=await queryPublicMap('-46.755,-23.679,-46.739,-23.671',{fetcher});
 assert.deepEqual(response.features,[]);
 assert.equal(response.stale,true);
 assert.match(response.error,/indisponível/);
});
