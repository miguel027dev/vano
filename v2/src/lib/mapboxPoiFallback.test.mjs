import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMapboxPoi,normalizeMapboxPois,readMapboxPoiFeatures} from './mapboxPoiFallback.js';

const point=(name,maki,id=1,x=-46.681,y=-23.581)=>({
 id,geometry:{type:'Point',coordinates:[x,y]},properties:{name,maki}
});
test('categorizes only real Mapbox Streets POIs with valid categories',()=>{
 assert.equal(classifyMapboxPoi({maki:'hospital'})[0],'hospital');
 assert.equal(classifyMapboxPoi({maki:'fire-station'})[0],'bombeiros');
 assert.equal(classifyMapboxPoi({maki:'fuel'})[0],'combustivel');
 assert.equal(classifyMapboxPoi({maki:'parking'})[0],'estacionamento');
 assert.equal(classifyMapboxPoi({type:'Hospital'})[0],'hospital');
 assert.equal(classifyMapboxPoi({type:'Restaurant'}),null);
 assert.equal(classifyMapboxPoi({}),null);
});
test('normalizes duplicated vector tile POIs without making up radars or signals',()=>{
 const features=[point('Hospital Municipal','hospital'),point('Hospital Municipal','hospital',1),
  point('Posto', 'fuel',2,-46.683,-23.584),point('Unlisted','restaurant',3)];
 const out=normalizeMapboxPois(features);
 assert.deepEqual(out.map(x=>x.type),['hospital','combustivel']);
 assert.ok(out.every(x=>x.source==='Mapbox Streets'));
 assert.ok(out.every(x=>x.verified===false));
 assert.ok(out.every(x=>x.type!=='radar'&&x.type!=='semaforo'));
});
test('reads loaded Mapbox Streets v8 vector source without fetching another network endpoint',()=>{
 const calls=[];
 const map={
  getStyle:()=>({sources:{'vano-streets':{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'},
    satellite:{type:'raster',url:'mapbox://other'}}}),
  isStyleLoaded:()=>true,
  querySourceFeatures:(source,options)=>{calls.push([source,options.sourceLayer]);return [point('UPA Exemplo','hospital')];}
 };
 const out=readMapboxPoiFeatures(map);
 assert.deepEqual(calls,[['vano-streets','poi_label']]);
 assert.equal(out.length,1);
 assert.equal(out[0].name,'UPA Exemplo');
 assert.deepEqual(readMapboxPoiFeatures({...map,isStyleLoaded:()=>false}),[]);
});
test('UI keeps local POIs on Overpass failure and refreshes tiles after camera idle',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert.match(overlay,/readMapboxPoiFeatures\(map\)/);
 assert.match(overlay,/mapTilesItems=local;mergeSources\(\);render\(\)/);
 assert.match(overlay,/map\.on\('idle',updateVectorPoi\)/);
 assert.match(overlay,/map\.off\('idle',updateVectorPoi\)/);
 assert.match(overlay,/remoteItems=Array\.isArray/);
 assert.match(app,/!map&&<BrandSplash\/>/);
 assert.match(app,/v42-map-bootstrap/);
 assert.match(html,/class="v42-preboot"/);
 assert.match(html,/<div id="root"><\/div>/);
 assert.match(html,/#root:not\(:empty\) \+ \.v42-preboot\{display:none\}/);
});
