import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {emptyData} from './storage.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('application wires partner keys ahead of browser CSRF without weakening browser writes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'vano-partner-http-')),raw=randomBytes(32).toString('hex'),data=emptyData();
 data.users=[{id:'admin_test_user',email:'miguelpinxs@gmail.com',name:'Admin',verifiedAt:new Date().toISOString(),verificationMethod:'google'}];
 data.sessions=[{userId:'admin_test_user',tokenHash:hash(raw),expires:Date.now()+600000}];
 await writeFile(path.join(dir,'store.json'),JSON.stringify(data),{mode:0o600});
 // Import an isolated server in a separate process with an OS-assigned port.
 const env={...process.env,NODE_ENV:'test',VANO_DISABLE_AUTOSTART:'1',VANO_DATA_FILE:path.join(dir,'store.json'),VANO_SECURITY_SECRET:'test-only-secret-12345678901234567890',VANO_SPTRANS_LIVE_ENABLED:'0',VANO_PUBLIC_ORIGIN:'',MAPBOX_SECRET_TOKEN:'',VITE_MAPBOX_PUBLIC_TOKEN:'',VANO_V1_API_URL:'',DATABASE_URL:'',VANO_REQUIRE_POSTGRES:'0',VANO_PARTNER_API_ENABLED:'1'};
 for(const key of ['PORT','API_HOST','API_PORT','RENDER','RENDER_SERVICE_TYPE','VANO_DEV_HTTPS'])delete env[key];
 const serverProcess=spawn(process.execPath,['--input-type=module','-e',"const {server}=await import('./server/index.mjs');server.listen(0,'127.0.0.1',()=>console.log('PARTNER_TEST_PORT='+server.address().port));"],{cwd:new URL('../',import.meta.url),env,stdio:['ignore','pipe','pipe']});
 let logs='';serverProcess.stderr.on('data',b=>logs+=b.toString());
 try{
  const port=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('Startup timeout')),10000);serverProcess.stdout.on('data',b=>{buffer+=b.toString();const m=buffer.match(/PARTNER_TEST_PORT=(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});serverProcess.once('exit',()=>{clearTimeout(timer);reject(Error('Server exit '+logs));});});
  const origin='http://127.0.0.1:'+port,cookie='vano_session='+raw;
  assert.equal((await fetch(origin+'/api/admin/partner-keys')).status,403);
  const boot=await (await fetch(origin+'/api/bootstrap',{headers:{Cookie:cookie}})).json();assert.ok(boot.user.isAdmin);
  assert.equal((await fetch(origin+'/integracoes',{headers:{Cookie:cookie}})).status,200);
  const create=await fetch(origin+'/api/admin/partner-keys',{method:'POST',headers:{Cookie:cookie,'X-VANO-CSRF':boot.csrfToken,'Content-Type':'application/json'},body:JSON.stringify({name:'Social test',origins:['https://social.example']})});assert.equal(create.status,201);
  const key=(await create.json()).data.api_key;
  const saved=JSON.parse(await readFile(path.join(dir,'store.json'),'utf8'));assert.equal(saved.partnerKeys.length,1);assert.ok(!JSON.stringify(saved).includes(key));
  const auth={Authorization:'Bearer '+key};assert.equal((await fetch(origin+'/api/partner/v1/capabilities',{headers:auth})).status,200);
  const routes=await fetch(origin+'/api/partner/v1/routes',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({origin:{lat:-23.56,lng:-46.65},destination:{lat:-23.58,lng:-46.66}})});
  assert.equal(routes.status,503);assert.equal((await routes.json()).error.code,'REAL_PROVIDER_REQUIRED');
  assert.equal((await fetch(origin+'/api/preferences',{method:'PATCH',headers:{...auth,'Content-Type':'application/json'},body:'{"vehicle":"moto"}'})).status,403);
 }finally{serverProcess.kill();await new Promise(r=>serverProcess.once('exit',r));await rm(dir,{recursive:true,force:true});}
},{timeout:20000});
