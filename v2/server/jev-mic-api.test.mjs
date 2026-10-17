import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function portNumber(){
 const server=createServer();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 await new Promise(r=>server.close(r));
 return port;
}
test('V1 and private V2 microphone policies are enabled, STT disabled and audio protected',async()=>{
 const port=await portNumber(),tmp=await mkdtemp(path.join(tmpdir(),'vano-jev-mic-'));
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{
   ...process.env,NODE_ENV:'development',RENDER:'false',VANO_STT_ENABLED:'0',
   PORT:String(port),API_HOST:'127.0.0.1',DATABASE_URL:'',
   VANO_DATA_FILE:path.join(tmp,'data.json'),VANO_SECURITY_SECRET:'mock-secret-for-v2-jev-audio-test-only-12345'
 },stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk.toString());
 const url='http://127.0.0.1:'+port;
 try{
   let ok=false;
   for(let i=0;i<80;i++){
     try{const response=await fetch(url+'/api/health');if(response.ok){ok=true;break;}}catch{/* cold start */}
     if(child.exitCode!==null)break;
     await pause(85);
   }
   assert.ok(ok,'Server did not start: '+stderr.slice(-1000));
   const capabilities=await fetch(url+'/api/v2/assistant/audio-capabilities');
   assert.equal(capabilities.status,200);
   assert.equal((await capabilities.json()).serverTranscription,false);
   const forbidden=await fetch(url+'/api/v2/assistant/transcribe',{method:'POST',body:Buffer.alloc(1100),headers:{'Content-Type':'audio/webm'}});
   assert.equal(forbidden.status,403);
   const bootstrap=await fetch(url+'/api/bootstrap');
   const csrf=(await bootstrap.json()).csrfToken;
   const cookie=(bootstrap.headers.get('set-cookie')||'').split(';')[0];
   assert.ok(cookie&&csrf);
   const response=await fetch(url+'/api/v2/assistant/transcribe',{method:'POST',
    body:Buffer.alloc(1100),headers:{Cookie:cookie,'X-VANO-CSRF':csrf,'Content-Type':'audio/webm'}});
   assert.equal(response.status,503);
   assert.match((await response.json()).error,/não configurada/);
   const source=await readFile(path.join(root,'server/index.mjs'),'utf8');
   assert.match(source,/voiceDocument=\(name==='\/v2'\|\|name==='\/mapa'\)/);
   assert.match(source,/microphone=\(self\)/);
   assert.match(source,/microphone=\(\)/);
 }finally{
   child.kill();
   await Promise.race([new Promise(r=>child.once('exit',r)),pause(1200)]);
   await rm(tmp,{recursive:true,force:true});
 }
},{timeout:20000});
