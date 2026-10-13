import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTravelTime} from './formatTime.mjs';
test('ETA uses hours instead of totals of minutes',()=>{
  assert.equal(formatTravelTime(82),'1 h 22 min');
  assert.equal(formatTravelTime(120),'2 h');
  assert.equal(formatTravelTime(59),'59 min');
  assert.equal(formatTravelTime(0),'0 min');
  assert.equal(formatTravelTime(-15),'0 min');
});
