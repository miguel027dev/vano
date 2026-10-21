import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const server=net.createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const p=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return p;
}
test('hosted production remains available without Resend but refuses unverified email signup',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vano-no-mail-'));
 const port=await freePort();
 const env={...process.env,NODE_ENV:'production',RENDER:'true',RENDER_SERVICE_TYPE:'web',
  API_HOST:'127.0.0.1',API_PORT:String(port),VANO_DATA_FILE:path.join(dir,'store.json'),
  VANO_PUBLIC_ORIGIN:'https://vano.example.test',
  VANO_SECURITY_SECRET:'test-secret-for-test-only-please-do-not-use-live-123456',
  DATABASE_URL:'',VANO_ALLOW_SINGLE_INSTANCE_JSON:'1',
  RESEND_API_KEY:'',VANO_EMAIL_FROM:'',VITE_MAPBOX_PUBLIC_TOKEN:'pk.test-only-token',
  VITE_DEMO_MODE:'false',VANO_V1_API_URL:'',MAPBOX_SECRET_TOKEN:''};
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let errors='';
 child.stderr.on('data',s=>errors+=s.toString());
 const base='http://127.0.0.1:'+port;
 const https={'X-Forwarded-Proto':'https'};
 try{
  let healthy=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(base+'/api/health',{headers:https});if(r.ok){healthy=true;break}}catch{}
   await sleep(75);
  }
  assert.equal(healthy,true,'Server must start without email credentials: '+errors);
  const health=await (await fetch(base+'/api/health',{headers:https})).json();
  assert.deepEqual(health,{ok:true},'public readiness must not disclose production or provider configuration');
  const boot=await fetch(base+'/api/bootstrap',{headers:https});
  assert.equal(boot.status,200);
  const cookie=boot.headers.get('set-cookie')?.split(';')[0]||'';
  const csrf=(await boot.json()).csrfToken;
  assert.ok(cookie&&csrf,'valid guest bootstrap required');
  const signup=await fetch(base+'/api/auth/signup',{
   method:'POST',
   headers:{...https,'Origin':'https://vano.example.test','Content-Type':'application/json',
    'Cookie':cookie,'X-VANO-CSRF':csrf},
   body:JSON.stringify({name:'Usuário Teste',email:'test-signup@example.test',password:'StrongPassword1234!'})});
  assert.equal(signup.status,503,'must never silently create an unverified email account');
  assert.match((await signup.json()).error,/indisponível/i);
  const blockHttp=await fetch(base+'/api/health');
  assert.equal(blockHttp.status,426);
 }finally{
  child.kill();
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1500)]);
  await rm(dir,{recursive:true,force:true});
 }
},{timeout:18000});
