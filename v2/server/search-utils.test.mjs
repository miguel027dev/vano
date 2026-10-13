import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSearchResults,fold} from './search-utils.mjs';
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
