/** Run unit/API tests without inheriting hosting runtime port/TLS settings.
 * Render injects PORT=10000 at build time, while API tests allocate their own
 * ephemeral ports. Do not let the deployed port override those test ports.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const suites = ['server', 'server/safe-routing', 'src/lib', 'seo'];
const testFiles = suites.flatMap(directory => readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs'))
  .map(name => `${directory}/${name}`));
if (!testFiles.length) {
  console.error('No test files found.');
  process.exit(1);
}
const environment = { ...process.env, NODE_ENV: 'test' };
// Tests launch local child servers by design. Strip Render host identity only
// from these test processes; never weaken the hosted runtime's production checks.
for (const key of ['PORT', 'API_HOST', 'API_PORT', 'VANO_DEV_HTTPS', 'VANO_TRUST_PROXY', 'DATABASE_URL', 'VANO_REQUIRE_POSTGRES', 'RENDER', 'RENDER_SERVICE_TYPE', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RENDER_EXTERNAL_HOSTNAME']) delete environment[key];
const run = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: process.cwd(), env: environment, stdio: 'inherit',
});
if (run.error) console.error(run.error);
process.exit(run.status ?? 1);
