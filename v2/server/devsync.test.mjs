import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevSync} from './devsync.mjs';

function fixture({persistent=true}={}){
 const db={},saved=[];
 let clock=Date.parse('2026-10-29T12:00:00.000Z'),fail=false;
 const json=(res,status,payload)=>{res.status=status;res.payload=payload;};
 const err=(res,status,error)=>json(res,status,{error});
 const helpers={
  db,persistent,
  persist:async()=>{saved.push(JSON.parse(JSON.stringify(db)))},
  json,err,getBody:async req=>req.body,
  protectedWrite:(req,res)=>{if(req.csrf)return true;err(res,403,'CSRF obrigatório.');return false},
  userSession:req=>req.admin?{user:{email:'miguelpinxs@gmail.com',verifiedAt:'2026-01-01',verificationMethod:'google'}}:null,
  isAdminAccount:u=>Boolean(u?.email==='miguelpinxs@gmail.com'),
  limits:()=>true,now:()=>clock
 };
 const service=createDevSync(helpers);
 const call=async(path,{method='GET',admin=true,csrf=true,bearer='',body={}}={})=>{
  const req={method,admin,csrf,body,headers:{authorization:bearer?'Bearer '+bearer:''}};
  const res={};
  await service.handle(req,res,path);
  return {status:res.status,...res.payload};
 };
 return {call,saved,db,helpers,time:ms=>{clock+=ms},badPersist:()=>{fail=true}};
}
test('admin-only: guest, nonadmin and CSRF denied',async()=>{
 const x=fixture();
 assert.equal((await x.call('/api/admin/dev-sync/handoff',{admin:false})).status,401);
 assert.equal((await x.call('/api/admin/dev-sync/tasks',{method:'POST',csrf:false,body:{title:'Teste',area:'gps'}})).status,403);
 assert.equal((await x.call('/api/agent/dev-sync/handoff',{admin:false})).status,401);
 assert.equal(x.db.devSync.tasks.length,0);
});
test('work journal persisted, conflict blocked, claim/handoff and token never leak',async()=>{
 const x=fixture();
 const first=await x.call('/api/admin/dev-sync/tasks',{method:'POST',body:{title:'Corrigir GPS',area:'gps',actor:'Chat 1'}});
 const second=await x.call('/api/admin/dev-sync/tasks',{method:'POST',body:{title:'Outra tarefa GPS',area:'gps',actor:'Chat 2'}});
 assert.equal(first.status,201);assert.equal(second.status,201);
 const claim=await x.call('/api/admin/dev-sync/tasks/'+first.taskId+'/claim',{method:'POST',body:{actor:'Chat 1'}});
 assert.equal(claim.status,200);assert.ok(claim.leaseToken.length>=40);
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+second.taskId+'/claim',{method:'POST',body:{actor:'Chat 2'}})).status,409);
 const feed=await x.call('/api/admin/dev-sync/handoff');
 assert.equal(feed.stats.active,1);
 assert.ok(!JSON.stringify(feed).includes(claim.leaseToken));
 assert.ok(!JSON.stringify(feed).includes('leaseHash'));
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+first.taskId+'/transition',
  {method:'POST',body:{status:'done',summary:'Teste',leaseToken:'invalid'}})).status,409);
 const note=await x.call('/api/admin/dev-sync/events',{method:'POST',body:{kind:'progress',taskId:first.taskId,body:'Rotas corrigidas',actor:'Chat 1'}});
 assert.equal(note.status,201);
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+first.taskId+'/transition',
  {method:'POST',body:{status:'done',summary:'PR revisado e testado',leaseToken:claim.leaseToken}})).status,200);
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+second.taskId+'/claim',{method:'POST',body:{actor:'Chat 2'}})).status,200);
 assert.ok(x.saved.length>=5);
 const reopened=createDevSync(x.helpers);
 assert.equal(reopened.snapshot().tasks.find(t=>t.id===first.taskId).status,'done');
});
test('agent token scoped, tracked by name, revocable and can post progress',async()=>{
 const x=fixture();
 const key=await x.call('/api/admin/dev-sync/keys',{method:'POST',body:{name:'Argon'}});
 assert.equal(key.status,201);
 assert.ok(key.token.startsWith('vano_ds_'));
 assert.ok(!JSON.stringify(x.db).includes(key.token));
 const opts={admin:false,bearer:key.token};
 const handoff=await x.call('/api/agent/dev-sync/handoff',opts);
 assert.equal(handoff.status,200);
 assert.ok(!JSON.stringify(handoff).includes('keys'));
 const task=await x.call('/api/agent/dev-sync/tasks',{...opts,method:'POST',
  body:{title:'Auditar rota',area:'routing',actor:'Outro'}});
 assert.equal(task.status,201);
 assert.equal(x.db.devSync.tasks[0].actor,'Argon');
 const claim=await x.call('/api/agent/dev-sync/tasks/'+task.taskId+'/claim',{...opts,method:'POST',body:{}});
 assert.equal(claim.status,200);
 assert.equal((await x.call('/api/agent/dev-sync/events',{...opts,method:'POST',
  body:{taskId:task.taskId,kind:'progress',body:'Trabalhando'}})).status,409);
 assert.equal((await x.call('/api/agent/dev-sync/events',{...opts,method:'POST',
  body:{taskId:task.taskId,kind:'progress',body:'Trabalhando',leaseToken:claim.leaseToken,actor:'Outro'}})).status,201);
 assert.equal(x.db.devSync.events.at(-1).actor,'Argon');
 assert.equal((await x.call('/api/admin/dev-sync/keys/'+key.id+'/revoke',{method:'POST'})).status,200);
 assert.equal((await x.call('/api/agent/dev-sync/handoff',opts)).status,401);
});
test('lease expires after 15 minutes',async()=>{
 const x=fixture();
 const a=await x.call('/api/admin/dev-sync/tasks',{method:'POST',body:{title:'Tarefa A',area:'gps'}});
 const b=await x.call('/api/admin/dev-sync/tasks',{method:'POST',body:{title:'Tarefa B',area:'gps'}});
 const ca=await x.call('/api/admin/dev-sync/tasks/'+a.taskId+'/claim',{method:'POST'});
 x.time(16*60*1000);
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+b.taskId+'/claim',{method:'POST'})).status,200);
 assert.equal((await x.call('/api/admin/dev-sync/tasks/'+a.taskId+'/pulse',{method:'POST',body:{leaseToken:ca.leaseToken}})).status,409);
});
test('requires persistent storage for shared work',async()=>{
 const x=fixture({persistent:false});
 assert.equal((await x.call('/api/admin/dev-sync/handoff')).status,503);
});
