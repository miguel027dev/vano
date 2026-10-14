import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const security=readFileSync(new URL('./security.mjs',import.meta.url),'utf8');

test('public Render web service cannot silently use development security defaults',()=>{
 assert.match(server,/process\.env\.RENDER === 'true' && process\.env\.RENDER_SERVICE_TYPE === 'web'/);
 assert.match(server,/const production = process\.env\.NODE_ENV === 'production' \|\| renderWeb/);
 assert.match(server,/secureHeaders\(production\)/);
 assert.match(server,/const secured = production \|\|/);
 assert.match(server,/if \(production\) \{/);
 assert.match(server,/renderWeb && host==='0\.0\.0\.0'/);
 assert.match(server,/x-forwarded-proto.*https/);
 assert.match(security,/Content-Security-Policy/);
 assert.match(security,/Strict-Transport-Security/);
});
