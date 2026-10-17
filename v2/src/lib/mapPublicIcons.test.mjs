import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iconSvg,iconMeta,ICON_THEME,selectPublicPins,publicPinDensity,mapFeatureBBox,mapRadarBBox} from './mapPublicIcons.js';

test('every supported map category has a static safe icon for light mode',()=>{
 assert.ok(Object.keys(ICON_THEME).length>=17);
 for(const category of Object.keys(ICON_THEME)){
   const svg=iconSvg(category);
   assert.match(svg,/^<svg/);
   assert.match(svg,/<\/svg>$/);
   assert.ok(!svg.includes('<script'));
 }
 assert.ok(iconSvg('radar').includes('circle'));
});
test('works and verified works reports share a detailed amber barricade icon',()=>{
 const roadwork=iconSvg('obra');
 assert.equal(iconMeta('obra')[1],'#fa8021');
 assert.equal(iconMeta('relato-obra')[0],'works');
 assert.equal(iconSvg('relato-obra').includes('M7.6 7.9'),true);
 assert.ok(roadwork.includes('rect x="3.1"'));
 assert.ok(roadwork.includes('M7.6 7.9'));
 assert.ok(roadwork.includes('fill="#FFF4DE"'));
 assert.ok(!roadwork.includes('script'));
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 assert.ok(overlay.includes("obra:'is-works','relato-obra':'is-works'"));
 assert.ok(css.includes('.v40-public-pin.is-works'));
 assert.ok(css.includes('#FFEDCB'));
 assert.ok(css.includes('.v40-public-touch:focus-visible'));
});
test('safety critical radar appears first even amid overlapping less important features',()=>{
 const features=[
  {id:'hospital',type:'hospital',priority:50,coords:[0,0]},
  {id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'work',type:'obra',priority:60,coords:[1,0]}
 ];
 const selected=selectPublicPins(features,coords=>({x:coords[0]*100,y:coords[1]*100}),15,20);
 assert.deepEqual(selected.map(x=>x.id),['radar','work']);
});
test('all mapped categories remain available independently of zoom',()=>{
 const features=[{id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'p',type:'estacionamento',priority:22,coords:[1,1]}];
 const project=c=>({x:c[0]*100,y:c[1]*100});
 assert.deepEqual(selectPublicPins(features,project,12).map(x=>x.id),['radar','p']);
 assert.deepEqual(selectPublicPins(features,project,14).map(x=>x.id),['radar','p']);
 assert.deepEqual(selectPublicPins(features,project,16).map(x=>x.id),['radar','p']);
});
test('mobile pin coordinates are bounded to a safe viewport query',()=>{
 const map={
  getZoom:()=>17,
  getCenter:()=>({lng:-46.68,lat:-23.58}),
  getBounds:()=>({getEast:()=>-46.50,getWest:()=>-46.80,getNorth:()=>-23.45,getSouth:()=>-23.75})
 };
 const b=mapFeatureBBox(map,'mapbox');
 assert.ok(b[2]-b[0]<=.056001&&b[3]-b[1]<=.050001);
 assert.ok(mapFeatureBBox({...map,getZoom:()=>12.4},'leaflet'));
 assert.equal(mapFeatureBBox({...map,getZoom:()=>11},'leaflet'),null);
});
test('map overlay keeps GPS geometry, Mapbox native credits and compact extra OSM credit',()=>{
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 assert.match(component,/attachPublicMapOverlay\(map,backend.current,\(\)=>latest.current.navigation\)/);
 assert.match(component,/detachPublicPins\?\.\(\)/);
 assert.match(overlay,/map.on\('moveend',schedule\)/);
 assert.match(overlay,/map.off\('moveend',schedule\)/);
 assert.match(overlay,/marker\.setPopup/);
 assert.match(overlay,/marker\.bindPopup/);
 assert.match(overlay,/credit\.textContent='OSM'/);
 assert.match(overlay,/osmLogo\.src=/);
 assert.match(component,/attributionControl:true/);
 assert.match(overlay,/credit\.title='Fontes e licenças: OpenStreetMap \(ODbL 1\.0\) e ANTT \(CC BY 4\.0\)\.'/);
 assert.match(overlay,/credit\.setAttribute\('aria-label'/);
 assert.match(css,/width:44px;height:44px/);
 assert.match(css,/@media\(max-width:370px\)/);
});

test('normal VANO launch zoom includes radar and essential services without filling every cell',()=>{
 const points=[{id:'radar',type:'radar',priority:100,coords:[0,0]},
  {id:'hospital',type:'hospital',priority:58,coords:[1,0]},
  {id:'bombeiros',type:'bombeiros',priority:56,coords:[2,0]},
  {id:'estacionamento',type:'estacionamento',priority:22,coords:[3,0]}];
 const project=coords=>({x:coords[0]*120+20,y:120});
 assert.deepEqual(selectPublicPins(points,project,12.4,20,{width:400,height:250}).map(x=>x.id),
  ['radar','hospital','bombeiros','estacionamento']);
});
test('bad source is recoverable and does not silently retain a 130-second blank-map state',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(overlay,/v41-public-status/);
 assert.match(overlay,/Sinalização pública não carregada/);
 assert.match(overlay,/setNotice\(data\?\.error&&items\.length===0/);
 assert.match(overlay,/lastRead=0;latestKey=''/);
 assert.match(overlay,/selectPublicPins\(items,project,zoom,markerBudget,\{width:/);
});


test('four custom VANO secondary icons use the exact Lucide outlines and colors',()=>{
 const glyphs={
  travessia:['#283440','m9 20 3-6 3 6'],
  estacionamento:['#3979BC','M9 17V7h4'],
  ferrovia:['#CB713E','M8 3.1V7'],
  banco:['#596675','M10 18v-7']
 };
 for(const [type,[color,path]]of Object.entries(glyphs)){
  assert.equal(iconMeta(type)[1],color);
  assert.ok(iconSvg(type).includes(path),type);
 }
});

test('Paulista viewport scales down semaphores without blanking the map',()=>{
 const mobile={width:390,height:780},desktop={width:1440,height:900};
 const m=publicPinDensity(mobile,15,300),d=publicPinDensity(desktop,15,300);
 assert.ok(m.total<=31 && m.total>=18);
 assert.ok(m.signalMax<=5 && m.signalMax>=2);
 assert.ok(d.total>m.total && d.signalMax>m.signalMax);
 assert.ok(m.roadMax<m.total/2);
 const project=([lng,lat])=>({x:lng/.0008*23+18,y:lat/.0008*23+20});
 const semaphores=Array.from({length:400},(_,i)=>({
  id:'sem'+i,type:'semaforo',priority:88,
  coords:[(i%25)*.0008,Math.floor(i/25)*.0008]
 }));
 const points=[
  {id:'radar',type:'radar',priority:100,coords:[.008,.008]},
  {id:'danger',type:'relato-risco',priority:90,coords:[.011,.008]},
  {id:'school',type:'escola',priority:38,coords:[.009,.014]},
  {id:'pharmacy',type:'farmacia',priority:43,coords:[.003,.013]},
  {id:'market',type:'mercado',priority:22,coords:[.006,.020]}
 ];
 const selected=selectPublicPins([...semaphores,...points],project,15,300,mobile);
 assert.ok(selected.length<=m.total);
 assert.ok(selected.filter(x=>x.type==='semaforo').length<=m.signalMax);
 for(const id of ['radar','danger','school','pharmacy','market'])
  assert.ok(selected.some(x=>x.id===id),'missing '+id);
 assert.equal(selected[0].id,'radar');
});
test('semaphores stay farther apart than ordinary POIs in dense city blocks',()=>{
 const view={width:1200,height:900},project=([x,y])=>({x:x*18+8,y:y*18+8});
 const sem=Array.from({length:450},(_,i)=>({
  id:'s'+i,type:'semaforo',priority:88,coords:[i%50,Math.floor(i/50)]
 }));
 const selected=selectPublicPins(sem,project,17,450,view);
 const rules=publicPinDensity(view,17,450);
 assert.ok(selected.length<=rules.signalMax);
 for(let i=0;i<selected.length;i++)for(let j=0;j<i;j++){
  const p=project(selected[i].coords),q=project(selected[j].coords);
  assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=rules.signalSpacing);
 }
});
test('POI density is stable for identical data regardless of source ordering',()=>{
 const data=Array.from({length:80},(_,i)=>({
  id:'feature'+i,type:i%3===0?'semaforo':i%3===1?'restaurante':'supermercado',
  priority:i%3===0?88:25,coords:[i%20*.002,Math.floor(i/20)*.002]
 }));
 const project=([x,y])=>({x:x*9000+30,y:y*9000+30});
 const view={width:680,height:520};
 const a=selectPublicPins(data,project,16,100,view).map(x=>x.id);
 const b=selectPublicPins([...data].reverse(),project,16,100,view).map(x=>x.id);
 assert.deepEqual(a,b);
});
test('restaurants survive many supermarkets and the new glyphs remain recognisable',()=>{
 const businesses=[
  ...Array.from({length:70},(_,i)=>({id:'market'+i,type:'supermercado',priority:27,coords:[i%10*.005,Math.floor(i/10)*.005]})),
  ...Array.from({length:16},(_,i)=>({id:'meal'+i,type:'restaurante',priority:20,coords:[.10+i%8*.005,Math.floor(i/8)*.005] }))
 ];
 const selected=selectPublicPins(businesses,([x,y])=>({x:x*4000+15,y:y*4000+20}),17,100,{width:850,height:720});
 assert.ok(selected.some(x=>x.type==='supermercado'));
 assert.ok(selected.some(x=>x.type==='restaurante'));
 for(const t of ['hotel','restaurante','fastfood','petshop','escola']){
  assert.match(iconSvg(t),/<path/);
  assert.ok(iconSvg(t).length>130);
 }
 assert.match(iconSvg('petshop'),/cx="19.5"/);
 assert.match(iconSvg('escola'),/<circle cx="12" cy="9"/);
 // Previously approved categories remain untouched.
 assert.match(iconSvg('shopping'),/M4 8h16/);
 assert.match(iconSvg('parque'),/m6 3-4 8/);
});

test('radar bbox includes visible London streets beyond the generic map POI crop',()=>{
 const m={
  getZoom:()=>12.3,
  getCenter:()=>({lng:-.119,lat:51.509}),
  getBounds:()=>({getWest:()=>-.205,getEast:()=>-.036,
   getSouth:()=>51.45,getNorth:()=>51.56})
 };
 const poi=mapFeatureBBox(m,'mapbox'),radar=mapRadarBBox(m);
 assert.ok(radar[0]<poi[0]&&radar[2]>poi[2]);
 assert.ok(radar[1]<poi[1]&&radar[3]>poi[3]);
 assert.ok(radar[2]-radar[0]<.3&&radar[3]-radar[1]<.3);
 assert.equal(mapRadarBBox({...m,getZoom:()=>10}),null);
});

test('official keyless regional roadworks share one work icon; incidents are not disguised as community reports',()=>{
 const svg=iconSvg('alerta-via');
 assert.ok(svg.includes('<path'));
 assert.equal(iconMeta('alerta-via')[0],'alert');
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 assert.ok(overlay.includes("void refreshRegional(bbox)"));
 assert.ok(overlay.includes("item.regional?' · atualização oficial'"));
 assert.ok(overlay.includes("rememberPublicFeatures(sourceCache,data.features"));
 assert.ok(css.includes('.v40-public-pin.is-road-alert'));
});

// Regression: the charging station glyph stays readable in a 21px map marker.
test('Open Charge Map station has one clear, unclipped charging symbol',()=>{
 const svg=iconSvg('estacao-recarga');
 assert.equal(iconMeta('estacao-recarga')[0],'charge');
 assert.match(svg,/<rect x="4\.5" y="2\.5" width="15" height="19"/);
 assert.equal((svg.match(/<path /g)||[]).length,1);
 assert.match(svg,/fill="#188E65" stroke="none"/);
 assert.ok(!svg.includes('M16 9h2'));
});

test('active road navigation hides all commerce but retains guidance and essential services',()=>{
 const types=['radar','semaforo','estacionamento','obra','relato-transito',
  'hospital','farmacia','travessia','rotatoria','alerta-via',
  'fastfood','restaurante','cafeteria','shopping','mercado','supermercado',
  'eletroposto','estacao-recarga','hotel','academia','petshop','combustivel','escola'];
 const points=types.map((type,i)=>({id:type,type,priority:100-i,coords:[i*.008,0]}));
 const project=([lng])=>({x:40+lng*2500,y:120});
 const view={width:1600,height:500};
 const selected=selectPublicPins(points,project,15,100,view,{navigation:true});
 const visible=new Set(selected.map(p=>p.type));
 for(const type of ['radar','semaforo','estacionamento','obra','relato-transito','hospital','farmacia','travessia','rotatoria','alerta-via'])
  assert.ok(visible.has(type),'navigation must keep '+type);
 for(const type of ['fastfood','restaurante','cafeteria','shopping','mercado','supermercado','eletroposto','estacao-recarga','hotel','academia','petshop','combustivel','escola'])
  assert.ok(!visible.has(type),'navigation must hide '+type);
 assert.ok(selectPublicPins(points,project,15,100,view).some(p=>p.type==='fastfood'),
  'food and commerce must remain discoverable outside navigation');
});

test('street-level exploration has fewer POI markers than a wider overview',()=>{
 const view={width:390,height:780};
 const overview=publicPinDensity(view,13,300);
 const close=publicPinDensity(view,17,300);
 assert.ok(overview.total>close.total,'zoomed-in streets should be less cluttered');
 assert.ok(close.minSpacing>overview.minSpacing,'closer zoom should spread pins farther apart');
});

test('navigation state updates public markers without remounting or refetching map',()=>{
 const component=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(component,/mapRef\.current\?\._vanoRefreshPublicPins\?\.\(\)/);
 assert.match(overlay,/navigation:Boolean\(getNavigation\(\)\)/);
 assert.match(overlay,/map\._vanoRefreshPublicPins=render/);
 assert.match(overlay,/delete map\._vanoRefreshPublicPins/);
});
