import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStore } from './postgres-store.mjs';
import { emptyData } from './storage.mjs';

function fakePg(initial = emptyData(), startRevision = 0) {
  let db = structuredClone(initial);
  let revision = startRevision;
  return {
    async query(sql, args=[]) {
      if (sql.startsWith('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('INSERT INTO')) return { rows: [] };
      if (sql.startsWith('SELECT revision')) return { rows: [{ state: structuredClone(db), revision }] };
      if (sql.startsWith('UPDATE vano_v2_state')) {
        if (args[1] !== revision) return { rows: [] };
        db = JSON.parse(args[0]); revision++;
        return { rows: [{ revision }] };
      }
      throw Error('SQL desconhecido no teste.');
    },
    get state() { return db; },
    forceConcurrentWrite() { revision++; },
    async end() {}
  };
}
test('V2 PostgreSQL preserves state without touching V1 tables', async () => {
  const pg = fakePg();
  const store = await createPostgresStore(pg);
  store.data.users.push({ id: 'test', email: 'example@invalid.test' });
  await store.save();
  assert.equal(pg.state.users[0].id,'test');
  assert.equal(store.revision,1);
});
test('V2 PostgreSQL serializes writes without losing the last snapshot', async () => {
  const pg = fakePg();
  const store = await createPostgresStore(pg);
  store.data.favorites.push({id:'first'});
  const a = store.save();
  store.data.favorites.push({id:'second'});
  const b = store.save();
  await Promise.all([a,b]);
  assert.deepEqual(pg.state.favorites.map(x=>x.id),['first','second']);
  assert.equal(store.revision,2);
});
test('V2 PostgreSQL rejects stale writes instead of overwriting data', async () => {
  const pg = fakePg();
  const store = await createPostgresStore(pg);
  pg.forceConcurrentWrite();
  store.data.users.push({ id:'stale' });
  await assert.rejects(store.save(),/Conflito PostgreSQL/);
  assert.equal(pg.state.users.length,0);
  await assert.rejects(store.save(),/Conflito PostgreSQL/);
});
test('V2 PostgreSQL rejects corrupt collections at startup', async () => {
  const bad = emptyData(); bad.users = null;
  await assert.rejects(createPostgresStore(fakePg(bad)),/coleção inválida/);
});
