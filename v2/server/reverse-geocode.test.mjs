import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedReverseAddress,parseReverseCoords} from './reverse-geocode.mjs';
const coordinate=q=>new URLSearchParams(q);
test('reverse coordinates validated and rounded to meter-scale, no NaN',()=>{
 assert.deepEqual(parseReverseCoords(coordinate('longitude=-46.66899282&latitude=-23.5643324')),{lon:-46.66899,lat:-23.56433});
 for(const q of ['latitude=-23.5','longitude=&latitude=-23.5','longitude=181&latitude=0','longitude=a&latitude=-23.5','longitude=12&latitude=-93'])assert.equal(parseReverseCoords(coordinate(q)),null);
});
test('return street, optional number, district and city without raw provider object',()=>{
 const found=normalizedReverseAddress({features:[{properties:{feature_type:'address',name:'Rua A',address_number:'42',full_address:'Rua A, 42, São Paulo',context:{neighborhood:{name:'Vila Sônia'},place:{name:'São Paulo'}}}}]});
 assert.deepEqual(found,{street:'Rua A, 42',detail:'Vila Sônia · São Paulo',provider:'mapbox'});
 assert.equal('coordinates' in found,false);
});
test('empty reverse and sparse street results degrade safely',()=>{
 assert.equal(normalizedReverseAddress({features:[]}),null);
 assert.equal(normalizedReverseAddress(null),null);
 assert.equal(normalizedReverseAddress({features:[{properties:{name:'Avenida Brasil',feature_type:'street'}}]}).street,'Avenida Brasil');
});
