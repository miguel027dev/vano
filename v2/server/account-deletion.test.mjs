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


import {verifiedGoogleDeletion} from './account-deletion.mjs';
test('Google deletion demands the same active session and exact verified Google identity',()=>{
  const session={user:{id:'userA',email:'a@example.test',googleSub:'google-sub-1'},hash:'session-hash-1'};
  const record={deleteUserId:'userA',deleteSessionHash:'session-hash-1'};
  const identity={email:'a@example.test',googleSub:'google-sub-1'};
  assert.equal(verifiedGoogleDeletion(session,record,identity),true);
  assert.equal(verifiedGoogleDeletion(session,{...record,deleteSessionHash:'another'},identity),false);
  assert.equal(verifiedGoogleDeletion(session,record,{...identity,googleSub:'intruder'}),false);
  assert.equal(verifiedGoogleDeletion(session,record,{...identity,email:'b@example.test'}),false);
  assert.equal(verifiedGoogleDeletion(null,record,identity),false);
});
