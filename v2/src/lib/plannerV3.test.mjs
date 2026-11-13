import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const search=readFileSync(new URL('../components/FullscreenDestinationSearch.jsx',import.meta.url),'utf8');
const rail=readFileSync(new URL('../components/TransportModeRail.jsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
const b1=readFileSync(new URL('../components/B1RouteSheet.jsx',import.meta.url),'utf8');

test('V3 search fills the viewport while keeping original query and results state',()=>{
  assert.match(page,/plannerV3Enabled&&searchOpen&&!dest&&<FullscreenDestinationSearch/);
  assert.match(search,/role="dialog" aria-modal="true"/);
  assert.match(search,/onChange=\{e=>onQuery\(e.target.value\)\}/);
  assert.match(search,/onClick=\{\(\)=>onPick\(place\)\}/);
  assert.match(search,/event.key==='Escape'/);
  assert.match(search,/searchRef\?\.current\?\.focus/);
});

test('supported road and walking modes exclude bicycle and disabled public transit',()=>{
  assert.match(rail,/id:'carro'/);
  assert.match(rail,/id:'moto'/);
  assert.match(rail,/id:'a-pe'/);
  assert.doesNotMatch(rail,/id:'publico'/);
  assert.doesNotMatch(rail,/id:'bicicleta'/);
  assert.match(rail,/status==='loading'/);
  assert.match(rail,/status==='unavailable'/);
  assert.match(rail,/Number.isFinite\(estimate\?\.seconds\)/);
  assert.match(b1,/plannerV3\?<TransportModeRail/);
});

test('preview uses actual vehicle route API and transit is isolated from road routing',()=>{
  assert.match(page,/routeOptions:\{adaptive:false,variantBudget:2/);
  assert.match(page,/const seconds=Math.min\(\.\.\.\(response\?\.routes/);
  assert.match(page,/controller.abort\(\)/);
  assert.doesNotMatch(page,/navigate\('\/planejar-transporte'/);
  assert.match(shell,/<Route path="\/planejar-transporte" element=\{<Navigate to="\/mapa" replace\/>\}/);
});
