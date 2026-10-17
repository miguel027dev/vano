/**
 * Initializes ONLY the isolated VANO V2 PostgreSQL state table.
 * Never reads, migrates or changes VANO V1 tables. Safe to run before import.
 */
import { openPostgresStore } from '../server/postgres-store.mjs';
if (!process.env.DATABASE_URL) {
  console.error('BLOCKED: DATABASE_URL PostgreSQL not configured.');
  process.exit(1);
}
const store = await openPostgresStore(process.env.DATABASE_URL);
console.log('VANO V2 isolated PostgreSQL state present. State revision=' + store.revision);
await store.close();
