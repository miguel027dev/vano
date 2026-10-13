import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../v31-map-address.css',import.meta.url),'utf8');

test('map is always rendered and GPS wait cannot lock the screen behind a grid',()=>{
 assert.doesNotMatch(map,/maskInitialMap/);
 assert.doesNotMatch(map,/v38-map-first-fix-mask/);
 assert.doesNotMatch(map,/setInitialMapLocated/);
 assert.match(map,/className=\{\`map-container /);
 assert.match(page,/awaitingInitialGps=\{gpsStatus==='checking'&&!validPoint\(origin\)\}/);
});
test('first real GPS camera placement is immediate, with no animated flight from a provisional city',()=>{
 const begin=map.indexOf('function centerOnFirstGpsFix()');
 const end=map.indexOf("const [error,setError]",begin);
 assert.ok(begin>0&&end>begin);
 const center=map.slice(begin,end);
 assert.match(center,/validPoint\(d\.userCoords\)/);
 assert.match(center,/map\.jumpTo\(\{center:d\.userCoords/);
 assert.doesNotMatch(center,/map\.easeTo|map\.flyTo|duration:550/);
 assert.doesNotMatch(center,/isLoaded\(map\)/);
 assert.doesNotMatch(center,/freeLook/);
 assert.match(center,/map\.setView\(ll\(d\.userCoords\).*animate:false/);
});
test('initial GPS wait does not put a giant warning banner over search',()=>{
 assert.match(page,/!validPoint\(origin\)&&gpsStatus!=='checking'&&<div className="gps-banner"/);
 assert.match(page,/\(validPoint\(userCoords\)\|\|gpsStatus!=='checking'\)&&<div className="v31-location-card"/);
 assert.match(page,/className="map-search v31-search"/);
});
test('arrival dock is reduced in height and desktop width without hiding GPS warnings',()=>{
 assert.match(css,/max-width:540px/);
 assert.match(css,/min-height:82px/);
 assert.match(css,/font:800 clamp\(35px,8\.8vw,46px\)/);
 assert.match(css,/padding:11px clamp\(14px,3vw,22px\)/);
 assert.match(page,/Aguardando sinal GPS confiável/);
 assert.match(page,/className="nav-bottom v37-nav-bottom"/);
 assert.match(page,/className="v36-nav-road-row"/);
});
