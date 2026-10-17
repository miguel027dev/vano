import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTomTomPois,searchTomTomPlaces,createTomTomPoiGateway} from './tomtom-pois.mjs';
import {dedupePublicFeatureSources} from '../src/lib/dedupePublicFeatureSources.js';
import {rankTomTomSafeAlternative,routeCorridorPoints} from './tomtom-route-ranking.mjs';

const bbox=[-46.70,-23.61,-46.62,-23.53];
const poi=(id,name,cls,lat=-23.58,lon=-46.67)=>({
 id,type:'POI',position:{lat,lon},
 poi:{name,classifications:[{code:'POI',names:[{name:cls}]}]},
 address:{freeformAddress:'Rua Exemplo, São Paulo'}
});
test('POI search reads provider taxonomy, not guessed business names',()=>{
 const result=normalizeTomTomPois({results:[
  poi('a','Hospital São Lucas','Hospital'),poi('b','Restaurante Bella','Restaurant',-23.581,-46.671),
  poi('c','Clínica Viva','Clinic',-23.583,-46.672),
  poi('d','Fast Food Roma','Fast Food',-23.585,-46.673),
  poi('x','Hospital Fake','Unknown Category',-23.586,-46.674)
 ]},bbox);
 assert.deepEqual(result.map(x=>x.type),['hospital','restaurante','saude','fastfood']);
 assert.ok(result.every(x=>x.source==='TomTom Search'&&x.poi));
});
test('map merges identical named POIs but keeps distinct shops in the same building',()=>{
 const data=[
  {id:'mapbox-poi-a',type:'hospital',coords:[-46.67,-23.58],name:'Hospital São Lucas',source:'Mapbox'},
  {id:'tomtom-a',type:'hospital',coords:[-46.67018,-23.58007],name:'Hospital Sao Lucas',source:'TomTom Search',poi:true},
  {id:'tomtom-b',type:'hospital',coords:[-46.67010,-23.58005],name:'Clínica Diferente',source:'TomTom Search',poi:true},
  {id:'tomtom-c',type:'farmacia',coords:[-46.67010,-23.58005],name:'Hospital São Lucas',source:'TomTom Search',poi:true}
 ];
 const deduped=dedupePublicFeatureSources(data);
 assert.equal(deduped.length,3);
 assert.ok(deduped.some(x=>x.id==='mapbox-poi-a'));
 assert.ok(!deduped.some(x=>x.id==='tomtom-a'));
 assert.ok(deduped.some(x=>x.id==='tomtom-b'));
});
test('search key only travels to fixed TomTom endpoint from backend',async()=>{
 let requested;
 const r=await searchTomTomPlaces('Hospital',{key:'test-secret',proximity:[-46.67,-23.58],
  fetcher:async url=>{
   requested=new URL(url);
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({results:[poi('a','Hospital São Lucas','Hospital')]})};
  }});
 assert.equal(requested.hostname,'api.tomtom.com');
 assert.equal(requested.searchParams.get('key'),'test-secret');
 assert.equal(r.length,1);
 assert.ok(!JSON.stringify(r).includes('test-secret'));
});
test('POI cold cache never waits for third party and makes no request without a key',async()=>{
 let fetches=0;
 const g=createTomTomPoiGateway({fetcher:async()=>{fetches++;return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({results:[poi('a','Hospital São Lucas','Hospital')]})}}});
 assert.equal(g.snapshot(bbox,'').enabled,false);
 assert.equal(fetches,0);
 const first=g.snapshot(bbox,'k');
 assert.equal(first.status,'loading');
 assert.deepEqual(first.features,[]);
 await new Promise(setImmediate);
 assert.equal(fetches,1);
 assert.equal(g.snapshot(bbox,'k').features.length,1);
});
const base=[[-46.68,-23.58],[-46.679,-23.58],[-46.678,-23.58]];
const detour=[[-46.68,-23.584],[-46.679,-23.584],[-46.678,-23.584]];
const route=(id,coords,duration)=>({id,label:'test',geometry:{type:'LineString',coordinates:coords},duration,distance:1});
const incident=(id,geometry)=>({id,type:'alerta-via',coords:[-46.679,-23.58],
 incidentCategory:'roadclosed',roadGeometry:geometry});
test('TomTom actual road geometry can select an existing safer alternate without editing ETA',()=>{
 const r={source:'mapbox-v1-candidates',
  routes:[route('safe',base,13),route('fast',detour,10)],
  safeCandidatePool:[route('safe-candidate-1',detour,11)]};
 const out=rankTomTomSafeAlternative(r,[incident('close',{type:'LineString',coordinates:base})]);
 assert.equal(out.routes[0].id,'safe');
 assert.deepEqual(out.routes[0].geometry.coordinates,detour);
 assert.equal(out.routes[0].duration,10);
 assert.deepEqual(out.routes[1],r.routes[1]);
 assert.equal(out.routes[0].verifiedSafety,false);
 assert.equal(out.routes[0].tomtomTrafficEvidence.changed,true);
 assert.deepEqual(routeCorridorPoints(r).length,6);
});
test('single nearby point does not cause an automatic reroute or invent road block',()=>{
 const r={source:'mapbox-v1-candidates',routes:[route('safe',base,13),route('fast',detour,10)]};
 const out=rankTomTomSafeAlternative(r,[incident('point',null)]);
 assert.deepEqual(out.routes[0].geometry.coordinates,base);
 assert.equal(out.routes[0].tomtomTrafficEvidence.changed,false);
 assert.deepEqual(rankTomTomSafeAlternative({...r,source:'vano-original-python'},[incident('other',{type:'LineString',coordinates:base})]),{...r,source:'vano-original-python'});
});
test('missing key or no incidents never changes existing provider choices',()=>{
 const r={source:'mapbox-v1-candidates',routes:[route('safe',base,13),route('fast',detour,10)]};
 assert.equal(rankTomTomSafeAlternative(r,[]),r);
});
