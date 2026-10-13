import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRAFFIC_PROVIDER_CATALOG,parseTrafficBBox,normalizeMunicipalTraffic,configuredPublicTraffic} from './traffic-public.mjs';

const bbox=[-46.72,-23.61,-46.65,-23.55],now=Date.parse('2026-10-13T11:45:00Z');
const line=(congestion,observedAt,coords=[[-46.71,-23.60],[-46.69,-23.58]])=>({
 type:'Feature',properties:{congestion,observedAt},geometry:{type:'LineString',coordinates:coords}
});
test('mapbox is immediately active; CET historic and satellite are NOT treated as real-time traffic',()=>{
 assert.equal(TRAFFIC_PROVIDER_CATALOG[0].mode,'live-vector');
 const cet=TRAFFIC_PROVIDER_CATALOG.find(p=>p.id==='cet-lentidao-historica');
 assert.equal(cet.enabled,false);
 assert.equal(cet.mode,'historical-only');
 assert.equal(TRAFFIC_PROVIDER_CATALOG.find(p=>p.id==='satellite-imagery').mode,'basemap-only');
 assert.equal(TRAFFIC_PROVIDER_CATALOG.find(p=>p.id==='municipal-geojson').enabled,false);
});
test('bounded traffic bbox refuses huge worldwide requests and invalid points',()=>{
 assert.deepEqual(parseTrafficBBox(bbox.join(',')),bbox);
 assert.equal(parseTrafficBBox('-180,-90,180,90'),null);
 assert.equal(parseTrafficBBox('-46.72,-23.61,-46.72,-23.55'),null);
 assert.equal(parseTrafficBBox('nan,-23.61,-46.65,-23.55'),null);
 assert.equal(parseTrafficBBox('1,2,3'),null);
});
test('municipal feed includes only verified-fresh and accurately geolocated road lines',()=>{
 const data={type:'FeatureCollection',features:[
  line('low',new Date(now-2*60_000).toISOString()),
  line('moderate',new Date(now-4*60_000).toISOString(),[[-46.709,-23.60],[-46.68,-23.58]]),
  line('heavy',new Date(now-7*60_000).toISOString(),[[-46.707,-23.60],[-46.68,-23.58]]),
  line('severe',new Date(now-3*60_000).toISOString(),[[-46.705,-23.60],[-46.68,-23.58]]),
  line('heavy',new Date(now-25*60_000).toISOString()),
  line('heavy',new Date(now+2*60_000).toISOString()),
  line('low',undefined),
  line('unknown',new Date(now-60_000).toISOString()),
  line('low',new Date(now-60_000).toISOString(),[[25,44],[25.1,44.1]]),
  {type:'Feature',properties:{congestion:'heavy',observedAt:new Date(now).toISOString()},
   geometry:{type:'Point',coordinates:[-46.71,-23.6]}}
 ]};
 const out=normalizeMunicipalTraffic(data,{bbox,now});
 assert.deepEqual(out.features.map(x=>x.properties.congestion),['moderate','heavy','severe']);
 assert.ok(out.features.every(x=>x.properties.congestion!=='low'), 'free-flow road segments are not displayed');
 assert.ok(out.features.every(x=>x.properties.source==='Fonte pública verificada'));
 assert.ok(out.features.every(x=>x.geometry.type==='LineString'));
 assert.ok(!JSON.stringify(out).includes('unknown'));
});
test('unconfigured or unsafe feed URLs cannot trigger external HTTP calls',async()=>{
 let calls=0;
 for(const url of ['', 'http://traffic.example.com/data','https://localhost/traffic',
  'https://127.0.0.1/feed','https://[::1]/feed','https://example.local/traffic']){
  const result=await configuredPublicTraffic(bbox,{url,now,fetcher:async()=>{calls++;throw Error('should not be called');}});
  assert.equal(result.enabled,false,url);
 }
 assert.equal(calls,0);
});
test('opt-in official HTTPS GeoJSON uses validated server configuration, bbox and freshness',async()=>{
 const timestamp=new Date(now-100000).toISOString(),requests=[];
 const feed={type:'FeatureCollection',features:[line('moderate',timestamp)]};
 const result=await configuredPublicTraffic(bbox,{
  url:'https://datos.municipio.example/traffic.geojson',token:'example-secret',now,
  fetcher:async (url,opts)=>{
   requests.push({url,headers:opts.headers});
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(feed)};
  }});
 assert.equal(result.enabled,true);
 assert.equal(result.features.length,1);
 assert.equal(result.features[0].properties.congestion,'moderate');
 assert.equal(new URL(requests[0].url).searchParams.get('bbox'),bbox.join(','));
 assert.equal(requests[0].headers.Authorization,'Bearer example-secret');
 assert.ok(!JSON.stringify(result).includes('example-secret'));
});
test('unreachable municipal feed cannot mark invented congestion as live',async()=>{
 const b=[-46.9,-23.7,-46.8,-23.64];
 const r=await configuredPublicTraffic(b,{url:'https://dados.example.net/traffic',now,
  fetcher:async()=>{throw Error('offline')}});
 assert.equal(r.enabled,true);
 assert.equal(r.stale,true);
 assert.deepEqual(r.features,[]);
});
test('server exposes source status and only passes server-owned configured URL',()=>{
 const index=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(index,/pathname==='\/api\/traffic\/sources'/);
 assert.match(index,/pathname==='\/api\/traffic\/public'/);
 assert.match(index,/parseTrafficBBox\(u\.searchParams\.get\('bbox'\)\)/);
 assert.match(index,/url:process\.env\.VANO_TRAFFIC_OFFICIAL_GEOJSON_URL/);
 assert.doesNotMatch(index,/url:u\.searchParams\.get\('url'\)/);
});
