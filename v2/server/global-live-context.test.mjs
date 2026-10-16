import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGlobalBBox,normalizeEonet,normalizeMet,queryGlobalContext,GLOBAL_CONTEXT_SOURCES} from './global-live-context.mjs';
const bbox=[-46.7,-23.7,-46.5,-23.5],date='2026-10-16T18:00:00Z';
const eonet={features:[
 {type:'Feature',id:'E1',properties:{title:'Incêndio regional',date,categories:[{title:'Wildfires'}]},geometry:{type:'Point',coordinates:[-46.6,-23.6]}},
 {type:'Feature',id:'E2',properties:{title:'Fora da área',date},geometry:{type:'Point',coordinates:[-70,-20]}},
 {type:'Feature',id:'E3',properties:{title:'Área ampla',date},geometry:{type:'Polygon',coordinates:[]}}
]};
const met={properties:{timeseries:[{time:date,data:{instant:{details:{air_temperature:26,wind_speed:4}},next_1_hours:{details:{precipitation_amount:2},summary:{symbol_code:'rain'}}}}]}};
const mock=url=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(String(url).includes('eonet')?eonet:met)});
test('validates bounded viewport and coordinate ranges',()=>{
 assert.deepEqual(parseGlobalBBox(bbox.join(',')),bbox);
 assert.equal(parseGlobalBBox('-180,-85,180,85'),null);
 assert.equal(parseGlobalBBox('0,0,0,1'),null);
 assert.equal(parseGlobalBBox('NaN,0,1,1'),null);
 assert.equal(GLOBAL_CONTEXT_SOURCES.every(x=>x.affectsRouting===false),true);
});
test('normalizes geolocated events without falsely claiming street-level safety',()=>{
 assert.deepEqual(normalizeEonet(eonet,bbox).map(x=>x.id),['E1']);
 assert.equal(normalizeEonet(eonet,bbox)[0].routingVerified,false);
 assert.equal(normalizeMet(met).precipitationNextHourMm,2);
});
test('parallel upstreams coalesce concurrent requests',async()=>{
 const calls=[],coords=[-46.71,-23.71,-46.51,-23.51];
 const [a,b]=await Promise.all(Array.from({length:2},()=>queryGlobalContext(coords,{
  clock:()=>Date.parse(date),fetcher:async url=>{calls.push(String(url));return mock(url);}
 })));
 assert.equal(calls.length,2);
 assert.equal(a.affectsRouting,false);
 assert.deepEqual(a,b);
 assert.equal(a.events.length,1);
 assert.equal(a.weather.temperatureC,26);
 assert.ok(calls.some(x=>x.includes('bbox=-46.71%2C-23.51%2C-46.51%2C-23.71')));
 assert.ok(calls.some(x=>x.includes('lat=-23.61')));
});
test('source outage never prevents unrelated global context',async()=>{
 const area=[-70.14,-34.61,-69.91,-34.39];
 const r=await queryGlobalContext(area,{clock:()=>Date.parse(date),fetcher:async url=>{
  if(String(url).includes('eonet'))throw Error('offline');return mock(url);
 }});
 assert.equal(r.events.length,0);
 assert.equal(r.weather.temperatureC,26);
 assert.equal(r.sources[0].stale,true);
 assert.equal(r.affectsRouting,false);
});
