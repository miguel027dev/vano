import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const android=readFileSync(new URL('../../../android-vanu/app/src/main/java/com/vano/maps/fluidez/MainActivity.java',import.meta.url),'utf8');
test('native app opens account-aware entry instead of dropping guests straight onto map',()=>{
  assert.match(android,/ENTRY=BASE\+"\/"/);
  assert.doesNotMatch(android,/ENTRY=BASE\+"\/mapa"/);
});
test('start button does not wait for tile preparation or show an offline download interstitial',()=>{
  const body=map.slice(map.indexOf('async function begin(){'),map.indexOf('function reset(){'));
  assert.ok(body.length>100);
  assert.match(body,/setNavMode\(true\)/);
  assert.doesNotMatch(body,/offlineMap\.status|setPreparingStart/);
  assert.doesNotMatch(map,/Preparando para seguir sem internet|preparingStart/);
  assert.match(map,/void saveTrip\(/);
});
