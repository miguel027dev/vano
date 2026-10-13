import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { scryptSync, createHash } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function start(extraEnv={},initialData=null){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vano-security-'));
 if(initialData!==null)await fs.writeFile(path.join(tmp,'store.json'),JSON.stringify(initialData),{mode:0o600});
 const port=await freePort();
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'development',API_PORT:String(port),VANO_DATA_FILE:path.join(tmp,'store.json'),VANO_SECURITY_SECRET:'security-test-secret-only-keep-local-123456789',...extraEnv},stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',b=>logs+=String(b));
 const origin=`http://127.0.0.1:${port}`;
 for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('Server stopped: '+logs);try{const r=await fetch(origin+'/api/health');if(r.ok)break;}catch{}await sleep(80);if(i===89)throw Error('Server timeout: '+logs);}
 return {origin,tmp,child,async stop(){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1000)]);await fs.rm(tmp,{recursive:true,force:true})}};
}
function client(origin){
 const cookies=new Map();let csrf='';
 return {
  get csrf(){return csrf},get cookie(){return [...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},
  async call(url,method='GET',data,headers={}){
   const r=await fetch(origin+url,{method,headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(cookies.size?{'Cookie':[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(method==='GET'?{}:{'X-VANO-CSRF':csrf}),...headers},body:data!==undefined?JSON.stringify(data):undefined,redirect:'manual'});
   const all=r.headers.getSetCookie?.() || (r.headers.get('set-cookie')?[r.headers.get('set-cookie')]:[]);
   for(const item of all){const match=item.match(/^([^=]+)=([^;]*)/);if(match){if(match[2])cookies.set(match[1],match[2]);else cookies.delete(match[1]);}}
   let body=null;try{body=await r.json()}catch{}
   if(body?.csrfToken)csrf=body.csrfToken;
   return {status:r.status,data:body,headers:r.headers};
  },
 };
}
const coords=[-46.6557,-23.5615];
test('walking is accepted by the route API and does not fall through to the driving engine',async()=>{
 const s=await start({MAPBOX_SECRET_TOKEN:'',VITE_MAPBOX_PUBLIC_TOKEN:'',VANO_V1_API_URL:'https://unused.invalid'}),a=client(s.origin);
 try{
  await a.call('/api/bootstrap');
  const result=await a.call('/api/route','POST',{origin:coords,destination:[-46.65,-23.56],vehicle:'a-pe'});
  assert.equal(result.status,503);
  assert.match(result.data.error,/a pé não configurado/);
 }finally{await s.stop();}
});
test('Autorização, sessão segura, CSRF, perfil e histórico validado',async()=>{
 const s=await start(),a=client(s.origin),b=client(s.origin);
 try{
  assert.equal((await a.call('/api/bootstrap')).status,200);
  await b.call('/api/bootstrap');
  assert.notEqual(a.csrf,b.csrf);
  assert.equal((await b.call('/api/preferences','PATCH',{vehicle:'moto'}, {'Origin':'https://evil.example'})).status,403);
  const unsafe=await fetch(s.origin+'/api/preferences',{method:'PATCH',headers:{Cookie:a.cookie,'Content-Type':'application/json'},body:'{"vehicle":"moto"}'});
  assert.equal(unsafe.status,403);
  assert.equal((await a.call('/api/preferences','PATCH',{vehicle:'moto',preferredRoute:'fast'})).status,200);
  assert.equal((await b.call('/api/bootstrap')).data.preferences.vehicle,'carro');
  const account=await a.call('/api/auth/signup','POST',{name:'Pessoa Teste',email:'tester@example.test',password:'SenhaUnicaFortissima123!'});
  assert.equal(account.status,201);assert.equal(account.data.user.name,'Pessoa Teste');
  const file=JSON.parse(await fs.readFile(path.join(s.tmp,'store.json'),'utf8'));
  assert.ok(file.sessions[0].tokenHash);assert.equal(file.sessions[0].token,undefined);
  assert.equal((await fs.stat(path.join(s.tmp,'store.json'))).mode&0o777,0o600);
  assert.equal((await fs.stat(s.tmp)).mode&0o777,0o700);
  assert.equal((await a.call('/api/bootstrap')).data.preferences.vehicle,'moto');
  assert.equal((await a.call('/api/profile','PATCH',{name:'Nome Atualizado'})).status,200);
  assert.equal((await a.call('/api/favorites','POST',{name:'Local pessoal',coords})).status,201);
  assert.equal((await b.call('/api/bootstrap')).data.favorites.length,0);
  assert.equal((await a.call('/api/history','POST',{destination:{name:'MASP',coords},duration:-300,distance:999999})).status,422);
  assert.equal((await a.call('/api/reports','POST',{coords,type:'transito',description:'Trânsito lento'})).status,201);
  assert.equal((await a.call('/api/bootstrap')).data.reports.length,1);
  assert.equal((await b.call('/api/bootstrap')).data.reports.length,0);
  assert.equal((await a.call('/api/bootstrap')).data.reports[0].owner,undefined);
  assert.equal((await a.call('/api/profile','DELETE',{password:'errado'})).status,401);
  assert.equal((await a.call('/api/profile','DELETE',{password:'SenhaUnicaFortissima123!'})).status,200);
  assert.equal((await a.call('/api/bootstrap')).data.user,null);
 }finally{await s.stop();}
},{timeout:30000});

test('Limite de cadastros é por IP, independentemente do e-mail',async()=>{
 const s=await start(),a=client(s.origin);
 try{
  await a.call('/api/bootstrap');const statuses=[];
  for(let i=0;i<7;i++){const r=await a.call('/api/auth/signup','POST',{name:'Pessoa Teste',email:`test-${i}@example.test`,password:'UmaSenhaMuitoForte123!' });statuses.push(r.status);}
  assert.ok(statuses.includes(429),statuses.join(','));
 }finally{await s.stop();}
},{timeout:30000});

test('Assinatura de rota real bloqueia alteração de métricas e replay',async()=>{
 const mock=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');const duration=u.searchParams.get('mode')==='fastest'?750:900;
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({selected_id:0,routes:[{id:0,distance:4400,duration,geometry:{type:'LineString',coordinates:[[-46.68,-23.58],coords]},steps:[],micro_route:true}]}));
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const s=await start({VANO_V1_API_URL:`http://127.0.0.1:${mock.address().port}`}),a=client(s.origin),b=client(s.origin);
 try{
  await a.call('/api/bootstrap');await b.call('/api/bootstrap');
  const d=await a.call('/api/route','POST',{origin:[-46.68,-23.58],destination:coords,vehicle:'carro'});
  assert.equal(d.status,200,JSON.stringify(d.data));
  const proof=d.data.routes.find(x=>x.id==='fast').proof;assert.ok(proof);
  assert.equal((await b.call('/api/history','POST',{destination:{name:'MASP',coords},proof})).status,422);
  const valid=await a.call('/api/history','POST',{destination:{name:'MASP',coords},proof,distance:99999,duration:-1});
  assert.equal(valid.status,201);assert.equal(valid.data.distance,4.4);assert.equal(valid.data.duration,13);
  assert.equal((await a.call('/api/history','POST',{destination:{name:'MASP',coords},proof})).status,422);
 }finally{await s.stop();await new Promise(r=>mock.close(r));}
},{timeout:30000});

test('Corromper banco não apaga contas silenciosamente; produção falha sem config',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vano-corrupt-'));
 const file=path.join(tmp,'store.json');await fs.writeFile(file,'{{bad-json');
 const p=await freePort();const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,API_PORT:String(p),VANO_DATA_FILE:file},stdio:['ignore','pipe','pipe']});
 let output='';for await(const chunk of child.stderr)output+=String(chunk);
 assert.notEqual(child.exitCode,0);assert.match(output,/integridade do banco/i);assert.equal(await fs.readFile(file,'utf8'),'{{bad-json');
 await fs.rm(tmp,{recursive:true,force:true});
 const child2=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',VANO_PUBLIC_ORIGIN:'',VANO_SECURITY_SECRET:''},stdio:['ignore','pipe','pipe']});
 let out2='';for await(const chunk of child2.stderr)out2+=String(chunk);
 assert.notEqual(child2.exitCode,0);assert.match(out2,/VANO_PUBLIC_ORIGIN/);
},{timeout:12000});

test('Confirmação de e-mail e redefinição de senha são de uso único',async()=>{
 const verifyRaw='ab'.repeat(32),resetRaw='cd'.repeat(32),salt='abcd1234abcd1234abcd1234abcd1234';
 const hash=t=>createHash('sha256').update(t).digest('hex');
 const fixture={users:[{id:'testuser',name:'Conta Antiga',email:'test@example.test',passwordHash:`${salt}:${scryptSync('SenhaAntigaForte123!',salt,64).toString('hex')}`,verifiedAt:null,createdAt:new Date().toISOString()}],sessions:[],favorites:[],history:[],reports:[],preferences:[],routines:[],usedProofs:[],emailTokens:[{userId:'testuser',kind:'verify',tokenHash:hash(verifyRaw),expires:Date.now()+600000},{userId:'testuser',kind:'reset',tokenHash:hash(resetRaw),expires:Date.now()+600000}]};
 const s=await start({},fixture),a=client(s.origin);
 try{
  await a.call('/api/bootstrap');
  assert.equal((await a.call('/api/auth/login','POST',{email:'test@example.test',password:'SenhaAntigaForte123!'})).status,403);
  assert.equal((await a.call('/api/auth/verify?token='+verifyRaw)).status,302);
  assert.equal((await a.call('/api/auth/verify?token='+verifyRaw)).status,302);
  assert.equal((await a.call('/api/auth/login','POST',{email:'test@example.test',password:'SenhaAntigaForte123!'})).status,200);
  assert.equal((await a.call('/api/auth/reset','POST',{token:resetRaw,password:'MinhaNovaSenhaFortissima!'})).status,200);
  await a.call('/api/bootstrap');
  assert.equal((await a.call('/api/auth/reset','POST',{token:resetRaw,password:'UmaTerceiraSenhaMuitoForte!'})).status,400);
  assert.equal((await a.call('/api/bootstrap')).data.user,null);
  assert.equal((await a.call('/api/auth/login','POST',{email:'test@example.test',password:'MinhaNovaSenhaFortissima!'})).status,200);
  assert.equal((await a.call('/api/auth/login','POST',{email:'test@example.test',password:'SenhaAntigaForte123!'})).status,401);
 }finally{await s.stop();}
},{timeout:30000});

test('Cabeçalhos defensivos, permissões e bloqueio de conteúdo malformado',async()=>{
 const s=await start(),a=client(s.origin);
 try{
  const boot=await a.call('/api/bootstrap');
  assert.equal(boot.headers.get('x-frame-options'),'DENY');
  assert.equal(boot.headers.get('referrer-policy'),'no-referrer');
  assert.equal(boot.headers.get('x-content-type-options'),'nosniff');
  const report=await a.call('/api/reports','POST',{type:'risco',coords,description:'Teste interno'});
  assert.equal(report.status,201);assert.equal(report.data.owner,undefined);
  assert.equal(report.data.coords[0],-46.656);assert.ok(Math.abs(report.data.coords[1]-coords[1])<=0.001);
  const large=await a.call('/api/preferences','PATCH',{routineTags:Array(12000).fill('Casa')});
  assert.equal(large.status,413);
  assert.equal((await a.call('/api/preferences','PATCH',{vehicle:'carro'})).status,200);
 }finally{await s.stop();}
},{timeout:30000});

test('Migração invalida sessões legadas sem apagar usuários e favoritos',async()=>{
 const legacy={users:[{id:'old',name:'Legado',email:'legacy@example.test',passwordHash:'salthash:deadbeef',createdAt:new Date().toISOString()}],sessions:[{token:'aa'.repeat(32),userId:'old',expires:Date.now()+600000}],favorites:[{id:'fav',owner:'old',name:'Casa',coords,createdAt:new Date().toISOString()}],history:[],reports:[],preferences:[],routines:[]};
 const s=await start({},legacy),a=client(s.origin);
 try{
  const json=JSON.parse(await fs.readFile(path.join(s.tmp,'store.json'),'utf8'));
  assert.equal(json.users.length,1);assert.equal(json.favorites.length,1);assert.equal(json.sessions.length,0);
  assert.equal(json.users[0].verificationMethod,'legacy');
  assert.equal((await a.call('/api/bootstrap')).status,200);
  assert.equal((await fs.stat(path.join(s.tmp,'store.json'))).mode&0o777,0o600);
  const siblings=await fs.readdir(s.tmp);assert.ok(!siblings.includes('store.json.bak'));
 }finally{await s.stop();}
},{timeout:12000});

test('Produção recusa HTTP direto e aplica CSP e cookies Secure',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vano-prod-'));const port=await freePort();
 const env={...process.env,NODE_ENV:'production',API_PORT:String(port),API_HOST:'127.0.0.1',VANO_DATA_FILE:path.join(tmp,'store.json'),VANO_PUBLIC_ORIGIN:'https://vano.example.test',VANO_SECURITY_SECRET:'production-test-secret-keep-private-1234567890',RESEND_API_KEY:'test-only',VANO_EMAIL_FROM:'VANO <auth@example.test>',VANO_ALLOW_SINGLE_INSTANCE_JSON:'1',VITE_MAPBOX_PUBLIC_TOKEN:'pk.public-test-only',VITE_DEMO_MODE:'false'};
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',b=>err+=String(b));
 const url=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<60;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/api/health', {headers:{'X-Forwarded-Proto':'https'}});if(r.ok){ready=true;break}}catch{}await sleep(70)}
  assert.ok(ready,err);
  const blocked=await fetch(url+'/api/health');assert.equal(blocked.status,426);
  const safe=await fetch(url+'/api/bootstrap',{headers:{'X-Forwarded-Proto':'https'}});
  assert.equal(safe.status,200);
  assert.ok(safe.headers.get('content-security-policy')?.includes("default-src 'self'"));
  assert.ok(safe.headers.get('strict-transport-security'));
  assert.match(safe.headers.get('set-cookie'),/Secure/);
 }finally{child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1000)]);await fs.rm(tmp,{recursive:true,force:true})}
},{timeout:12000});

test('A segunda instância é bloqueada ao usar o mesmo banco',async()=>{
 const s=await start(),port=await freePort();
 const contender=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'development',API_PORT:String(port),VANO_DATA_FILE:path.join(s.tmp,'store.json')},stdio:['ignore','pipe','pipe']});
 let output='';
 try {
  for await(const chunk of contender.stderr) output+=String(chunk);
  assert.notEqual(contender.exitCode,0);
  assert.match(output,/Banco em uso por outro processo/);
  const health=await fetch(s.origin+'/api/health');assert.equal(health.status,200);
 }finally{contender.kill();await s.stop();}
},{timeout:12000});

test('Cadastro persiste o idioma escolhido acima do país detectado',async()=>{
  const s=await start({VANO_TRUST_GEO_HEADERS:'1'}),a=client(s.origin),b=client(s.origin);
  try{
    const france=await a.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'FR','Accept-Language':'pt-BR'});
    assert.equal(france.status,200);
    assert.equal(france.data.localeSuggestion.country,'FR');
    assert.equal(france.data.preferences.language,'fr-FR');
    assert.equal(france.data.languageExplicit,false);
    const portugal=await b.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'PT','Accept-Language':'fr-FR'});
    assert.equal(portugal.data.preferences.language,'pt-PT');
    const signup=await a.call('/api/auth/signup','POST',{name:'Conta Internacional',email:'language@example.test',password:'LinguagemTeste2026#',language:'pt-PT'},{'CF-IPCountry':'FR'});
    assert.equal(signup.status,201);
    const saved=await a.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'FR'});
    assert.equal(saved.data.preferences.language,'pt-PT');
    assert.equal(saved.data.languageExplicit,true);
    assert.equal((await a.call('/api/preferences','PATCH',{language:'fr-FR'})).status,200);
    assert.equal((await a.call('/api/bootstrap')).data.preferences.language,'fr-FR');
    assert.equal((await a.call('/api/preferences','PATCH',{language:'invalid'})).status,400);
    const invalidSignup=await b.call('/api/auth/signup','POST',{name:'Conta',email:'invalid-locale@example.test',password:'LinguagemTeste2026#',language:'xx-XX'});
    assert.equal(invalidSignup.status,400);
  }finally{await s.stop();}
},{timeout:30000});

test('Preferência automática herdada de versão antiga não vence mudança de país',async()=>{
  const old={users:[],sessions:[],emailTokens:[],usedProofs:[],favorites:[],history:[],routines:[],reports:[],preferences:[]};
  const s=await start({VANO_TRUST_GEO_HEADERS:'1'},old),a=client(s.origin);
  try{
    await a.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'BR'});
    await a.call('/api/preferences','PATCH',{vehicle:'moto'});
    const actual=await a.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'FR'});
    assert.equal(actual.data.preferences.language,'fr-FR');
    assert.equal(actual.data.languageExplicit,false);
    await a.call('/api/preferences','PATCH',{language:'pt-PT'});
    const after=await a.call('/api/bootstrap','GET',undefined,{'CF-IPCountry':'FR'});
    assert.equal(after.data.preferences.language,'pt-PT');
    assert.equal(after.data.languageExplicit,true);
  }finally{await s.stop();}
},{timeout:30000});

test('persistent 90-day sessions survive a second device login and logout revokes only that device',async()=>{
 const s=await start(),a=client(s.origin),b=client(s.origin);
 try{
  await a.call('/api/bootstrap');await b.call('/api/bootstrap');
  const form={name:'Sessão persistente',email:'sessions@example.test',password:'SessionPasswordStrong123!'};
  const signup=await a.call('/api/auth/signup','POST',form);
  assert.equal(signup.status,201);assert.match(signup.headers.get('set-cookie'),/Max-Age=7776000/);
  assert.equal((await b.call('/api/auth/login','POST',form)).status,200);
  assert.ok((await a.call('/api/bootstrap')).data.user);assert.ok((await b.call('/api/bootstrap')).data.user);
  assert.equal((await a.call('/api/auth/logout','POST',{})).status,200);
  assert.equal((await a.call('/api/bootstrap')).data.user,null);assert.ok((await b.call('/api/bootstrap')).data.user);
 }finally{await s.stop();}
});

test('Mapas públicos: catálogo real, atribuição, caixa geográfica limitada e nenhuma posição inventada',async()=>{
 const server=await start();
 const clientPublic=client(server.origin);
 try{
  const sources=await clientPublic.call('/api/map-features/sources');
  assert.equal(sources.status,200);
  assert.ok(sources.data.sources.some(x=>x.id==='osm-overpass'&&x.active===true));
  assert.ok(sources.data.sources.some(x=>x.id==='overture-places'&&x.active===false));
  for(const bad of ['-180,-90,180,90','0,0,0,0','0,0,200,0','abc']){
    const result=await clientPublic.call('/api/map-features?bbox='+encodeURIComponent(bad));
    assert.equal(result.status,400);
  }
 }finally{await server.stop();}
});
