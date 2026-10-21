import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteUserRecords} from './account-deletion.mjs';
test('Account deletion erases only the authorized account and its pending tokens',()=>{
  const db={users:[{id:'u1'},{id:'u2'}],sessions:[{userId:'u1'},{userId:'u2'}],favorites:[{owner:'u1'},{owner:'u2'}],history:[{owner:'u1'}],routines:[],preferences:[{owner:'u1'}],reports:[{owner:'u1'}],emailTokens:[{userId:'u1'}],oauthStates:[{deleteUserId:'u1'},{linkUserId:'u2'}]};
  deleteUserRecords(db,'u1');
  assert.deepEqual(db.users,[{id:'u2'}]);
  assert.deepEqual(db.sessions,[{userId:'u2'}]);
  assert.deepEqual(db.favorites,[{owner:'u2'}]);
  assert.equal(db.history.length,0);
  assert.deepEqual(db.oauthStates,[{linkUserId:'u2'}]);
});
