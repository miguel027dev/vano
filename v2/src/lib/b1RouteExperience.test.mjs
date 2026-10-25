import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const sheet=readFileSync(new URL('../components/B1RouteSheet.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../components/VanoMap.jsx',import.meta.url),'utf8');

test('B1 only changes user /mapa route sheet; admin /v2 remains available',()=>{
  assert.match(page,/const b1User=location\.pathname==='\/mapa'/);
  assert.match(page,/b1User\?<B1RouteSheet/);
  assert.match(page,/\/>:<div className="route-sheet">/);
  assert.match(page,/adminV2RoadSigns&&/);
});
test('address selection shows transport before asking the route provider',()=>{
  assert.match(page,/if\(b1User\)\{b1CameraArmed\.current=false;setB1Stage\('transport'\);setSheetOpen\(true\);return;\}/);
  assert.match(page,/onVehicle=\{chooseB1Vehicle\}/);
  assert.match(page,/calculateRoute\(dest,origin,vehicle\)/);
  assert.match(sheet,/onClick=\{\(\)=>onVehicle\('carro'\)\}/);
  assert.match(sheet,/onClick=\{\(\)=>onVehicle\('moto'\)\}/);
  assert.match(sheet,/onClick=\{\(\)=>onVehicle\('a-pe'\)\}/);
  assert.doesNotMatch(sheet,/>Continuar</);
  assert.match(page,/\(!b1User\|\|b1Stage==='route'\)/);
});
test('route preview retains only supported priorities and the original navigation handler',()=>{
  assert.match(sheet,/Mais rápida/);
  assert.match(sheet,/Mais segura/);
  assert.match(sheet,/Iniciar navegação/);
  assert.match(page,/onStart=\{begin\}/);
  assert.doesNotMatch(sheet,/Equilibrada|Rota adaptativa|Ver outras rotas/);
});
test('overview descends to user only outside active navigation and respects gestures',()=>{
  assert.match(map,/controller\.current\.cinematicPreview=/);
  assert.match(map,/if\(d\.navigation\|\|!d\.active/);
  assert.match(map,/map\.on\('dragstart',cancel\)/);
  assert.match(map,/prefers-reduced-motion: reduce/);
  assert.match(map,/map\.fitBounds\(bounds/);
  assert.match(map,/map\.easeTo\(camera\)/);
  assert.match(map,/if\(navigation\)controller\?\.current\?\.cancelCinematic\?\.\(\)/);
});
