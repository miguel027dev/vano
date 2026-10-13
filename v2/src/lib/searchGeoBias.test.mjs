import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchGeoBias} from './searchGeoBias.js';
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
test('Swiss, French and Brazilian GPS signals bias rather than restrict global searches',()=>{
 assert.equal(searchGeoBias([8.5417,47.3769],{gpsGranted:true}),'&lng=8.54&lat=47.38');
 assert.equal(searchGeoBias([2.3522,48.8566],{gpsGranted:true}),'&lng=2.35&lat=48.86');
 assert.equal(searchGeoBias([-46.6333,-23.5505],{gpsGranted:true}),'&lng=-46.63&lat=-23.55');
});
test('minor GPS jitter cannot cancel in-flight query or bust search cache',()=>{
 const a=searchGeoBias([8.5417,47.3769],{gpsGranted:true});
 const b=searchGeoBias([8.5422,47.3771],{gpsGranted:true});
 assert.equal(a,b);
});
test('no permission, manual origin or invalid location must not impersonate actual GPS',()=>{
 assert.equal(searchGeoBias([8.54,47.37],{gpsGranted:false}),'');
 assert.equal(searchGeoBias([8.54,47.37],{gpsGranted:true,manual:true}),'');
 assert.equal(searchGeoBias([181,47],{gpsGranted:true}),'');
 assert.equal(searchGeoBias([NaN,47],{gpsGranted:true}),'');
 assert.equal(searchGeoBias(null,{gpsGranted:true}),'');
});
test('main search and origin/destination editor use same coarse proximity helper',()=>{
 assert.match(page,/import \{searchGeoBias\} from '\.\.\/lib\/searchGeoBias\.js';/);
 assert.match(page,/const nearby=searchGeoBias\(userCoords,/);
 assert.match(page,/\$\{searchGeoBias\(userCoords,/);
 assert.match(page,/cached&&Date\.now\(\)-cached\.at<45000/);
 assert.ok(page.split('},250);').length-1>=2,'both address-search inputs use 250ms debounce');
 assert.doesNotMatch(page,/&lng=\$\{encodeURIComponent\(userCoords\[0\]\)\}/);
});
