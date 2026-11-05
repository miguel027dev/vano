import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminLiveTrips} from './admin-live-trips.mjs';

test('guest trip is ephemeral, validates fixes and can be stopped',()=>{
 let time=1000;const store=createAdminLiveTrips({now:()=>time,ttl:120000});
 const token='a'.repeat(64),fix={token,coords:[-46,-23],accuracy:10,meters:21};
 assert.equal(store.update({...fix,meters:-1},null),false);
 assert.equal(store.update({...fix,meters:0},null),true);
 assert.equal(store.update({...fix,coords:[181,0]},null),false);
 assert.equal(store.update(fix,null),true);
 assert.equal(store.list()[0].user,null);
 assert.equal(store.list()[0].token,undefined);
 assert.equal(store.update({...fix,coords:[-46.001,-23]},null),true);
 assert.equal(store.list()[0].trail.length,2);
 assert.equal(store.stop(token),true);assert.equal(store.list().length,0);
 store.update(fix,{name:'Teste'});time+=120001;assert.equal(store.list().length,0);
});

test('stores the planned route, rejects invalid geometry and replaces it after rerouting',()=>{
 const store=createAdminLiveTrips(),token='b'.repeat(64),fix={token,coords:[-46,-23],accuracy:10,meters:0};
 const route=[[-46,-23],[-46.1,-23.1]],replacement=[[-46,-23],[-46.2,-23.2]];
 assert.equal(store.update({...fix,route},null),true);
 assert.deepEqual(store.list()[0].route,route);
 assert.equal(store.update({...fix,route:[[999,0],[0,0]]},null),false);
 assert.deepEqual(store.list()[0].route,route);
 assert.equal(store.update({...fix,route:replacement},null),true);
 assert.deepEqual(store.list()[0].route,replacement);
 store.stop(token);
});
