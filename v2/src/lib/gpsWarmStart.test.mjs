import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readWarmGps,saveWarmGps,WARM_GPS_KEY,WARM_GPS_TTL_MS} from './gpsWarmStart.js';

function localStore(){
 const cache=new Map();
 return {
  getItem:key=>cache.has(key)?cache.get(key):null,
  setItem:(key,value)=>cache.set(key,value),
  removeItem:key=>cache.delete(key)
 };
}
const now=1_800_000_000_000;
test('a verified browser GPS point warms the map immediately on reload',()=>{
 const store=localStore();
 assert.equal(saveWarmGps(store,{coords:[-46.6574387,-23.5632388],sourceAt:now-500,accuracy:12},now),true);
 assert.deepEqual(readWarmGps(store,now),{coords:[-46.65744,-23.56324],at:now-500,accuracy:12});
});
test('expired or inaccurate GPS fixes are never shown as current or cached',()=>{
 const store=localStore();
 assert.equal(saveWarmGps(store,{coords:[-46.65,-23.56],sourceAt:now-40000,accuracy:10},now),false);
 assert.equal(saveWarmGps(store,{coords:[-46.65,-23.56],sourceAt:now,accuracy:900},now),false);
 assert.equal(saveWarmGps(store,{coords:[999,-23.56],sourceAt:now,accuracy:10},now),false);
 assert.equal(readWarmGps(store,now),null);
 assert.equal(saveWarmGps(store,{coords:[-46.65,-23.56],sourceAt:now,accuracy:20},now),true);
 assert.equal(readWarmGps(store,now+WARM_GPS_TTL_MS+10),null);
 assert.equal(store.getItem(WARM_GPS_KEY),null);
});
test('private browser storage exceptions never break GPS and invalid data is rejected',()=>{
 const blocked={getItem(){throw Error('storage disabled')},setItem(){throw Error('storage disabled')}};
 assert.equal(readWarmGps(blocked),null);
 assert.equal(saveWarmGps(blocked,{coords:[-46.6,-23.5],sourceAt:now,accuracy:8},now),false);
 const store=localStore();
 store.setItem(WARM_GPS_KEY,'{bad json');
 assert.equal(readWarmGps(store,now),null);
});
test('the cached marker never becomes an authorized route origin or live GPS',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 assert.match(page,/const displayCoords=userCoords\|\|warmCoords/);
 assert.match(page,/const origin=manualCoords\|\|userCoords/);
 assert.match(page,/userCoords=\{displayCoords\|\|origin\} gpsCoords=\{userCoords\}/);
 assert.match(page,/hasRecentGpsFix\(lastGpsFix\.current,Date\.now\(\),35000\)/);
 assert.match(page,/saveWarmGps\(window\.localStorage,fix\)/);
 assert.doesNotMatch(page,/const origin=manualCoords\|\|displayCoords/);
 assert.match(map,/position:d\.gpsCoords/);
});
test('location card stays rendered during GPS checking and remains recognizable',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');
 assert.match(page,/&&!pickOriginMode&&<div className="v31-location-card"/);
 assert.doesNotMatch(page,/validPoint\(userCoords\)\|\|gpsStatus!=='checking'/);
 assert.match(page,/Atualizando GPS · posição salva/);
 assert.match(page,/Último ponto conhecido/);
 assert.match(css,/width:min\(357px,calc\(100vw/);
 assert.match(css,/ - 105px\)\);/);
});
test('provider credits remain legible and airport glyph is symmetrical',()=>{
 const css=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');
 const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
 const icons=readFileSync(new URL('./mapPublicIcons.js',import.meta.url),'utf8');
 assert.match(css,/\.v40-map-credit\{[\s\S]*?left:calc\(env\(safe-area-inset-left,0px\) \+ 22px\);right:auto/);
 assert.match(css,/\.mapboxgl-ctrl-bottom-right/);
 assert.match(map,/attributionControl:true,logoPosition:'bottom-left'/);
 assert.match(icons,/plane:'<path d="M12 2c1\.1 0/);
});
