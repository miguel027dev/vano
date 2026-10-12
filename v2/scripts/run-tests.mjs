/** Run unit/API tests without inheriting hosting runtime port/TLS settings.
 * Render injects PORT=10000 at build time, while API tests allocate their own
 * ephemeral ports. Do not let the deployed port override those test ports.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const suites = ['server', 'src/lib', 'seo'];
const testFiles = suites.flatMap(directory => readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs'))
  .map(name => `${directory}/${name}`));
if (!testFiles.length) {
  console.error('No test files found.');
  process.exit(1);
}
const environment = { ...process.env, NODE_ENV: 'test' };
for (const key of ['PORT', 'API_HOST', 'API_PORT', 'VANO_DEV_HTTPS', 'VANO_TRUST_PROXY']) delete environment[key];
const run = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: process.cwd(), env: environment, stdio: 'inherit',
});
if (run.error) console.error(run.error);
process.exit(run.status ?? 1);
