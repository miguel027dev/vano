import test from 'node:test';
import assert from 'node:assert/strict';
import {watchSearchLocation} from './searchLocationWatch.js';
function browser(state){
 const permission={state,addEventListener:(_,fn)=>permission.changed=fn,removeEventListener:()=>permission.changed=null};
 const watches=[],cleared=[],fixes=[];
 const navigator={permissions:{query:async()=>permission},geolocation:{watchPosition:(success,error)=>{watches.push({success,error});return watches.length;},clearWatch:id=>cleared.push(id)}};
 return {permission,watches,cleared,fixes,navigator};
}
const position=(coords,timestamp=Date.now())=>({coords:{longitude:coords[0],latitude:coords[1],accuracy:10},timestamp});
test('ungranted permission never starts a watch; existing grant follows real fixes',async()=>{
 const b=browser('prompt'),stop=watchSearchLocation(b.navigator,fix=>b.fixes.push(fix));
 await Promise.resolve();assert.equal(b.watches.length,0);
 b.permission.state='granted';b.permission.changed();assert.equal(b.watches.length,1);
 b.watches[0].success(position([-9.14,38.72]));
 assert.deepEqual(b.fixes.at(-1).coords,[-9.14,38.72]);
 b.watches[0].success(position([-9.13999,38.72],Date.now()+1));assert.deepEqual(b.fixes.at(-1).coords,[-9.13999,38.72]);
 b.permission.state='denied';b.permission.changed();assert.deepEqual(b.cleared,[1]);assert.equal(b.fixes.at(-1),null);
 b.watches[0].success(position([0,0]));assert.equal(b.fixes.at(-1),null);
 stop();assert.equal(b.permission.changed,null);
});
test('unmount during asynchronous permission lookup cannot create a late watch',async()=>{
 const b=browser('granted'),stop=watchSearchLocation(b.navigator,fix=>b.fixes.push(fix));
 stop();await Promise.resolve();assert.equal(b.watches.length,0);
});
test('unmount clears active watch and stale fixes never enter search state',async()=>{
 const b=browser('granted'),stop=watchSearchLocation(b.navigator,fix=>b.fixes.push(fix));
 await Promise.resolve();b.watches[0].success(position([0,0],Date.now()-90000));assert.equal(b.fixes.at(-1),null);
 stop();assert.deepEqual(b.cleared,[1]);
});
