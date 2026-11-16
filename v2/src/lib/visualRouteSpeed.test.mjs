import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateVisualRouteSpeed} from './visualRouteSpeed.mjs';
const at=(meters,sourceAt=100000,accuracy=6)=>({meters,sourceAt,accuracy});

test('50 km/h with speed=null can still drive a visual car along the route',()=>{
 const v=estimateVisualRouteSpeed(at(0),at(13.8889,101000));
 assert.ok(v>13&&v<15);
});
test('missing history or inaccurate GPS cannot create fake visual motion',()=>{
 assert.equal(estimateVisualRouteSpeed(null,at(14,101000)),null);
 assert.equal(estimateVisualRouteSpeed(at(0,100000,90),at(14,101000)),null);
 assert.equal(estimateVisualRouteSpeed(at(0),at(14,104600)),null);
 assert.equal(estimateVisualRouteSpeed(at(0),at(120,101000)),null);
});
test('stationary jitter becomes visual speed zero and backwards map match is ignored',()=>{
 assert.equal(estimateVisualRouteSpeed(at(30),at(30.5,101000)),0);
 assert.equal(estimateVisualRouteSpeed(at(30),at(20,101000)),null);
});
test('visual velocity smoothing does not write into the observed fixes',()=>{
 const first=at(10),second=at(26,101000);
 const speed=estimateVisualRouteSpeed(first,second,{previousSpeed:12});
 assert.ok(speed>12&&speed<16);
 assert.deepEqual(first,at(10));assert.deepEqual(second,at(26,101000));
});
