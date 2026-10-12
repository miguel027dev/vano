import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../server/storage.mjs';
import { transformLegacy } from './import-v1-to-v2.mjs';
const legacy=()=>({
  users:[{id:1,is_active:1,name:'Example',email:'a@example.test',password_hash:'pbkdf2_sha256$600000$salt$hash',locale:'pt-BR',google_sub:null,created_at:'2026-01-01',route_preference:'fastest'}],
  places:[{id:2,user_id:1,name:'Casa',label:'Minha casa',longitude:-46.6,latitude:-23.5,created_at:'2026-01-01'}],
  history:[{id:3,user_id:1,destination_label:'Rua',destination_lon:-46.5,destination_lat:-23.4,duration_s:600,distance_m:3500,created_at:'2026-01-01',mode:'fastest'}],
  reports:[{id:4,user_id:1,category:'accident',title:'Obstáculo',description:'Relato',longitude:-46.7,latitude:-23.6,created_at:'2026-01-01'}],
  routines:[{id:5,user_id:1,weekday:1,label:'Trabalho',departure_time:'08:30',longitude:-46.5,latitude:-23.4,created_at:'2026-01-01'}]
});
test('imports V1 accounts and personal data without mutating the input snapshot',()=>{
  const original=emptyData(),snapshot=structuredClone(original);
  const {data,summary}=transformLegacy(original,legacy());
  assert.deepEqual(original,snapshot);
  assert.equal(summary.users,1);assert.equal(summary.favorites,1);assert.equal(summary.history,1);
  assert.equal(summary.reports,1);assert.equal(summary.routines,1);
  assert.equal(data.users[0].verifiedAt,null);
  assert.equal(data.preferences[0].preferredRoute,'fast');
  assert.deepEqual(data.favorites[0].coords,[-46.6,-23.5]);
});
test('migration is idempotent and does not duplicate imported data',()=>{
  const input=legacy(),first=transformLegacy(emptyData(),input),second=transformLegacy(first.data,input);
  assert.equal(second.summary.users,0);assert.equal(second.summary.history,0);assert.equal(second.summary.favorites,0);
});
test('inactive users and associated records remain disabled',()=>{
  const input=legacy();input.users[0].is_active=0;
  const result=transformLegacy(emptyData(),input);
  assert.equal(result.summary.users,0);assert.equal(result.summary.inactive,1);
  assert.equal(result.summary.favorites,0);
});
test('email collisions are blocked until verified manual account linking',()=>{
  const initial=emptyData();initial.users.push({id:'unrelated',email:'a@example.test'});
  assert.throws(()=>transformLegacy(initial,legacy()),/Identity collision/);
});
