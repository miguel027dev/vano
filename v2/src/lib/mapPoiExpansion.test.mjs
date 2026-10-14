import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ICON_THEME,iconSvg,selectPublicPins} from './mapPublicIcons.js';
import {classifyMapboxPoi} from './mapboxPoiFallback.js';
import {classifyOsm,normalizeOsmElements,overpassQuery} from '../../server/map-public-data.mjs';

const categories=["mercado","supermercado","shopping","estacao-recarga","carregador-eletrico","restaurante","fastfood","cafeteria","hotel","escola","academia","parque","petshop","correios","farmacia","lavarapido","terminal-onibus","estacao-trem","estacao-ferroviaria","aeroporto"];
test('secondary categories use 20 static safe SVG glyphs',()=>{
 for(const type of categories){
  assert.ok(ICON_THEME[type],type);
  const svg=iconSvg(type);
  assert.match(svg,/^<svg/);
  assert.match(svg,/<\/svg>$/);
  assert.ok(!/script|onerror|<image/i.test(svg));
 }
 assert.equal(ICON_THEME.academia[1],'#228C56');
 for(const existing of ['ferrovia','semaforo','estacionamento','banco','eletroposto'])
  assert.ok(ICON_THEME[existing]);
});

const cases=[
 [{shop:'supermarket'},'supermercado'],[{shop:'convenience'},'mercado'],
 [{shop:'mall'},'shopping'],[{shop:'pet'},'petshop'],
 [{amenity:'post_office'},'correios'],[{amenity:'pharmacy'},'farmacia'],
 [{amenity:'school'},'escola'],[{amenity:'restaurant'},'restaurante'],
 [{amenity:'fast_food'},'fastfood'],[{amenity:'cafe'},'cafeteria'],
 [{amenity:'car_wash'},'lavarapido'],[{amenity:'charging_station'},'estacao-recarga'],
 [{amenity:'charging_point'},'carregador-eletrico'],[{tourism:'hotel'},'hotel'],
 [{leisure:'fitness_centre'},'academia'],[{leisure:'park'},'parque'],
 [{amenity:'bus_station'},'terminal-onibus'],
 [{railway:'station'},'estacao-ferroviaria'],
 [{railway:'station',station:'subway'},'estacao-trem'],
 [{aeroway:'aerodrome'},'aeroporto']];
test('OSM metadata provides every POI without fabricating businesses',()=>{
 for(const [tags,type] of cases)assert.equal(classifyOsm(tags)?.[0],type,JSON.stringify(tags));
 assert.equal(classifyOsm({shop:'wholesale'}),null);
 assert.equal(classifyOsm({highway:'bus_stop'}),null);
 const features=normalizeOsmElements(cases.map(([tags],i)=>({
  id:i+1,type:'node',lon:-46.68+i*.0004,lat:-23.58,tags
 })));
 assert.ok(features.some(x=>x.type==='academia'));
 assert.ok(features.some(x=>x.type==='escola'));
 assert.ok(features.every(x=>ICON_THEME[x.type]));
});
test('bounded OSM query includes parks, schools and shops via real mapped tags',()=>{
 const query=overpassQuery([-46.70,-23.59,-46.68,-23.57]);
 for(const tag of ['fitness_centre','supermarket','restaurant','charging_point','aerodrome','car_wash','post_office'])
  assert.ok(query.includes(tag),tag);
 assert.ok(query.includes('nwr['));
 assert.match(query,/out center 700;/);
});
test('Mapbox category metadata maps new POIs but never guesses by merchant name',()=>{
 for(const [properties,kind] of [
  [{maki:'grocery'},'mercado'],[{maki:'grocery',category_en:'Supermarket'},'supermercado'],
  [{maki:'fast-food'},'fastfood'],[{maki:'school'},'escola'],[{maki:'fitness-centre'},'academia'],
  [{maki:'lodging'},'hotel'],[{maki:'charging-station'},'estacao-recarga'],
  [{maki:'bus',type:'bus station'},'terminal-onibus'],[{maki:'airport'},'aeroporto'],
  [{type:'pet shop'},'petshop'],[{type:'car wash'},'lavarapido']
 ])assert.equal(classifyMapboxPoi(properties)?.[0],kind,JSON.stringify(properties));
 assert.equal(classifyMapboxPoi({maki:'bus',type:'bus stop'}),null);
 assert.equal(classifyMapboxPoi({maki:'shop',name:'Supermercado inventado'}),null);
});
test('academia uses matching green pastel; critical services stay visible among many shops',()=>{
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 assert.match(overlay,/academia:'is-fitness'/);
 assert.match(css,/\.v40-public-pin\.is-fitness\{background:#E4F7EA/);
 const features=Array.from({length:100},(_,i)=>({id:'a'+i,type:'mercado',coords:[i*.01,0],priority:20}))
   .concat([{id:'school',type:'escola',coords:[2,1],priority:38}]);
 const selected=selectPublicPins(features,c=>({x:c[0]*100,y:c[1]*100}),15,32);
 assert.ok(selected.some(x=>x.id==='school'));
});
