import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeStreetName,isNamedRoadFeature,streetCardBudget,
 visibleStreetCardCandidates,syncVisibleStreetCards,clearVisibleStreetCards} from './visibleStreetCards.mjs';

const lon=-46.72,lat=-23.58;
const project=([x,y])=>({x:220+(x-lon)*20000,y:350+(y-lat)*10000});
const line=(name,shift=0,length=.014,extra={})=>({
 properties:{name,...extra},
 layer:{id:'road-street',type:'line','source-layer':'road'},
 geometry:{type:'LineString',coordinates:[[lon-.008,lat+shift],[lon-.008+length,lat+shift]]}
});
const options={project,width:440,height:720,zoom:17};
test('safe names are provider-backed; unnamed or injected markup never becomes a label',()=>{
 assert.equal(safeStreetName({name:'  Av.   Paulista  '}),'Av. Paulista');
 assert.equal(safeStreetName({name:'<img src=x onerror=alert(1)>'}),'');
 assert.equal(safeStreetName({name:'Sem nome'}),'');
 assert.equal(safeStreetName({name:'Avenida ABC'}),'Avenida ABC');
 assert.equal(isNamedRoadFeature(line('Rua Augusta')),true);
 assert.equal(isNamedRoadFeature({...line('Rua Augusta'),layer:{id:'vano-v2-line',type:'line'}}),false);
 assert.equal(isNamedRoadFeature({...line('Rua Augusta'),geometry:{type:'Polygon',coordinates:[]}}),true);
});
test('long avenue anchor favors visible beginning; short street favors midpoint',()=>{
 const avenue=line('Av. Paulista',0,.016);
 const short=line('Rua da Paz',.012,.003);
 const cards=visibleStreetCardCandidates([avenue,short],options);
 const av=cards.find(x=>x.name==='Av. Paulista'),r=cards.find(x=>x.name==='Rua da Paz');
 assert.ok(av&&r);
 const start=avenue.geometry.coordinates[0][0];
 assert.ok(Math.abs(av.coords[0]-(start+.016*.26))<.00015);
 assert.ok(Math.abs(r.coords[0]-(short.geometry.coordinates[0][0]+.003*.5))<.00015);
 assert.equal(av.avenue,true);
});
test('viewport and zoom cull labels; same name and road-layer copies deduplicate',()=>{
 const features=[line('Rua Augusta'),line('Rua Augusta'),line('Rua Bela Cintra',.005),
  {...line('R. Fake'),layer:{id:'vano-v2-line',type:'line','source-layer':'route'}}];
 const cards=visibleStreetCardCandidates(features,options);
 assert.equal(cards.filter(c=>c.name==='Rua Augusta').length,1);
 assert.ok(cards.every(c=>c.name!=='R. Fake'));
 assert.deepEqual(visibleStreetCardCandidates(features,{...options,zoom:13.8}),[]);
 assert.ok(streetCardBudget({...options,navigation:true})<streetCardBudget(options));
});
test('labels are spread out and do not cover navigation turn cards',()=>{
 const features=[line('Avenida Paulista'),line('Rua Augusta',.0001),line('Rua Bela Cintra',.01)];
 const reserve=[[-46.72,-23.58]];
 const cards=visibleStreetCardCandidates(features,{...options,reserved:reserve});
 assert.equal(cards.filter(x=>x.name==='Avenida Paulista'||x.name==='Rua Augusta').length<=1,true);
 const nav=visibleStreetCardCandidates(features,{...options,navigation:true});
 assert.ok(nav.length<=cards.length);
});
test('existing road anchors are stable across camera moves and style refreshes',()=>{
 const first=line('Avenida Paulista',0,.016);
 const initial=visibleStreetCardCandidates([first],options)[0];
 const moved=line('Avenida Paulista',0,.016);
 moved.geometry.coordinates=moved.geometry.coordinates.map(([x,y])=>[x+.0005,y]);
 const candidates=visibleStreetCardCandidates([moved],{...options,stickyLocations:new Map([[initial.id,initial.coords]])});
 assert.deepEqual(candidates[0]?.coords,initial.coords);
});
test('DOM markers are bounded, reused, theme updates, removed when disabled; no HTML injection',()=>{
 const prior=globalThis.document,markers=[];
 class Marker{
  constructor({element}){this.element=element;this.removed=false;markers.push(this);}
  setLngLat(coords){this.coords=coords;return this;}
  addTo(){return this;}
  remove(){this.removed=true;}
 }
 const createElement=tag=>({tag,dataset:{},children:[],
  setAttribute(){},appendChild(el){this.children.push(el);},
  textContent:'',className:''});
 globalThis.document={createElement};
 const map={getZoom:()=>17,getCanvas:()=>({clientWidth:440,clientHeight:720}),
   getStyle:()=>({layers:[{id:'road-street',type:'line','source-layer':'road'}]}),
   queryRenderedFeatures:()=>[line('Avenida Paulista')],
   project};
 try{
  syncVisibleStreetCards(map,{Marker},{active:true,roadCards:true,appearance:'light'});
  assert.equal(markers.length,1);
  assert.equal(markers[0].element.children[0].textContent,'Avenida Paulista');
  syncVisibleStreetCards(map,{Marker},{active:true,roadCards:true,appearance:'dark'});
  assert.equal(markers.length,1);
  assert.equal(markers[0].element.dataset.theme,'dark');
  syncVisibleStreetCards(map,{Marker},{active:false,roadCards:true});
  assert.equal(markers[0].removed,true);
  assert.equal(map._vanoVisibleStreetCards,undefined);
 }finally{clearVisibleStreetCards(map);globalThis.document=prior;}
});
test('mapa/v2 controls require feature enablement, and do not touch route or GPS engine',()=>{
 const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const renderer=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('./visibleStreetCards.mjs',import.meta.url),'utf8');
 assert.match(map,/roadCards=\{jevMode&&import\.meta\.env\.VITE_VISIBLE_STREET_CARDS!=='0'\}/);
 assert.match(renderer,/map\.on\('idle',scheduleVisibleCards\)/);
 assert.match(renderer,/clearVisibleStreetCards\(map\)/);
 assert.doesNotMatch(overlay,/\/api\/route|setRouteData|setChoice\(|window\.localStorage|innerHTML|fetch\(/);
});
