import test from 'node:test';
import assert from 'node:assert/strict';
import {MAVI_POI_CATEGORIES,encodePolyline,validatePoiRoute,rankMaviPlaces,findMaviPlaces} from './mavi-poi.mjs';
const origin=[-46.720,-23.605],destination=[-46.710,-23.601];
const route=[origin,[-46.717,-23.604],[-46.714,-23.602],destination];
const point=(name,coords,category='grocery')=>({id:'mavi-poi:'+name,name,address:'São Paulo',category,coords});
const feature=(name,coords,type='poi')=>({
 type:'Feature',geometry:{type:'Point',coordinates:coords},
 properties:{feature_type:type,mapbox_id:'id-'+name,name,full_address:name+' · São Paulo'}
});
test('search category always uses restricted Mapbox POI API and route SAR geometry',async()=>{
 const seen=[];
 const fetcher=async(url)=>{
   const u=new URL(url);seen.push(u);
   return {ok:true,json:async()=>({features:[feature('Mercado A',[-46.716,-23.6035])]})};
 };
 const found=await findMaviPlaces({category:'grocery',scope:'route',origin,route,token:'test-token',fetcher});
 assert.equal(found[0]?.name,'Mercado A');
 assert.equal(seen[0].pathname,'/search/searchbox/v1/category/grocery');
 assert.equal(seen[0].searchParams.get('sar_type'),'isochrone');
 assert.equal(seen[0].searchParams.get('route_geometry'),'polyline6');
 assert.equal(seen[0].searchParams.get('time_deviation'),'7');
 assert.ok(seen[0].searchParams.get('route')?.length>10);
 assert.equal(seen[0].searchParams.get('proximity'),origin.join(','));
 const near=await findMaviPlaces({category:'hospital',scope:'nearby',origin,token:'test-token',fetcher});
 assert.equal(near[0].name,'Mercado A'); // provider mock, not a real category identity
 assert.equal(seen[1].pathname,'/search/searchbox/v1/category/hospital');
 assert.equal(seen[1].searchParams.has('sar_type'),false);
 assert.equal(encodePolyline(route).length>10,true);
 assert.equal(MAVI_POI_CATEGORIES.grocery.label,'mercado');
 assert.equal(MAVI_POI_CATEGORIES.pharmacy.id,'pharmacy');
 const medic=await findMaviPlaces({category:'pharmacy',scope:'nearby',origin,token:'test-token',fetcher});
 assert.ok(medic.length);
 assert.equal(seen.at(-1).pathname,'/search/searchbox/v1/category/pharmacy');
});
test('along-route candidates must be ahead and inside a strict corridor',()=>{
 const ranked=rankMaviPlaces([
  point('Dentro',[-46.715,-23.603]),
  point('Muito longe',[-46.80,-23.70]),
  point('Lateral demais',[-46.711,-23.575]),
  point('Antes',[-46.719,-23.605])
 ],{scope:'route',origin:[-46.7165,-23.6038],route});
 assert.deepEqual(ranked.map(x=>x.name),['Dentro']);
 assert.ok(ranked[0].corridorMeters<800);
});
test('never treats arbitrary address, unknown categories, or spoofed route as POI',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({features:[
  feature('Rua A',[-46.716,-23.6035],'address'),
  feature('Mercado B',[-46.715,-23.603],'poi')
 ]})});
 const places=await findMaviPlaces({category:'grocery',scope:'route',origin,route,token:'test-token',fetcher});
 assert.deepEqual(places.map(x=>x.name),['Mercado B']);
 await assert.rejects(findMaviPlaces({category:'unknown',scope:'route',origin,route,token:'test-token',fetcher}));
 assert.equal(validatePoiRoute(route,origin,destination),true);
 assert.equal(validatePoiRoute(route,origin,[-46.8,-23.7]),false);
 assert.equal(validatePoiRoute(route.slice(0,1),origin,destination),false);
 assert.equal(validatePoiRoute([origin,[-42,-18]],origin,destination),false);
});
