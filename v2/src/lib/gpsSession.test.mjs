import test from 'node:test';
import assert from 'node:assert/strict';
import {startGpsSession} from './gpsSession.js';
function mock(){
  const api={watchCount:0,cleared:[],probeCount:0};
  api.watchPosition=(yes,no,opts)=>{api.watchCount++;api.onFix=yes;api.onError=no;api.watchOptions=opts;return 42;};
  api.clearWatch=id=>api.cleared.push(id);
  api.getCurrentPosition=(yes,no,opts)=>{api.probeCount++;api.probeFix=yes;api.probeError=no;api.probeOptions=opts;};
  const clock={schedule(fn){clock.task=fn;return 6;},cancel(id){clock.cancelled=id;clock.task=null;}};
  return {api,clock};
}
test('first-login starts one watch, no duplicate immediate one-shot',()=>{
  const {api,clock}=mock();let received=0;
  const stop=startGpsSession(api,{onPosition:()=>{received++;return true;},onError:()=>{}},{schedule:clock.schedule,cancel:clock.cancel});
  assert.equal(api.watchCount,1);assert.equal(api.probeCount,0);
  api.onFix({timestamp:1234});assert.equal(received,1);
  assert.equal(clock.task,null);
  stop();assert.deepEqual(api.cleared,[42]);
});
test('old callbacks after cleanup never overwrite the next login/map',()=>{
  const {api,clock}=mock();let received=0,errors=0;
  const stop=startGpsSession(api,{onPosition:()=>{received++;return true;},onError:()=>{errors++;}},{schedule:clock.schedule,cancel:clock.cancel});
  const oldSuccess=api.onFix,oldError=api.onError;
  stop();oldSuccess({});oldError({code:3});
  assert.equal(received,0);assert.equal(errors,0);assert.equal(api.probeCount,0);
});
test('permission denied blocks unsolicited fallback requests',()=>{
  const {api,clock}=mock();let status=null;
  const stop=startGpsSession(api,{onPosition:()=>true,onError:e=>{status=e.code;}},{schedule:clock.schedule,cancel:clock.cancel});
  api.onError({code:1});
  assert.equal(status,1);assert.equal(clock.task,null);assert.equal(api.probeCount,0);
  stop();
});
test('slow first GPS receives one delayed coarse fallback and keeps the watch',()=>{
  const {api,clock}=mock();let received=0;
  const stop=startGpsSession(api,{onPosition:()=>{received++;return true;},onError:()=>{}},{schedule:clock.schedule,cancel:clock.cancel});
  assert.equal(typeof clock.task,'function');
  clock.task();assert.equal(api.probeCount,1);
  assert.equal(api.probeOptions.enableHighAccuracy,false);
  api.probeFix({});assert.equal(received,1);
  api.onFix({});assert.equal(received,2);
  stop();
});
test('rejected cached position does not prevent first usable fix recovery',()=>{
  const {api,clock}=mock();
  const stop=startGpsSession(api,{onPosition:()=>null,onError:()=>{}},{schedule:clock.schedule,cancel:clock.cancel});
  api.onFix({timestamp:1});
  assert.equal(typeof clock.task,'function');
  clock.task();assert.equal(api.probeCount,1);stop();
});
