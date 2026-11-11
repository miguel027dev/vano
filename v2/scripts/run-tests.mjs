/** Run tests without inheriting Render's runtime port and proxy flags. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const folders = ['server', 'src/lib', 'scripts'];
const files = folders.flatMap(folder => readdirSync(folder)
  .filter(name => name.endsWith('.test.mjs'))
  .map(name => folder + '/' + name));
if (!files.length) {
  console.error('No test files found.');
  process.exit(1);
}
const env = { ...process.env, NODE_ENV: 'test' };
for (const key of ['PORT','API_PORT','API_HOST','VANO_DEV_HTTPS','VANO_TRUST_PROXY']) delete env[key];
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: process.cwd(), env, stdio: 'inherit',
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
