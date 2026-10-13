import test from 'node:test';
import assert from 'node:assert/strict';
import {queryPlaces,hasExplicitForeignLocation,providerUrl} from './search-provider.mjs';
import {rankSearchResults} from './search-utils.mjs';
const point=(name,id,lon,lat,where)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},
 properties:{name,mapbox_id:id,place_formatted:where,feature_type:'place'}});
const CH=[8.5417,47.3769],FR=[2.3522,48.8566],BR=[-46.6333,-23.5505];
test('international search accepts Switzerland, France, Brazil and the rest of the globe',async()=>{
 const names=[['Zurich, Switzerland',CH,'Zurique'],['Paris, France',FR,'Paris'],
  ['São Paulo, Brazil',BR,'São Paulo'],['Tokyo, Japan',[139.6917,35.6895],'Tóquio']];
 for(const [query,coords,title] of names){
  const urls=[];
  const result=await queryPlaces(query,{token:'pk.test',proximity:BR,language:'pt-BR',
   fetcher:async url=>{
    urls.push(new URL(url));
    return {ok:true,json:async()=>({features:[point(title,query,...coords,query)]})};
   }});
  assert.equal(result.providerOk,true);
  assert.deepEqual(result.results[0].coords,coords);
  assert.equal(urls.length,2);
  for(const url of urls){
   assert.equal(url.searchParams.has('country'),false,'no country hard filter');
   assert.equal(url.searchParams.has('bbox'),false,'no bounding-box hard filter');
   assert.equal(url.searchParams.has('proximity'),false,'explicit foreign place overcomes Brazil local bias');
   assert.equal(url.searchParams.get('limit'),'10');
  }
 }
});
test('Swiss search prefers nearest genuine results while preserving neighboring France and distant Brazil',async()=>{
 const urls=[],r=await queryPlaces('Gare Centrale',{token:'pk.test',language:'fr-FR',proximity:CH,
  fetcher:async input=>{
   const url=new URL(input);urls.push(url);
   return {ok:true,json:async()=>({features:[
    point('Gare Centrale','sao-paulo',...BR,'São Paulo, Brasil'),
    point('Gare Centrale','lausanne',6.6323,46.5197,'Lausanne, Suisse'),
    point('Gare Centrale','zurich',...CH,'Zürich, Schweiz'),
    point('Gare Centrale','annecy',6.1294,45.8992,'Annecy, France')
   ]})};
  }});
 assert.equal(urls.length,2);
 assert.ok(urls.every(x=>x.searchParams.get('proximity')===CH.join(',')));
 assert.ok(urls.every(x=>!x.searchParams.has('country')&&!x.searchParams.has('bbox')));
 assert.equal(r.results[0].address,'Zürich, Schweiz');
 assert.ok(r.results.some(x=>x.address==='Annecy, France'));
 assert.ok(r.results.some(x=>x.address==='São Paulo, Brasil'));
 assert.equal(r.results.length,4,'combine and de-duplicate same real POIs across providers');
});
test('queries with an explicit foreign country disable location bias, even with nearby GPS',()=>{
 for(const text of ['Genebra, Suíça','Paris, França','Roma, Itália','Berne, Schweiz',
  'Madrid, España','London, United Kingdom','Zurich, Suisse','São Paulo, Brasil']){
  assert.equal(hasExplicitForeignLocation(text),true,text);
  const url=new URL(providerUrl('https://api.mapbox.com/search/geocode/v6/forward',text,
   'pk.test','fr-FR',null));
  assert.equal(url.searchParams.has('proximity'),false);
  assert.equal(url.searchParams.has('country'),false);
 }
 assert.equal(hasExplicitForeignLocation('farmácia'),false);
 assert.equal(hasExplicitForeignLocation('Avenida Paulista'),false);
});
test('both POI and address/city providers are queried even if the first returns multiple shops',async()=>{
 const urls=[];
 const r=await queryPlaces('Paris',{token:'pk.test',proximity:BR,
  fetcher:async input=>{
   const u=new URL(input);urls.push(u);
   const features=u.pathname.includes('searchbox')?
    [point('Paris Loja 1','store1',-46.67,-23.56,'Brasil'),
     point('Paris Loja 2','store2',-46.62,-23.57,'Brasil'),
     point('Paris Loja 3','store3',-46.64,-23.57,'Brasil')]:
    [point('Paris','city',...FR,'França')];
   return {ok:true,json:async()=>({features})};
  }});
 assert.equal(urls.length,2,'geocoding must NOT be skipped after POI search');
 assert.equal(r.results[0].name,'Paris');
 assert.deepEqual(r.results[0].coords,FR);
});
test('one upstream outage does not disable geographic search if the other works',async()=>{
 const r=await queryPlaces('Geneva',{token:'pk.test',fetcher:async input=>{
  if(String(input).includes('searchbox'))throw Error('POI provider failed');
  return {ok:true,json:async()=>({features:[point('Geneva','geneva',6.14,46.2,'Switzerland')]})};
 }});
 assert.equal(r.providerOk,true);
 assert.equal(r.providerErrors,1);
 assert.equal(r.results[0].name,'Geneva');
});
test('country-free fallback retries a worldwide geocoder when nearby search finds no results',async()=>{
 const calls=[];
 const r=await queryPlaces('Sapporo',{token:'pk.test',proximity:BR,fetcher:async input=>{
  const u=new URL(input);calls.push(u);
  const worldwide=u.pathname.includes('geocode')&&!u.searchParams.has('proximity');
  return {ok:true,json:async()=>({features:worldwide?
   [point('Sapporo','japan',141.35,43.06,'Japan')]:[]})};
 }});
 assert.equal(calls.length,3);
 assert.equal(r.results[0].name,'Sapporo');
 assert.ok(calls.some(x=>x.pathname.includes('geocode')&&!x.searchParams.has('proximity')));
});
test('global source names and distance ties respect text relevance before nearby popularity',()=>{
 const items=[{id:'local',name:'Paris Shop',address:'São Paulo, Brasil',coords:BR},
  {id:'remote',name:'Paris',address:'Île de France, France',coords:FR}];
 assert.equal(rankSearchResults(items,'Paris',BR)[0].id,'remote');
 assert.equal(rankSearchResults(items,'Paris, France',BR)[0].id,'remote');
});
