import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/AdminPage.jsx',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/components/AdminEtaConsole.jsx',import.meta.url),'utf8');
test('ETA console endpoint enforces verified admin and CSRF before reading coordinates',()=>{
 const start=api.indexOf("if(pathname==='/api/admin/route-eta-console'&&req.method==='POST')");
 assert.ok(start>0);
 const code=api.slice(start,api.indexOf("if(pathname==='/api/admin/safe-routing/compare'",start));
 assert.match(code,/const session=userSession\(req\)/);
 assert.match(code,/isAdminAccount\(session\.user\)/);
 assert.match(code,/protectedWrite\(req,res\)/);
 assert.match(code,/limits\(req,res,'admin-eta-console',4,60000\)/);
 assert.ok(code.indexOf('protectedWrite(req,res)')<code.indexOf('getBody(req)'));
 assert.ok(code.indexOf('isAdminAccount(session.user)')<code.indexOf('getBody(req)'));
 assert.match(code,/routeDiagnostics:true/);
 assert.match(code,/safeComparison:false/);
 assert.doesNotMatch(code,/db\.history\.push|db\.users\.push/);
});
test('only admin UI mounts route diagnostic and sends manually supplied coordinates',()=>{
 assert.match(page,/if\(!user\?\.isAdmin\)return/);
 assert.match(page,/<AdminEtaConsole\/>/);
 assert.match(panel,/api\('\/admin\/route-eta-console'/);
 assert.match(panel,/Copiar relatório JSON/);
 assert.match(panel,/congestionCoveragePct/);
 assert.doesNotMatch(panel,/geolocation\.getCurrentPosition|watchPosition\(/);
});
