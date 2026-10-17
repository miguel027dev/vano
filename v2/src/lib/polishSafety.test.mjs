import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const map=source('../pages/MapPage.jsx');
const app=source('../App.jsx');
const profile=source('../pages/ProfilePage.jsx');
const context=source('../context.jsx');
const recovery=source('../components/AppErrorBoundary.jsx');
const css=source('../v31-map-address.css');

test('obsolete route calculations are cancellable and time-bounded',()=>{
  const begin=map.indexOf('async function calculateRoute(');
  const end=map.indexOf('function chooseRouteVehicle(',begin);
  assert.ok(begin>=0&&end>begin);
  const calculate=map.slice(begin,end);
  assert.match(calculate,/routeRequest\.current\?\.abort\(\)/);
  assert.match(calculate,/signal:controller\.signal/);
  assert.match(calculate,/setTimeout\(\(\)=>\{timedOut=true;controller\.abort\(\);\},45000\)/);
  assert.match(calculate,/clearTimeout\(timeout\)/);
  assert.match(calculate,/epoch===routeEpoch\.current&&!controller\.signal\.aborted/);
  assert.match(calculate,/Array\.isArray\(data\?\.routes\)/);
});

test('initial route failure keeps the destination and offers a retry without reload',()=>{
  assert.match(map,/setRouteError\(message\)/);
  assert.match(map,/role="alert"><p>\{routeError\|\|/);
  assert.match(map,/onClick=\{\(\)=>calculateRoute\(dest,origin,routeVehicle\)\}/);
  assert.match(map,/routeRequest\.current\?\.abort\(\);setRouteError\(''\)/);
});

test('unverified safe-route claims disclose missing proof and provider coverage',()=>{
  assert.match(map,/r\.id==='safe'&&!r\.verifiedSafety\?t\('Segurança não verificada'\)/);
  assert.match(map,/r\.verifiedSafety\?'Mais segura':'Rota alternativa'/);
  assert.match(map,/choice==='safe'&&routeVehicle!=='a-pe'/);
  assert.match(map,/routeData\.safetyMessage\|\|/);
  assert.match(map,/Nenhuma rota garante segurança absoluta/);
});

test('search address labels wrap without clipping inside existing cards',()=>{
  assert.match(css,/\.v32-suggestion small\{[^}]*white-space:normal;overflow-wrap:anywhere/);
});
test('system theme follows OS changes and logout errors do not disappear silently',()=>{
  assert.match(app,/media\?\.addEventListener\?\.\('change',apply\)/);
  assert.match(app,/media\?\.removeEventListener\?\.\('change',apply\)/);
  assert.match(profile,/catch\(error\)\{setToast\(error\?\.message/);
});

test('autocomplete is stable across tiny GPS motion and times out without blocking the screen',()=>{
  assert.match(map,/const searchBias=searchGeoBias\(userCoords/);
  assert.match(map,/\[query,searchOpen,allPlaces,language,searchBias\]/);
  assert.match(map,/\[editor,editorQuery,allPlaces,language,searchBias\]/);
  assert.doesNotMatch(map,/\[query,searchOpen,allPlaces,language,usingManual,gpsStatus,userCoords/);
  assert.match(map,/setSearchError\('A busca demorou a responder\. Tente novamente\.'\)/);
  assert.match(map,/setEditorError\('A busca demorou\. Tente novamente\.'\)/);
  assert.match(map,/clearTimeout\(deadline\)/);
});

test('stalled session bootstrap cannot keep the initial screen loading forever',()=>{
  assert.match(context,/const deadline=setTimeout\(\(\)=>controller\.abort\(\),35000\)/);
  assert.match(context,/api\('\/bootstrap',\{signal:controller\.signal\}\)/);
  assert.match(context,/clearTimeout\(deadline\);setLoading\(false\)/);
  assert.doesNotMatch(recovery,/O mapa encontrou um problema de renderização/);
  assert.match(recovery,/Esta tela encontrou um problema de renderização/);
});
