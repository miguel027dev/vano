import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSearchResults,fold,mergeSearchResults} from './search-utils.mjs';
const at=(id,name,address)=>({id,name,address,coords:[-46.7,-23.55]});
test('Shopping Butantã appears before shops inside it',()=>{
  const found=rankSearchResults([at('loja','Loja X','Shopping Butantã - São Paulo'),at('shopping','Shopping Butantã','Av. Vital Brasil'),at('bairro','Butantã','São Paulo')],'Shopping Butanta');
  assert.equal(found[0].id,'shopping');assert.equal(found[1].id,'loja');
});
test('exact address names and CEP are first and duplicates removed',()=>{
  const found=rankSearchResults([at('other','Rua São Paulo','01001000'),at('cep','01001-000','Praça da Sé'),at('cep','01001-000','Praça da Sé')],'01001-000');
  assert.equal(found[0].id,'cep');assert.equal(found.length,2);
  assert.equal(fold('AV. São João'),'av sao joao');
});

test('merge ranks local MASP acronym from a complementary provider before remote prefixes',()=>{
 const sp=[-46.65,-23.56];
 const remote=Array.from({length:10},(_,i)=>({id:'remote'+i,name:'MASP Loja '+i,address:'Outro país',coords:[-9.14,38.72]}));
 const museum={id:'museum',name:'Museu de Arte de São Paulo-MASP',address:'Av. Paulista, São Paulo',coords:sp};
 const found=mergeSearchResults([remote,[museum]],'MASP',sp);
 assert.equal(found[0].id,'museum');assert.equal(found.length,11);
 assert.ok(found.some(item=>item.id==='remote0'));
});
test('Lisbon region wins equal relevance and a qualified remote destination remains searchable',()=>{
 const found=mergeSearchResults([[{id:'sp',name:'Café Central',coords:[-46.65,-23.56]}],
 [{id:'lisbon',name:'Café Central',coords:[-9.14,38.72]}]],'Café Central',[-9.14,38.72]);
 assert.equal(found[0].id,'lisbon');assert.equal(found.length,2);
 const remote=rankSearchResults([{id:'shop',name:'Paris Loja',coords:[-46.65,-23.56]},
 {id:'paris',name:'Paris',coords:[2.35,48.86]}],'Paris',[-46.65,-23.56]);
 assert.equal(remote[0].id,'paris');
});
test('cross-provider deduplication keeps separate neighboring businesses',()=>{
 const p={id:'a',name:'Museu MASP',coords:[-46.65,-23.56]};
 assert.equal(mergeSearchResults([[p],[{...p,id:'b',coords:[-46.65001,-23.56]},
 {...p,id:'c',name:'Loja MASP'}]],'MASP',p.coords).length,2);
});

test('Japanese and Arabic destination names retain exact relevance across regions',()=>{
 assert.equal(fold('東京'),'東京');assert.equal(fold('القاهرة'),'القاهرة');
 const japan=rankSearchResults([{id:'osaka',name:'大阪',coords:[135.5,34.7]},
  {id:'tokyo',name:'東京',coords:[139.7,35.7]}],'東京',[135.5,34.7]);
 assert.equal(japan[0].id,'tokyo');
 const arabic=rankSearchResults([{id:'dubai',name:'دبي',coords:[55.27,25.2]},
  {id:'cairo',name:'القاهرة',coords:[31.23,30.04]}],'القاهرة',[55.27,25.2]);
 assert.equal(arabic[0].id,'cairo');
});

test('landmark initialism beats closer advertisements and shops mentioning that landmark',()=>{
 const results=rankSearchResults([
  {id:'rental',name:'BV0122 | Localizacao Imbativel, 02 quartos ao lado MASP!',coords:[-46.65472014,-23.56136231]},
  {id:'restaurant',name:'A Baianeira-MASP',coords:[-46.655396,-23.561811]},
  {id:'museum',name:'Museu de Arte de São Paulo-MASP',coords:[-46.655621,-23.561097]},
  {id:'other',name:'Masp',coords:[-46.67428,-23.60546]}
 ],'MASP',[-46.65,-23.56]);
 assert.equal(results[0].id,'museum');
});
