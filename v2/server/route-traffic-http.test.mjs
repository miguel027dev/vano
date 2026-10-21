import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sha256,csrfToken} from './security.mjs';
const folder=mkdtempSync(path.join(tmpdir(),'vano-route-traffic-'));
const secret='local-route-traffic-test-secret-1234567890';
const adminToken='a'.repeat(64),userToken='b'.repeat(64);
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';process.env.VANO_TOMTOM_API_KEY='';
process.env.VANO_SECURITY_SECRET=secret;process.env.VANO_DATA_FILE=path.join(folder,'store.json');
writeFileSync(process.env.VANO_DATA_FILE,JSON.stringify({
 users:[{id:'owner',email:'miguelpinxs@gmail.com',verifiedAt:'2026-01-01',verificationMethod:'google'},
 {id:'member',email:'member@example.test',verifiedAt:'2026-01-01',verificationMethod:'email'}],
 sessions:[{userId:'owner',tokenHash:sha256(adminToken),expires:Date.now()+600000},
 {userId:'member',tokenHash:sha256(userToken),expires:Date.now()+600000}]
}),{mode:0o600});
const {server}=await import('./index.mjs');
test('route traffic requires admin, CSRF and bounded geometry before provider enrichment',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const body={geometry:{type:'LineString',coordinates:[[-46.75,-23.58],[-46.74,-23.58]]},vehicle:'carro'};
 const post=(token,data=body,csrf=true)=>fetch(base+'/api/admin/route-traffic',{method:'POST',
  headers:{'Content-Type':'application/json',...(token?{Cookie:'vano_session='+token}:{}),
   ...(csrf&&token?{'X-VANO-CSRF':csrfToken(secret,'session:'+sha256(token))}:{})},body:JSON.stringify(data)});
 try{
  assert.equal((await post(null)).status,401);
  assert.equal((await post(userToken)).status,403);
  assert.equal((await post(adminToken,body,false)).status,403);
  assert.equal((await post(adminToken,{...body,fromMeters:-1})).status,400);
  const response=await post(adminToken);assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/private/);assert.match(response.headers.get('cache-control'),/no-store/);
  const result=await response.json();assert.equal(result.status,'unconfigured');assert.equal(result.affectsEta,false);
  assert.deepEqual(result.flow,[]);assert.deepEqual(result.incidents,[]);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true});}
});
