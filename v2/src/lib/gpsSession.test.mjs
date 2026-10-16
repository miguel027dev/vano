import test from 'node:test';
import assert from 'node:assert/strict';
import {startGpsSession} from './gpsSession.js';
function harness(){
 let time=100000,id=0,watchId=40;
 const tasks=new Map(),events=new Map(),listeners=(type,fn)=>{events.set(type,fn)};
 const api={watchCount:0,probeCount:0,cleared:[],watches:[]};
 api.watchPosition=(yes,no,opts)=>{
  api.watchCount++;const watcher={id:++watchId,success:yes,error:no,opts};api.watches.push(watcher);
  return watcher.id;
 };
 api.clearWatch=n=>api.cleared.push(n);
 api.getCurrentPosition=(yes,no,opts)=>{api.probeCount++;api.probeSuccess=yes;api.probeError=no;api.probeOptions=opts};
 const doc={visibilityState:'visible',addEventListener:listeners,removeEventListener:(event)=>events.delete(event)};
 const win={addEventListener:listeners,removeEventListener:(event)=>events.delete(event)};
 const options={
  schedule:(fn,delay)=>{const k=++id;tasks.set(k,{fn,at:time+delay});return k;},
  cancel:k=>tasks.delete(k),now:()=>time,
  documentObject:doc,windowObject:win,firstFixTimeoutMs:8500,
  watchdogMs:12000,minRestartMs:12000,staleMs:35000
 };
 function advance(ms){
  const end=time+ms;let loops=0;
  while(loops++<200){
   const due=[...tasks.entries()].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!due)break;time=due[1].at;tasks.delete(due[0]);due[1].fn();
  }
  if(loops>=200)throw Error('timer storm');time=end;
 }
 const latest=()=>api.watches.at(-1);
 return {api,options,doc,win,events,advance,latest,get pending(){return tasks.size;}};
}
test('one initial watch; first delayed network fix is only a fallback',()=>{
 const h=harness();let accepted=0;
 const stop=startGpsSession(h.api,{onPosition:()=>{accepted++;return true},onError:()=>{}},h.options);
 assert.equal(h.api.watchCount,1);assert.equal(h.api.probeCount,0);
 h.latest().success({timestamp:1234});h.advance(8500);
 assert.equal(accepted,1);assert.equal(h.api.probeCount,0);
 stop();assert.deepEqual(h.api.cleared,[41]);assert.equal(h.pending,0);
});
test('no fix starts a delayed coarse probe but retains precision watch',()=>{
 const h=harness();const stop=startGpsSession(h.api,{onPosition:()=>true,onError:()=>{}},h.options);
 h.advance(8500);assert.equal(h.api.probeCount,1);
 assert.equal(h.api.probeOptions.enableHighAccuracy,false);
 h.api.probeSuccess({});assert.equal(h.api.watchCount,1);
 stop();
});
test('stale GPS watch restarts, then resumes positioning; late callbacks ignored',()=>{
 const h=harness();let accepted=0,recovered=0;
 const stop=startGpsSession(h.api,{onPosition:()=>{accepted++;return true},onError:()=>{},onRecover:()=>recovered++},{...h.options,navigation:true});
 const old=h.latest();
 old.success({});h.advance(50000);
 assert.ok(h.api.watchCount>=2,'silent watch must restart');
 assert.ok(recovered>=1);
 const newWatch=h.latest();
 old.success({});assert.equal(accepted,1,'old callback cannot overwrite fresh session');
 newWatch.success({});assert.equal(accepted,2);
 stop();const total=h.api.watchCount;h.advance(120000);assert.equal(h.api.watchCount,total);
});
test('temporary timeout uses bounded retry; permission denied disables automatic restart',()=>{
 const h=harness();let errors=0;
 const stop=startGpsSession(h.api,{onPosition:()=>true,onError:()=>{errors++}},{...h.options,navigation:true});
 h.latest().error({code:3});h.advance(17000);
 assert.ok(h.api.watchCount>=2);
 h.latest().error({code:1});const count=h.api.watchCount;
 h.advance(180000);assert.equal(h.api.watchCount,count);assert.equal(errors,2);
 stop();
});
test('hidden tabs avoid automatic restarts, resume recovers stale watch',()=>{
 const h=harness();const stop=startGpsSession(h.api,{onPosition:()=>true,onError:()=>{}},{...h.options,navigation:true});
 h.latest().success({});h.doc.visibilityState='hidden';h.events.get('visibilitychange')();
 h.advance(60000);assert.equal(h.api.watchCount,1);
 h.doc.visibilityState='visible';h.events.get('visibilitychange')();
 h.advance(1500);assert.equal(h.api.watchCount,2);
 stop();
});
test('rejected cached fixes do not count as accepted GPS and old callbacks remain inert',()=>{
 const h=harness();let count=0;
 const stop=startGpsSession(h.api,{onPosition:()=>{count++;return null},onError:()=>{}},h.options);
 const old=h.latest();old.success({timestamp:100});
 h.advance(9000);assert.equal(h.api.probeCount,1);
 stop();old.success({});old.error({code:2});
 assert.equal(count,1);
});
