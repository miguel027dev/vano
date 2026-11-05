import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminTripProgress} from './adminTripProgress.mjs';

test('qualifies on the first fix while ignoring GPS noise in distance',()=>{
  const t=createAdminTripProgress();
  assert.equal(t.add({coords:[0,0],accuracy:5,timestamp:1000}).meters,0);
  assert.equal(t.add({coords:[0,0.00001],accuracy:5,timestamp:2000}).meters,0);
  assert.equal(t.add({coords:[0,0.0001],accuracy:5,timestamp:3000}).eligible,true);
  assert.equal(t.add({coords:[0,0.0002],accuracy:5,timestamp:4000}).eligible,true);
  t.reset();
  assert.equal(t.add({coords:[0,0.0002],accuracy:5,timestamp:5000}).meters,0);
});

test('rejects stale, inaccurate and implausible fixes',()=>{
  const t=createAdminTripProgress();
  t.add({coords:[0,0],accuracy:5,timestamp:1000});
  assert.equal(t.add({coords:[0,0.01],accuracy:5,timestamp:2000}),null);
  assert.equal(t.add({coords:[0,0.0002],accuracy:51,timestamp:3000}),null);
  assert.equal(t.add({coords:[0,0.0002],accuracy:5,timestamp:1000}),null);
  assert.equal(t.add({coords:[0,0.0002],accuracy:5,timestamp:4000}).eligible,true);
});
