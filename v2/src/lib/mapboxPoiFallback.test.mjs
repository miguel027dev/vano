import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyMapboxPoi,normalizeMapboxPois,classifyMapboxRoadPoint,normalizeMapboxRoadSignals,readMapboxPoiFeatures} from './mapboxPoiFallback.js';

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
  querySourceFeatures:(source,options)=>{calls.push([source,options.sourceLayer]);return options.sourceLayer==='road'?[{id:222,geometry:{type:'Point',coordinates:[-46.681,-23.581]},properties:{class:'traffic_signals'}}]:[point('UPA Exemplo','hospital')];}
 };
 const out=readMapboxPoiFeatures(map);
 assert.deepEqual(calls,[['vano-streets','road'],['vano-streets','poi_label']]);
 assert.equal(out.length,2);
 assert.equal(out[0].type,'semaforo');
 assert.equal(out[0].name,'Semáforo');
 assert.equal(out[1].name,'UPA Exemplo');
 assert.deepEqual(readMapboxPoiFeatures({...map,isStyleLoaded:()=>false}),[]);
});
test('UI keeps local POIs on Overpass failure and refreshes tiles after camera idle',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert.match(overlay,/readMapboxPoiFeatures\(map\)/);
 assert.match(overlay,/rememberMapFeatures\(stableTileCache,local\)/);
 assert.match(overlay,/mapTilesItems=cachedMapFeatures\(stableTileCache\)/);
 assert.match(overlay,/map\.on\('idle',updateVectorPoi\)/);
 assert.match(overlay,/map\.off\('idle',updateVectorPoi\)/);
 assert.match(overlay,/remoteItems=Array\.isArray/);
 assert.match(app,/!map&&<BrandSplash\/>/);
 assert.match(app,/v42-map-bootstrap/);
 assert.match(html,/class="v42-preboot"/);
 assert.match(html,/<div id="root"><\/div>/);
 assert.match(html,/#root:not\(:empty\) \+ \.v42-preboot\{display:none\}/);
});

test('Mapbox Streets road points provide traffic lights and level crossings without Overpass',()=>{
 assert.equal(classifyMapboxRoadPoint({class:'traffic_signals'})[0],'semaforo');
 assert.equal(classifyMapboxRoadPoint({class:'level_crossing'})[0],'ferrovia');
 assert.equal(classifyMapboxRoadPoint({class:'roundabout'})[0],'rotatoria');
 assert.equal(classifyMapboxRoadPoint({type:'mini_roundabout'})[0],'rotatoria');
 assert.equal(classifyMapboxRoadPoint({class:'primary'}),null);
 const nodes=[
   {id:10,geometry:{type:'Point',coordinates:[-46.682,-23.581]},properties:{class:'traffic_signals'}},
   {id:11,geometry:{type:'Point',coordinates:[-46.682,-23.581]},properties:{class:'traffic_signals'}},
   {id:12,geometry:{type:'Point',coordinates:[-46.679,-23.584]},properties:{class:'level_crossing'}},
   {id:13,geometry:{type:'Point',coordinates:[-46.677,-23.583]},properties:{class:'roundabout'}},
   {id:14,geometry:{type:'LineString',coordinates:[[-46.677,-23.583],[-46.676,-23.581]]},properties:{class:'traffic_signals'}},
   {id:15,geometry:{type:'Point',coordinates:[-46.676,-23.581]},properties:{class:'residential'}}
 ];
 const out=normalizeMapboxRoadSignals(nodes);
 assert.deepEqual(out.map(x=>x.type),['semaforo','ferrovia','rotatoria']);
 assert.ok(out.every(x=>x.source==='Mapbox Streets'));
 assert.ok(out.every(x=>x.verified===false));
 assert.ok(out.every(x=>x.type!=='radar'));
});
test('signage remains when no POI labels exist in loaded vector tiles',()=>{
 const calls=[];
 const map={
   getStyle:()=>({sources:{streets:{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'}}}),
   isStyleLoaded:()=>true,
   querySourceFeatures:(_,options)=>{
    calls.push(options.sourceLayer);
    if(options.sourceLayer==='poi_label')return [];
    return [{id:100,geometry:{type:'Point',coordinates:[-46.68,-23.58]},properties:{class:'traffic_signals'}}];
   }
 };
 const out=readMapboxPoiFeatures(map);
 assert.deepEqual(out.map(x=>x.type),['semaforo']);
 assert.deepEqual(calls,['road','poi_label']);
});

test('older Mapbox source query rejects an expression filter but still supplies real signal points',()=>{
 const methods=[];
 const map={
  isStyleLoaded:()=>true,
  getStyle:()=>({sources:{s:{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'}}}),
  querySourceFeatures:(_,options)=>{
   methods.push(options.sourceLayer+(options.filter?'-filtered':'-all'));
   if(options.sourceLayer==='poi_label')return [];
   if(options.filter)throw new Error('Unsupported filter');
   return [
    {geometry:{type:'LineString',coordinates:[[-46.681,-23.581],[-46.679,-23.580]]},properties:{class:'primary'}},
    {geometry:{type:'Point',coordinates:[-46.681,-23.581]},properties:{class:'traffic_signals'}}
   ];
  }
 };
 assert.deepEqual(readMapboxPoiFeatures(map).map(x=>x.type),['semaforo']);
 assert.deepEqual(methods,['road-filtered','road-all','poi_label-all']);
});
