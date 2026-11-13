import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'vanu-private-map-'));
process.env.NODE_ENV='test';
process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='vanu-private-map-test-secret-12345678';
const {server}=await import('./index.mjs');

test('V2 document is forbidden to guests at the server, including trailing slash',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const pathname of ['/v2','/v2/','/V2','/v2?testing=true']){
   const response=await fetch(base+pathname,{redirect:'manual'});
   assert.equal(response.status,403,pathname);
   assert.equal(response.headers.get('content-type')?.includes('application/json'),true);
  }
 }finally{
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
test('V1 gets the assistant and microphone; V2 requires admin in the router',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const map=readFileSync(new URL('../src/pages/MapPage.jsx',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../src/pages/AdminPage.jsx',import.meta.url),'utf8');
 const serverCode=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(map,/location\.pathname==='\/mapa'\|\|location\.pathname==='\/v2'/);
 assert.match(map,/jevMode&&navMode&&<JevVoiceButton/);
 assert.match(admin,/<Link to="\/v2"[^>]*>.*Entrar no mapa de administrador/);
 assert.match(app,/user\?\.isAdmin===true\?\(mobile\?null:<MapPage\/>\)/);
 assert.match(serverCode,/isAdminAccount\(userSession\(req\)\?\.user\)/);
 assert.match(serverCode,/name==='\/v2'\|\|name==='\/mapa'/);
});

test('only named V2 profile preview documents bypass the administrator document guard',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const path of ['/v2/perfil-preview','/v2/conta-preview','/v2/configuracoes-preview']){
   const response=await fetch(base+path,{redirect:'manual'});
   // Tests run before Vite build, so a missing dist may return 404 but not admin 403.
   assert.notEqual(response.status,403,path);
  }
  for(const path of ['/v2/oculta','/v2/admin','/v2/conta-preview/extra']){
   const response=await fetch(base+path,{redirect:'manual'});
   assert.equal(response.status,403,path);
  }
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});
test('retired V2 preview URLs redirect to unchanged original profile and settings',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const navigation=readFileSync(new URL('../src/components/Navigation.jsx',import.meta.url),'utf8');
 const legacyProfile=readFileSync(new URL('../src/pages/ProfilePage.jsx',import.meta.url),'utf8');
 assert.match(app,/path="\/perfil"/);
 assert.match(app,/path="\/conta"/);
 assert.match(app,/path="\/configuracoes"/);
 for(const [preview,original] of [['perfil-preview','perfil'],['conta-preview','conta'],['configuracoes-preview','configuracoes']]){
  assert.ok(app.includes('<Route path="/v2/'+preview+'" element={<Navigate to="/'+original+'" replace/>}/>'),preview);
 }
 assert.doesNotMatch(app,/ProfilePreviewPage/);
 assert.ok(navigation.includes("to:'/perfil'"));
 assert.ok(navigation.includes('to="/configuracoes"'));
 assert.match(legacyProfile,/export default function ProfilePage/);
});
