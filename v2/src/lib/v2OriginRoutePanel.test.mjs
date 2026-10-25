import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');

test('destination selected without accepted GPS or manual origin requests a map origin first',()=>{
 assert.match(file,/const origin=manualCoords\|\|userCoords;/);
 assert.match(file,/if\(!validPoint\(origin\)\)\{\s*awaitingGpsDestination\.current=true;/);
 assert.match(file,/setSheetOpen\(false\);setLoadingRoute\(false\);setRouteError\(''\);setPickOriginMode\(true\);/);
 assert.match(file,/Para calcular a rota até \{dest\?\.name\|\|'o destino'\}/);
 assert.match(file,/O GPS é opcional\./);
 assert.match(file,/Escolher origem no mapa/);
 assert.match(file,/Tentar GPS/);
});

test('origin picker and route choice sheet are mutually exclusive',()=>{
 assert.match(file,/b1User\?<B1RouteSheet/);
 assert.match(file,/\}:<div className="route-sheet">/);
 assert.match(file,/\{!navMode&&!searchOpen&&pickOriginMode&&<div className="gps-banner gps-picking"/);
});

test('missing origin does not start provider requests or display stale failure state',()=>{
 assert.match(file,/if\(!validPoint\(departure\)\|\|!validPoint\(place\?\.coords\)\)\{\s*\/\/ Origin is not an API failure/);
 assert.match(file,/routeEpoch\.current\+\+;\s*routeRequest\.current\?\.abort\(\);\s*setLoadingRoute\(false\);setRouteData\(null\);setRouteError\(''\);/);
 assert.match(file,/setRouteError\(''\);setLoadingRoute\(false\);\s*if\(dest\)\{setSheetOpen\(false\);setPickOriginMode\(true\);\}/);
 assert.match(file,/routeError\|\|t\('Não foi possível calcular o trajeto agora\.'\)/);
});

test('a real map-chosen origin still calculates a route and GPS remains optional',()=>{
 assert.match(file,/function chooseOrigin\(coords,label='Origem selecionada no mapa'\)/);
 assert.match(file,/setManualCoords\(coords\)/);
 assert.match(file,/if\(dest\)\{if\(b1User\)/);
 assert.match(file,/else calculateRoute\(dest,coords\);/);
 assert.match(file,/onPickOrigin=\{chooseOrigin\}/);
 assert.match(file,/onClick=\{\(\)=>requestGPS\(true\)\}/);
});
