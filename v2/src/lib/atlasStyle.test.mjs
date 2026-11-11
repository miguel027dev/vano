import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const style=JSON.parse(readFileSync(new URL('../../public/mapbox/vano-atlas-light.json',import.meta.url),'utf8'));
test('VANO Atlas fornece JSON v8 com fontes e camadas consistentes',()=>{
 assert.equal(style.version,8);
 assert.ok(style.glyphs.startsWith('mapbox://fonts/'));
 assert.equal(style.sources['vano-streets'].url,'mapbox://mapbox.mapbox-streets-v8');
 assert.ok(style.layers.length>=12);
 const ids=new Set(style.layers.map(x=>x.id));
 assert.equal(ids.size,style.layers.length);
 for(const item of style.layers){
   assert.ok(['background','fill','fill-extrusion','line','symbol'].includes(item.type));
   if(item.type==='background')assert.ok(!item.source);
   else {assert.equal(item.source,'vano-streets');assert.equal(typeof item['source-layer'],'string');}
 }
});
test('VANO Atlas preserva ruas e não incorpora tokens',()=>{
 assert.ok(style.layers.some(x=>x.id==='vano-road-labels'));
 assert.ok(style.layers.some(x=>x.id==='vano-buildings-3d'));
 assert.ok(!JSON.stringify(style).includes('access_token'));
});
