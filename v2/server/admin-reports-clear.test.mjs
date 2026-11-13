import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/components/AdminOccurrences.jsx',import.meta.url),'utf8');
const adminPage=readFileSync(new URL('../src/pages/AdminPage.jsx',import.meta.url),'utf8');

test('bulk clear is a dedicated POST, admin authenticated, CSRF protected and confirmed',()=>{
 const at=server.indexOf("pathname==='/api/admin/reports/clear-all'&&req.method==='POST'");
 assert.ok(at>0,'explicit bulk purge endpoint exists');
 const block=server.slice(at,server.indexOf("if (pathname === '/api/bootstrap'",at));
 assert.match(block,/const session=userSession\(req\)/);
 assert.match(block,/if\(!isAdminAccount\(session\.user\)\)return err\(res,403/);
 assert.match(block,/protectedWrite\(req,res\)/);
 assert.match(block,/limits\(req,res,'admin-reports-clear-all',2,60000\)/);
 assert.match(block,/body\.confirmation!=='EXCLUIR TODAS'/);
 assert.match(block,/db\.reports=\[\]/);
 assert.match(block,/try\{await persist\(\);\}/);
 assert.match(block,/db\.reports=previous/);
 assert.match(block,/reportStreams\.publishAll\(\)/);
 assert.doesNotMatch(block,/db\.(?:favorites|history|routines|users|partnerKeys)=/);
 assert.doesNotMatch(block,/queryPublicRadars|tomtomSnapshot|queryPublicMap\s*=/);
});
test('admin deletion is intentionally opt-in and cannot run on mounting the panel or refreshing',()=>{
 assert.match(panel,/onClick=\{\(\)=>\{setConfirmOpen\(true\)/);
 assert.match(panel,/role="alertdialog" aria-modal="true"/);
 assert.match(panel,/confirmation!=='EXCLUIR TODAS'/);
 assert.match(panel,/onClick=\{clearAll\}/);
 assert.match(panel,/api\('\/admin\/reports\/clear-all',\{method:'POST',body:\{confirmation\}\}\)/);
 assert.match(panel,/setData\(\{items:\[\],total:0/);
 assert.match(adminPage,/AdminOccurrences stats=\{stats\} onChanged=\{\(\)=>refresh\(0\)\}/);
});
test('verified report feature responses cannot return browser-cached deleted alerts',()=>{
 assert.match(server,/'Cache-Control':'public, no-store'/);
 assert.match(server,/publicReportsInBBox\(db\.reports,bbox/);
 assert.match(server,/filterVerifiedReports\(db\.reports,bbox\)/);
});
