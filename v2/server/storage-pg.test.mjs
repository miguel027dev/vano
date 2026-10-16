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

test('Postgres reconnects after asynchronous connection loss without losing pending writes',async()=>{
 class RecoverClient extends FakeClient{
   static opened=[];
   constructor(config){super(config);RecoverClient.opened.push(this);}
 }
 saved=emptyData();RecoverClient.opened=[];
 const db=await openPostgresStore('postgresql://test:pass@localhost/test',RecoverClient);
 db.data.users.push({id:'before-loss'});
 await db.save();
 const old=RecoverClient.opened[0];
 old.fail(new Error('simulated socket failure'));
 db.data.users.push({id:'after-loss'});
 await db.assertHealthy();
 await db.save();
 assert.equal(RecoverClient.opened.length,2,'new authenticated Postgres connection');
 assert.equal(saved.users.length,2,'full logical state is saved after reconnect');
});
test('a failed write is retried once; new saves are not permanently poisoned',async()=>{
 class RecoverClient extends FakeClient{
  static opened=[];
  constructor(config){super(config);RecoverClient.opened.push(this);}
  async query(statement,params=[]){
   if(statement.startsWith('UPDATE')&&this===RecoverClient.opened[0])
    throw Error('network reset');
   return super.query(statement,params);
  }
 }
 saved=emptyData();RecoverClient.opened=[];
 const db=await openPostgresStore('postgresql://test:pass@localhost/test',RecoverClient);
 db.data.favorites.push({id:'first'});
 await db.save();
 assert.equal(RecoverClient.opened.length,2);
 db.data.favorites.push({id:'second'});
 await db.save();
 assert.equal(saved.favorites.length,2);
});
