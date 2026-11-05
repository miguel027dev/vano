import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../pages/AdminPage.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin-vanu-modules.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
const intelligence=readFileSync(new URL('../pages/IntelligencePage.jsx',import.meta.url),'utf8');
const devsync=readFileSync(new URL('../pages/DevSyncPage.jsx',import.meta.url),'utf8');

test('admin shell keeps main sections inside one panel and benchmark external',()=>{
 for(const item of ['dashboard','routes','training','intelligence','incidents','devsync','indicators','support','settings','map']){
  assert.match(page,new RegExp("'"+item+"'"));
 }
 for(const id of ['routes','training','intelligence','incidents','devsync','indicators','support','settings','map']){
  assert.ok(page.includes('area="'+id+'"'),id);
 }
 assert.match(page,/src="\/vano-logo-original\.webp"/);
 assert.match(page,/to="\/benchmark-de-rotas"/);
 assert.doesNotMatch(page,/to="\/admin\/dev-sync"/);
 assert.doesNotMatch(page,/to="\/admin\/intelligence"/);
 assert.doesNotMatch(page,/to="\/admin\/suporte"/);
 assert.match(page,/addEventListener\('popstate'/);
 assert.match(page,/sectionForHash/);
 assert.match(page,/window\.history\.pushState/);
});
test('existing functional modules mount in admin and map remains interactive',()=>{
 for(const key of ['<IntelligencePage embedded/>','<DevSyncPage embedded/>','<SupportInboxPage/>','<SettingsPage/>','<AdminOccurrences stats={stats}/>','<AdminLiveTrips embedded']){
  assert.ok(page.includes(key),key);
 }
 assert.match(page,/<iframe title="Mapa principal VANO" src="\/mapa"/);
 assert.match(page,/hidden=\{activeSection/);
 assert.match(intelligence,/post\('\/admin\/intelligence\/ask'/);
 assert.match(devsync,/api\('\/admin\/dev-sync\/handoff'/);
 assert.match(css,/\.vanu-ai-focus \.vint-chat/);
 assert.match(css,/\.vanu-map-embed iframe/);
});
test('read-only occurrence data uses an existing authenticated admin guard',()=>{
 assert.match(api,/\['\/api\/admin','\/api\/admin\/users','\/api\/admin\/reports'/);
 assert.match(api,/if\(!isAdminAccount\(session\.user\)\)return err\(res,403/);
 assert.match(api,/adminReportList\(db/);
});