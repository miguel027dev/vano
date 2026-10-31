import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneGuestRecords,GUEST_RETENTION_MS,GUEST_OWNER_CAP} from './guest-retention.mjs';
const guest='guest:'+'a'.repeat(32);
test('Prune abandoned guest records, never members or undated legacy on first sweep',()=>{
  const now=Date.parse('2026-10-21T00:00:00Z');
  const stale=new Date(now-GUEST_RETENTION_MS-1000).toISOString();
  const db={preferences:[{owner:guest},{owner:'user1',createdAt:stale}],favorites:[{owner:guest,createdAt:stale},{owner:'user1',createdAt:stale}],history:[{owner:guest,createdAt:new Date(now-1000).toISOString()}],routines:[]};
  assert.equal(pruneGuestRecords(db,now),1);
  assert.equal(db.favorites.length,1);
  assert.equal(db.history.length,1);
  assert.equal(db.preferences[0].createdAt,new Date(now).toISOString());
  assert.equal(db.preferences[1].owner,'user1');
  assert.equal(pruneGuestRecords(db,now+GUEST_RETENTION_MS+1000),2);
  assert.equal(db.preferences.length,1);
});

test('LRU cap evicts oldest distinct guests without losing member records',()=>{
  const now=Date.parse('2026-10-21T00:00:00Z');
  const guests=Array.from({length:GUEST_OWNER_CAP+1},(_,i)=>({
    owner:'guest:'+i.toString(16).padStart(32,'0'),
    createdAt:new Date(now-(GUEST_OWNER_CAP-i)*1000).toISOString()
  }));
  const db={preferences:guests,favorites:[{owner:'member',createdAt:'2020-01-01'}],history:[],routines:[]};
  assert.equal(pruneGuestRecords(db,now),1);
  assert.equal(db.preferences.length,GUEST_OWNER_CAP);
  assert.equal(db.preferences.some(x=>x.owner===guests[0].owner),false);
  assert.equal(db.preferences.some(x=>x.owner===guests.at(-1).owner),true);
  assert.equal(db.favorites[0].owner,'member');
});
