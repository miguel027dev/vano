import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateRoadSignCandidates,isAvenueName,syncPrivateRoadSignMarkers,clearPrivateRoadSignMarkers} from './privateRoadSigns.js';
const pt=[-46.72,-23.62];
const step=(street,loc=pt,modifier='left')=>({street,location:loc,type:'turn',modifier});
const route={steps:[step('R. Ernest Renan'),step('Av. Giovanni Gronchi',[-46.718,-23.6201],'right')]};
test('admin sign shows only provider street at the actual maneuver',()=>{
 const signs=privateRoadSignCandidates(route,{stepIndex:0,distance:60});
 assert.equal(signs.length,1);
 assert.equal(signs[0].street,'R. Ernest Renan');
 assert.deepEqual(signs[0].coords,pt);
});
test('ignores invalid, far, departure and nameless steps',()=>{
 assert.deepEqual(privateRoadSignCandidates(route,{stepIndex:0,distance:700}),[]);
 assert.deepEqual(privateRoadSignCandidates({steps:[step('<script>alert(1)</script>',null)]},{stepIndex:0,distance:35}),[]);
 assert.deepEqual(privateRoadSignCandidates({steps:[{...step('Unnamed road'),type:'depart'}]},{stepIndex:0,distance:35}),[]);
 assert.deepEqual(privateRoadSignCandidates({steps:[step('Sem nome')]},{stepIndex:0,distance:35}),[]);
});
test('does not attribute a traffic light without trustworthy location evidence',()=>{
 const guidance={stepIndex:0,distance:60};
 assert.equal(privateRoadSignCandidates(route,guidance,[{type:'semaforo',coords:[-46.725,-23.62],source:'Mapbox Streets'}])[0].signalNearby,false);
 assert.equal(privateRoadSignCandidates(route,guidance,[{type:'semaforo',coords:pt,source:'Community report'}])[0].signalNearby,false);
 assert.equal(privateRoadSignCandidates(route,guidance,[{type:'semaforo',coords:pt,source:'Mapbox Streets'}])[0].signalNearby,true);
});
test('secondary labels require real following data and screen separation',()=>{
 const guidance={stepIndex:0,distance:60,following:{stepIndex:1,gapMeters:120}};
 assert.equal(privateRoadSignCandidates(route,guidance,[],()=>({x:0,y:0})).length,1);
 assert.equal(privateRoadSignCandidates(route,guidance,[],p=>({x:p[0]*100000,y:p[1]*100000})).length,2);
 assert.equal(privateRoadSignCandidates(route,{...guidance,following:{stepIndex:1,gapMeters:12}}).length,1);
});
test('administrator V2 route stays role gated; public /mapa signs require active GPS navigation',()=>{
 const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(app,/path="\/v2"[\s\S]*?user\?\.isAdmin===true/);
 assert.match(map,/location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
 assert.match(map,/privateRoadSigns=\{roadSignsEnabled\}/);
 assert.match(map,/const publicRoadSigns=location\.pathname==='\/mapa'&&active&&navMode&&/);
 assert.match(map,/hasLiveGPS&&!simActive&&routeVehicle!=='a-pe'&&routeData\?\.source!=='demonstracao'/);
});

test('avenue title detection emphasizes trusted road type, not arbitrary user input',()=>{
 assert.equal(isAvenueName('Av. Giovanni Gronchi'),true);
 assert.equal(isAvenueName('Avenida Paulista'),true);
 assert.equal(isAvenueName('Rua Augusta'),false);
 const signs=privateRoadSignCandidates({steps:[step('Avenida Paulista')]},{stepIndex:0,distance:40});
 assert.equal(signs[0].avenue,true);
});
test('reroute with same step and name but different coordinate replaces stale map marker',()=>{
 const previousDocument=globalThis.document,markers=[];
 class Marker{
  constructor({element}){this.element=element;this.removed=false;markers.push(this);}
  setLngLat(point){this.point=point;return this;}
  addTo(){return this;}
  remove(){this.removed=true;}
 }
 const makeElement=()=>({
  dataset:{},className:'',children:[],
  setAttribute(){},appendChild(child){this.children.push(child);},
  textContent:''
 });
 globalThis.document={createElement:makeElement};
 const map={project:p=>({x:p[0]*100000,y:p[1]*100000})};
 const data={privateRoadSigns:true,navigation:true,routes:[{id:'fast',steps:[step('Av. Paulista',[-46.65,-23.56])]}],
   selectedRoute:'fast',guidance:{stepIndex:0,distance:40},appearance:'light'};
 try{
  syncPrivateRoadSignMarkers(map,{Marker},data);
  assert.equal(markers.length,1);
  assert.equal(markers[0].point[0],-46.65);
  syncPrivateRoadSignMarkers(map,{Marker},{...data,routes:[{id:'fast',steps:[step('Av. Paulista',[-46.64,-23.57])]}]});
  assert.equal(markers.length,2);
  assert.equal(markers[0].removed,true);
  assert.equal(markers[1].point[0],-46.64);
  syncPrivateRoadSignMarkers(map,{Marker},{...data,navigation:false});
  assert.equal(markers[1].removed,true);
 }finally{clearPrivateRoadSignMarkers(map);globalThis.document=previousDocument;}
});
