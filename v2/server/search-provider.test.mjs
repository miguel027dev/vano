import test from 'node:test';
import assert from 'node:assert/strict';
import {isBrazilianCep,cepToSearchAddress,normalizedPlaces,queryPlaces} from './search-provider.mjs';
const feature=(name,id,lng=-46.72,lat=-23.58,street='São Paulo')=>({type:'Feature',properties:{name,mapbox_id:id,place_formatted:street},geometry:{type:'Point',coordinates:[lng,lat]}});
test('CEP parser only accepts complete eight-digit Brazilian postcodes',()=>{
  assert.equal(isBrazilianCep('05659-000'),true);
  assert.equal(isBrazilianCep('05659000'),true);
  assert.equal(isBrazilianCep('05659'),false);
  assert.equal(cepToSearchAddress({logradouro:'Rua A',bairro:'Bairro B',localidade:'São Paulo',uf:'SP'}).query,
    'Rua A, Bairro B, São Paulo, SP, Brasil');
});
test('exact CEP gets street/area coordinates, labeled as approximate',async()=>{
  const calls=[];
  const fetcher=async url=>{
    calls.push(url);
    if(url.includes('viacep'))return {ok:true,json:async()=>({cep:'05659-000',logradouro:'Rua A',bairro:'Vila Sônia',localidade:'São Paulo',uf:'SP'})};
    return {ok:true,json:async()=>({features:[feature('Rua A','r1')]})};
  };
  const r=await queryPlaces('05659-000',{token:'pk.test',fetcher});
  assert.ok(r.providerOk);
  assert.equal(r.results[0].name,'CEP 05659-000');
  assert.match(r.results[0].address,/aproximada/);
  assert.ok(calls.some(x=>x.includes('geocode/v6/forward')&&x.includes('Rua+A')));
});
test('shop names are ranked behind an exact matching shopping center',async()=>{
  const fetcher=async url=>({ok:true,json:async()=>({features:[feature('Loja Y','store',-46.7,-23.56,'Shopping Butantã'),feature('Shopping Butantã','shopping')]})});
  const r=await queryPlaces('Shopping Butantã',{token:'pk.test',fetcher});
  assert.equal(r.results[0].name,'Shopping Butantã');
  assert.equal(r.results[1].name,'Loja Y');
});
test('provider response without coordinates is not selectable',()=>{
  assert.deepEqual(normalizedPlaces({features:[{properties:{name:'Nothing'},geometry:{coordinates:null}}]}),[]);
});
