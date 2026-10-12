/** Read-only account and dependency readiness check. Never prints secrets. */
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('BLOCKED: DATABASE_URL missing.'); process.exit(1); }
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('BLOCKED: Google OAuth credentials missing on target service.');
  process.exit(1);
}
if (!process.env.VANO_V1_API_URL) {
  console.error('BLOCKED: V1 micro-routing endpoint missing.');
  process.exit(1);
}
const client = new Client({ connectionString: url, connectionTimeoutMillis:10000 });
try {
  await client.connect();
  const legacy = await client.query("SELECT to_regclass('public.users') AS has_users");
  if (legacy.rows[0]?.has_users) {
    const v1 = await client.query('SELECT count(*)::integer AS total FROM public.users');
    const v2 = await client.query("SELECT COALESCE(jsonb_array_length(state->'users'),0) AS total FROM vano_v2_state WHERE id=1");
    const a=Number(v1.rows[0]?.total||0),b=Number(v2.rows[0]?.total||0);
    if (a>b) {
      console.error('BLOCKED: V1 accounts=' + a + ', V2 accounts=' + b + '. Migrate accounts and verify identities first.');
      process.exitCode=1;
    } else {
      console.log('Account counts inspected (V1=' + a + ', V2=' + b + '). Identity linkage still requires validation.');
    }
  } else {
    console.log('No public.users table found; migration is not certified by this check.');
  }
} catch (error) {
  console.error('BLOCKED: migration check failed: ' + String(error.code || error.name || 'database_error'));
  process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
}
