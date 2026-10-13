import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberMapFeatures,cachedMapFeatures,MAP_FEATURE_CACHE_LIMIT} from './mapFeaturePersistence.js';
import {selectPublicPins,stableWorldCell,iconSvg} from './mapPublicIcons.js';
import {readFileSync} from 'node:fs';

const feature=(id,lon,lat,type='semaforo',priority=88)=>({
 id,type,coords:[lon,lat],priority,name:type,source:'Mapbox Streets',verified:false
});
test('a signal persists at the same geographical coordinate through multiple tile batches and empty tile frames',()=>{
 const cache=new Map(),first=feature('signal-A',-46.681,-23.581),second=feature('signal-B',-46.671,-23.581);
 assert.equal(rememberMapFeatures(cache,[first]),true);
 assert.equal(rememberMapFeatures(cache,[]),false);
 assert.deepEqual(cachedMapFeatures(cache).map(x=>x.id),['signal-A']);
 assert.equal(rememberMapFeatures(cache,[second]),true);
 assert.deepEqual(new Set(cachedMapFeatures(cache).map(x=>x.id)),new Set(['signal-A','signal-B']));
 // A different zoom tile may describe the same feature with a slightly
 // shifted coordinate: do NOT jump an existing navigation icon to it.
 const changed={...first,coords:[-46.68105,-23.58105]};
 assert.equal(rememberMapFeatures(cache,[changed]),false);
 assert.deepEqual(cachedMapFeatures(cache).find(x=>x.id==='signal-A').coords,first.coords);
});
test('cache remains bounded while preserving newest, genuine mapped features',()=>{
 const cache=new Map(),limit=5;
 for(let i=0;i<10;i++)rememberMapFeatures(cache,[feature('signal-'+i,-46.7+i*.001,-23.58)],limit);
 assert.equal(cache.size,limit);
 assert.deepEqual(cachedMapFeatures(cache).map(x=>x.id),['signal-5','signal-6','signal-7','signal-8','signal-9']);
 assert.ok(MAP_FEATURE_CACHE_LIMIT>=1000);
 assert.equal(rememberMapFeatures(cache,[{id:'fake',coords:[NaN,-23]}],limit),false);
 assert.equal(cache.has('fake'),false);
});
test('same real signs remain selected after camera panning changes screen pixels',()=>{
 const pins=[
  feature('a',-46.68,-23.58),
  feature('b',-46.67,-23.58),
  feature('c',-46.66,-23.58,'hospital',58)
 ];
 // Two offset camera projections see the same features in different screen cells.
 const projectA=([x,y])=>({x:(x+46.7)*9000+100,y:(y+23.6)*9000+100});
 const projectB=([x,y])=>({x:(x+46.7)*9000+123,y:(y+23.6)*9000+122});
 const viewport={width:500,height:500};
 const before=selectPublicPins(pins,projectA,16,120,viewport).map(x=>x.id);
 const after=selectPublicPins(pins,projectB,16,120,viewport).map(x=>x.id);
 assert.deepEqual(before,after);
 assert.equal(stableWorldCell(pins[0].coords,16),stableWorldCell(pins[0].coords,16));
 assert.notEqual(stableWorldCell(pins[0].coords,16),stableWorldCell(pins[1].coords,16));
});
test('roundabout glyph is a complete clear three-arc sign with no disconnected zigzag version',()=>{
 const svg=iconSvg('rotatoria');
 assert.match(svg,/<circle cx="12" cy="12" r="2\.2"/);
 assert.match(svg,/a7\.7 7\.7/g);
 assert.ok((svg.match(/a7\.7 7\.7/g)||[]).length>=3);
 assert.doesNotMatch(svg,/M13 3l4 2-4 3/);
});
test('map layer retains tile discoveries and only displays outage when no source has points',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(overlay,/const stableTileCache=new Map\(\)/);
 assert.match(overlay,/rememberMapFeatures\(stableTileCache,local\)/);
 assert.match(overlay,/cachedMapFeatures\(stableTileCache\)/);
 assert.match(overlay,/if\(!mapTilesItems\.length\)return/);
 assert.match(overlay,/mergeSources\(\);render\(\)/);
 assert.match(overlay,/setNotice\(data\?\.error&&items\.length===0/);
 assert.match(overlay,/setNotice\(items\.length===0\?/);
 assert.match(overlay,/stableTileCache\.clear\(\)/);
});
