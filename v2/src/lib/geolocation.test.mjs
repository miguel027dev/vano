import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geoAccessStatus,geoErrorMessage,hasRecentGpsFix,gpsStateAfterError} from './geolocation.js';
test('permissão negada mantém alternativa manual',()=>{
  assert.equal(geoAccessStatus({code:1}),'denied');
  assert.match(geoErrorMessage({code:1}),/manualmente/);
});
test('timeout e GPS indisponível são estados distintos',()=>{
  assert.equal(geoAccessStatus({code:2}),'unavailable');
  assert.equal(geoAccessStatus({code:3}),'timeout');
  assert.match(geoErrorMessage({code:3}),/demorou/);
});

test('Falha tardia do GPS não cancela localização real recente',()=>{
  const fix={coords:[-46.6808,-23.5857],receivedAt:1000};
  assert.equal(hasRecentGpsFix(fix,2000),true);
  assert.equal(gpsStateAfterError({code:2},fix,2000),'granted');
  assert.equal(gpsStateAfterError({code:3},fix,5000),'granted');
  assert.equal(gpsStateAfterError({code:1},fix,200000),'denied');
});
test('Rejeita fix inválido, futuro ou muito antigo',()=>{
  assert.equal(hasRecentGpsFix({coords:[1000,20],receivedAt:10},2000),false);
  assert.equal(hasRecentGpsFix({coords:[1,2],receivedAt:2001},2000),false);
  assert.equal(hasRecentGpsFix({coords:[1,2],receivedAt:1000},100001),false);
});
