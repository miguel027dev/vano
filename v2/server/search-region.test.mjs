import test from 'node:test';
import assert from 'node:assert/strict';
import {searchProximity,createNearbySuggestions} from './search-region.mjs';
const SP=[-46.65,-23.56],LISBON=[-9.14,38.72];
test('missing, blank and invalid coordinates never become a Brazilian or zero default',()=>{
 for(const value of ['', 'lng=&lat=', 'lng=null&lat=0','lng=1','lng=181&lat=4'])assert.equal(searchProximity(new URLSearchParams(value)),null);
 assert.deepEqual(searchProximity(new URLSearchParams('lng=0&lat=0')),[0,0]);
 assert.deepEqual(searchProximity(new URLSearchParams('lng=-9.14&lat=38.72')),LISBON);
});
test('nearby suggestions isolate regional caches, expire and exclude far provider results',async()=>{
 let now=100000,calls=[];
 const suggest=createNearbySuggestions(async(term,language,point)=>{
  calls.push({term,language,point});
  return [{id:'near',name:'Café',coords:point},{id:'remote',name:'Café SP',coords:SP}];
 },{clock:()=>now});
 assert.deepEqual(await suggest(null),[]);assert.equal(calls.length,0);
 assert.equal((await suggest(SP)).length,2);
 assert.deepEqual((await suggest(LISBON)).map(x=>x.id),['near']);
 await suggest(LISBON);assert.equal(calls.length,2);
 await suggest(LISBON,'en-US');assert.equal(calls.length,3);
 now+=46000;await suggest(LISBON);assert.equal(calls.length,4);
 assert.deepEqual(calls[1].point,LISBON);
});
