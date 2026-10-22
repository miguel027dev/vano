import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateRoadSignCandidates} from './privateRoadSigns.js';
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
test('street/avenue turn cards migrate to /mapa without exposing admin tools',()=>{
 const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(app,/path="\/v2"[\s\S]*?user\?\.isAdmin===true/);
 assert.match(map,/location\.pathname==='\/v2'&&user\?\.isAdmin===true/);
 assert.match(map,/const navigationRoadSigns=jevMode&&active&&routeVehicle!=='a-pe'/);
 assert.match(map,/privateRoadSigns=\{navigationRoadSigns\}/);
 assert.match(map,/routeTraffic=\{adminV2RoadSigns&&/);
 assert.match(map,/\{adminV2RoadSigns&&roadAuditOpen&&<RoadAuditPanel/);
});

test('real map plaques stay informational and do not guess a street or print code',()=>{
 const signs=privateRoadSignCandidates({steps:[step('Av. Paulista',pt)]},{stepIndex:0,distance:20});
 assert.equal(signs[0].street,'Av. Paulista');
 assert.deepEqual(privateRoadSignCandidates({steps:[step('<img src=x>',pt)]},{stepIndex:0,distance:20}),[]);
 assert.deepEqual(privateRoadSignCandidates({steps:[step('Rua Inventada',pt,'straight')]},{stepIndex:0,distance:20}),[]);
 const source=readFileSync(new URL('./privateRoadSigns.js',import.meta.url),'utf8');
 assert.match(source,/label.textContent=item.street/);
 assert.match(source,/data\?\.active!==true/);
 assert.match(source,/data\?\.vehicle==='a-pe'/);
 assert.match(source,/x.coords,x.signalNearby/);
});
