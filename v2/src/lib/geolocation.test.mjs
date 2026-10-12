import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geoAccessStatus,geoErrorMessage} from './geolocation.js';
test('permissão negada mantém alternativa manual',()=>{
  assert.equal(geoAccessStatus({code:1}),'denied');
  assert.match(geoErrorMessage({code:1}),/manualmente/);
});
test('timeout e GPS indisponível são estados distintos',()=>{
  assert.equal(geoAccessStatus({code:2}),'unavailable');
  assert.equal(geoAccessStatus({code:3}),'timeout');
  assert.match(geoErrorMessage({code:3}),/demorou/);
});
