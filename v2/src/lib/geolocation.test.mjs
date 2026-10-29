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
  assert.equal(gpsStateAfterError({code:1},fix,2000),'denied','permission revocation cannot be masked by an older accepted fix');
});
test('Rejeita fix inválido, futuro ou muito antigo',()=>{
  assert.equal(hasRecentGpsFix({coords:[1000,20],receivedAt:10},2000),false);
  assert.equal(hasRecentGpsFix({coords:[1,2],receivedAt:2001},2000),false);
  assert.equal(hasRecentGpsFix({coords:[1,2],receivedAt:1000},100001),false);
});
import {evaluateGpsPosition} from './geolocation.js';
const position=(lng,lat,timestamp,accuracy=12)=>({timestamp,coords:{longitude:lng,latitude:lat,accuracy,heading:89,speed:7}});
test('Aceita GPS real e preserva timestamp do sensor',()=>{
 const r=evaluateGpsPosition(position(-46.70,-23.6,90000),null,100000);
 assert.equal(r.ok,true);assert.equal(r.fix.receivedAt,90000);assert.equal(r.fix.accuracy,12);
});
test('Ignora localização em cache desatualizada e fora de ordem',()=>{
 assert.equal(evaluateGpsPosition(position(-46.70,-23.6,10000),null,80000).reason,'stale');
 const prev=evaluateGpsPosition(position(-46.70,-23.60,90000),null,91000).fix;
 assert.equal(evaluateGpsPosition(position(-46.70,-23.60,87000),prev,91000).reason,'out-of-order');
});
test('Rejeita teleporte isolado sem bloquear deslocamento normal',()=>{
 const prev=evaluateGpsPosition(position(-46.700,-23.600,90000),null,90000).fix;
 assert.equal(evaluateGpsPosition(position(-45.700,-23.600,91000),prev,91000).reason,'jump');
 assert.equal(evaluateGpsPosition(position(-46.6999,-23.600,91000),prev,91000).ok,true);
});
test('rejeita salto de corredor paralelo com precisão degradada, mas recupera após lacuna real',()=>{
 const prev=evaluateGpsPosition(position(-46.700,-23.600,90000,55),null,90000).fix;
 // ~166 m em um segundo: típico salto de multipath, não condução urbana real.
 assert.equal(evaluateGpsPosition(position(-46.6984,-23.600,91000,55),prev,91000).reason,'jump');
 // Após perda intermitente, uma posição nova dentro do envelope de recuperação permanece utilizável.
 assert.equal(evaluateGpsPosition(position(-46.6967,-23.600,96000,20),prev,96000).ok,true);
});
test('GPS duplicado e saltos em um segundo não causam teleporte visual',()=>{
 const prev=evaluateGpsPosition(position(-46.700,-23.600,90000,8),null,90000).fix;
 assert.equal(evaluateGpsPosition(position(-46.700,-23.600,90000,8),prev,90100).reason,'out-of-order');
 assert.equal(evaluateGpsPosition(position(-46.699,-23.600,91000,8),prev,91000).reason,'jump');
 assert.equal(evaluateGpsPosition(position(-46.69985,-23.600,91000,8),prev,91000).ok,true);
});
test('Coordenadas inválidas ou sem precisão não viram localização real',()=>{
 assert.equal(evaluateGpsPosition(position(NaN,-23.6,90000),null,100000).reason,'invalid');
 assert.equal(evaluateGpsPosition(position(-46.7,-23.6,90000,3000),null,100000).reason,'inaccurate');
});
