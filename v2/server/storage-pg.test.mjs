import test from 'node:test';
import assert from 'node:assert/strict';
import {openPostgresStore} from './storage-pg.mjs';
import {emptyData} from './storage.mjs';

let saved=emptyData();
const statements=[];
class FakeClient{
  constructor(config){assert.ok(config.connectionString.startsWith('postgresql://'));}
  on(event,callback){if(event==='error')this.fail=callback;}
  async connect(){}
  async end(){}
  async query(statement,params=[]){
    statements.push(statement);
    if(statement.startsWith('SELECT data'))return {rowCount:1,rows:[{data:structuredClone(saved)}]};
    if(statement.startsWith('UPDATE vano_v2')){saved=JSON.parse(params[0]);return {rowCount:1};}
    return {rowCount:1};
  }
}
test('V2 PostgreSQL lives in its own schema and survives restart',async()=>{
  saved=emptyData();statements.length=0;
  const db=await openPostgresStore('postgresql://test:pass@localhost/test',FakeClient);
  assert.equal(db.persistent,true);
  assert.equal(db.kind,'postgres');
  db.data.users.push({id:'user-1',email:'test@example.com'});
  db.data.oauthStates.push({stateHash:'hash',expires:Date.now()+60000});
  db.data.sessions.push({tokenHash:'sha256',userId:'user-1',expires:Date.now()+60000});
  await db.save();
  const next=await openPostgresStore('postgresql://test:pass@localhost/test',FakeClient);
  assert.equal(next.data.users[0].id,'user-1');
  assert.equal(next.data.sessions[0].userId,'user-1');
  assert.equal(next.data.oauthStates[0].stateHash,'hash');
  assert.ok(statements.some(sql=>sql==='CREATE SCHEMA IF NOT EXISTS vano_v2'));
  assert.ok(statements.some(sql=>sql.includes('vano_v2.app_state')));
  assert.ok(!statements.some(sql=>/\b(public\.users|INSERT INTO users|UPDATE users)\b/i.test(sql)));
});
test('V2 PostgreSQL requires valid URL and never silently falls back to JSON',async()=>{
  await assert.rejects(openPostgresStore('sqlite://test',FakeClient),/PostgreSQL/);
});
