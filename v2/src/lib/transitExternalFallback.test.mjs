import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {externalTransitUrl} from './transitExternalFallback.mjs';

test('Transit fallback opens only explicit Google transit directions for valid origins',()=>{
 const o=[-46.682,-23.571],d=[-46.641,-23.561];
 const link=externalTransitUrl(o,d);
 const url=new URL(link);
 assert.equal(url.origin,'https://www.google.com');
 assert.equal(url.pathname,'/maps/dir/');
 assert.equal(url.searchParams.get('api'),'1');
 assert.equal(url.searchParams.get('travelmode'),'transit');
 assert.equal(url.searchParams.get('origin'),'-23.571,-46.682');
 assert.equal(url.searchParams.get('destination'),'-23.561,-46.641');
 for(const invalid of [null,[],[0],[181,10],[0,91],['-46.68',-23.5],[NaN,-23],[Infinity,10]]){
  assert.equal(externalTransitUrl(invalid,d),null);
 }
 assert.equal(externalTransitUrl(o,o),null);
});

test('Uncovered transit never generates fake in-app itineraries',()=>{
 const page=readFileSync(new URL('../pages/TransitPage.jsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
 assert.match(page,/coverage\?\.enabled===false&&<section className="vt-notice vt-coverage-notice"/);
 assert.match(page,/externalTransitUrl\(from\?\.coords,to\?\.coords\)/);
 assert.match(page,/target="_blank" rel="noopener noreferrer"/);
 assert.match(page,/disabled=\{!from\|\|!to\|\|loading\|\|coverage\?\.enabled!==true\}/);
 assert.match(api,/VANO_TRANSIT_ENABLED!=='1'/);
});
