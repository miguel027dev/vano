/**
 * Versioned, isolated VANO V2 PostgreSQL state.
 * Never modifies the VANO V1 user, session or route tables.
 * Legacy account migration must be reviewed separately before production.
 */
import { emptyData } from './storage.mjs';

const CREATE_SQL = [
  'CREATE TABLE IF NOT EXISTS vano_v2_state (',
  'id SMALLINT PRIMARY KEY CHECK (id = 1),',
  'revision BIGINT NOT NULL DEFAULT 0,',
  'state JSONB NOT NULL,',
  'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  ')'
].join('\n');
const INSERT_SQL = 'INSERT INTO vano_v2_state(id, revision, state) VALUES(1, 0, $1::jsonb) ON CONFLICT (id) DO NOTHING';
const SELECT_SQL = 'SELECT revision, state FROM vano_v2_state WHERE id=1';
const UPDATE_SQL = 'UPDATE vano_v2_state SET state=$1::jsonb, revision=revision+1, updated_at=NOW() WHERE id=1 AND revision=$2 RETURNING revision';

function assertState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Banco V2 PostgreSQL: estado inválido.');
  for (const name of Object.keys(emptyData()))
    if (!Array.isArray(value[name])) throw Error('Banco V2 PostgreSQL: coleção inválida ' + name);
  if (Buffer.byteLength(JSON.stringify(value)) > 64*1024*1024) throw Error('Banco V2 PostgreSQL: limite de 64MB excedido.');
  return value;
}

export async function createPostgresStore(client) {
  await client.query(CREATE_SQL);
  await client.query(INSERT_SQL, [JSON.stringify(emptyData())]);
  const result = await client.query(SELECT_SQL);
  if (result.rows.length !== 1) throw Error('Banco V2 PostgreSQL: registro único ausente.');
  const db = assertState(result.rows[0].state);
  let revision = Number(result.rows[0].revision);
  if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Banco V2 PostgreSQL: revisão inválida.');
  let pending = Promise.resolve();
  let fatal = null;
  async function save() {
    if (fatal) throw fatal;
    const snapshot = JSON.stringify(assertState(db));
    const work = pending.then(async () => {
      const updated = await client.query(UPDATE_SQL, [snapshot, revision]);
      if (updated.rows.length !== 1)
        throw Error('Conflito PostgreSQL V2: outro processo alterou o banco. Reinicie após verificar os dados; gravação rejeitada.');
      revision = Number(updated.rows[0].revision);
    });
    pending = work.catch(error => { fatal = error; });
    return work;
  }
  async function close() { await pending; await client.end?.(); }
  return { data: db, save, close, driver: 'postgres', get revision() { return revision; } };
}

export async function openPostgresStore(url) {
  if (!/^postgres(?:ql)?:\/\//.test(String(url || ''))) throw Error('DATABASE_URL precisa usar PostgreSQL.');
  const mod = await import('pg');
  const Client = mod.Client ?? mod.default?.Client;
  if (!Client) throw Error('Driver pg não disponível.');
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await client.connect();
  try { return await createPostgresStore(client); }
  catch (error) { await client.end(); throw error; }
}
