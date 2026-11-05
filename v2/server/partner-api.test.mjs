import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createPartnerAPI,parsePartnerRoute} from './partner-api.mjs';
import {partnerOpenAPI} from './partner-openapi.mjs';
import {emptyData} from './storage.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const base='/api/partner/v1';
const sample={origin:{lat:-23.5615,lng:-46.6557},destination:{lat:-23.5874,lng:-46.6597},mode:'car',profile:'fastest',alternatives:1};
async function setup(options={}){
 const db=emptyData(),key='vp_'+'a'.repeat(16)+'_'+'b'.repeat(64),other='vp_'+'c'.repeat(16)+'_'+'d'.repeat(64);
 let tick=Date.now(),saves=0,failSave=false,calls=[],searchCalls=[];
 db.partnerKeys=[{id:'a'.repeat(16),keyHash:hash(key),version:1,active:true,name:'Social',origins:['https://social.example'],scopes:['map:read','places:read','routes:read','reports:read','reports:write','traffic:read']},{id:'c'.repeat(16),keyHash:hash(other),version:1,active:true,name:'Other',origins:['https://other.example'],scopes:['map:read','places:read','routes:read']}];
 const route={id:'fast',distance:4.2,duration:13,geometry:{type:'LineString',coordinates:[[-46.6557,-23.5615],[-46.6597,-23.5874]]},steps:[{instruction:'Siga na avenida',distance:4200}],verifiedSafety:false};
 const api=createPartnerAPI({db,persist:async()=>{saves++;if(failSave)throw Error('private db secret');},secret:'test-only-partner-crypto-secret',origin:'https://vano.example',production:true,persistent:true,clock:()=>tick,
  headers:{'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'"},
  admin:req=>req.headers['x-test-admin']==='yes',csrfGuard:(req,res)=>{if(req.headers['x-test-csrf']==='yes')return true;res.writeHead(403);res.end('{}');return false;},
  services:{directions:async(...args)=>{calls.push(args);return options.result||{source:'real-fixture',routes:[route,{...route,id:'safe',duration:15,geometry:{type:'LineString',coordinates:[[-46.6557,-23.5615],[-46.65,-23.58],[-46.6597,-23.5874]]}}]};},search:async(...args)=>{searchCalls.push(args);return options.searchResults||[{name:'Lugar',address:'Rua 1',coords:[-46.65,-23.56],category:'local'}];},reverse:async()=>({found:true,address:{street:'Rua 1'}}),mapToken:()=> 'pk.public',routingReady:()=>true,embedHTML:()=>'<html>map</html>',mapRead:{'map-features':async()=>({features:[{id:'real-fixture',type:'hospital',coords:[-46.65,-23.56],name:'Hospital',source:'OpenStreetMap'}]})},read:{traffic:{scope:'traffic:read',bbox:true,run:async()=>({available:false,features:[]})}}}
 });
 const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res)){res.writeHead(404);res.end();}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 return {db,key,other,calls,searchCalls,get saves(){return saves;},set failSave(x){failSave=x;},advance:x=>tick+=x,
  async call(path,method='GET',body,extra={}){const r=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+key,...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});const raw=await r.text();let json;try{json=JSON.parse(raw);}catch{}return {status:r.status,headers:r.headers,json,raw};},
  close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
test('partner auth scopes and browser-origin boundary',async()=>{
 const s=await setup();try{
  assert.equal((await s.call(base+'/capabilities','GET',undefined,{Authorization:''})).status,401);
  assert.equal((await s.call(base+'/capabilities','GET',undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await s.call(base+'/capabilities')).json.data.partner_id,'a'.repeat(16));
  assert.equal((await s.call(base+'/traffic?bbox=-46.68,-23.59,-46.63,-23.54','GET',undefined,{Authorization:'Bearer '+s.other})).status,403);
  assert.equal((await s.call(base+'/traffic?bbox=-180,-80,180,80')).status,422);
  const traffic=await s.call(base+'/traffic?bbox=-46.68,-23.59,-46.63,-23.54');assert.equal(traffic.json.data.available,false);
 }finally{await s.close();}
});
test('route units, real geometry, isolation, recalculate and expiry',async()=>{
 const s=await setup();try{
  const r=await s.call(base+'/routes','POST',sample);assert.equal(r.status,200);const item=r.json.data.routes[0];
  assert.equal(item.duration_s,780);assert.equal(item.distance_m,4200);assert.equal(r.json.data.routes.length,2);
  assert.deepEqual(item.geometry.coordinates[0],[-46.6557,-23.5615]);assert.equal(item.traffic_status,'unknown');
  assert.equal((await s.call(base+'/routes/'+item.route_id,'GET',undefined,{Authorization:'Bearer '+s.other})).status,404);
  const fresh=await s.call(base+'/routes/'+item.route_id);assert.equal(fresh.status,200);assert.equal(s.calls.length,2);
  assert.equal((await s.call(base+'/routes/'+item.route_id+'/recalculate','POST',{origin:{lat:-23.56,lng:-46.64}})).status,200);
  assert.deepEqual(s.calls[2][0],[-46.64,-23.56]);
  const tail=item.route_id.slice(-1)==='A'?'B':'A';assert.equal((await s.call(base+'/routes/'+item.route_id.slice(0,-1)+tail)).status,404);
  s.advance(300001);assert.equal((await s.call(base+'/routes/'+item.route_id)).status,410);
 }finally{await s.close();}
});
test('reject unsupported routing and never serve demonstration as a real route',async()=>{
 for(const patch of [{origin:{lat:200,lng:1}},{mode:'bicycle'},{waypoints:[{}]},{departure_at:'tomorrow'},{mode:'walking',profile:'safe'},{mode:'walking',avoid:['tolls']},{alternatives:3},{surprise:true}])assert.throws(()=>parsePartnerRoute({...sample,...patch}));
 const s=await setup({result:{source:'demonstracao',routes:[]}});try{assert.equal((await s.call(base+'/routes','POST',sample)).status,503);}finally{await s.close();}
});
test('temporary place references are isolated and reverse validates missing input',async()=>{
 const s=await setup();try{
  const r=await s.call(base+'/places/search?q=Rua');assert.equal(r.status,200);const id=r.json.data.items[0].place_id;
  assert.equal((await s.call(base+'/places/'+id)).json.data.name,'Lugar');
  assert.equal((await s.call(base+'/places/'+id,'GET',undefined,{Authorization:'Bearer '+s.other})).status,404);
  assert.equal((await s.call(base+'/geocode/reverse?lat=&lng=1')).status,422);
  assert.equal((await s.call(base+'/geocode/reverse?lat=-23.56&lng=-46.65')).json.data.found,true);
 }finally{await s.close();}
});
test('embed token stays in fragment and only embed document relaxes frame policy',async()=>{
 const s=await setup();try{
  const b={allowed_origin:'https://social.example',center:sample.destination,markers:[{id:'x',...sample.destination,label:'<script>alert(1)</script>'}]};
  const created=await s.call(base+'/map-sessions','POST',b);assert.equal(created.status,201);
  const url=new URL(created.json.data.embed_url);assert.equal(url.search,'');assert.ok(url.hash.startsWith('#session='));
  const shell=await s.call(url.pathname);assert.equal(shell.headers.get('x-frame-options'),null);assert.match(shell.headers.get('content-security-policy'),/frame-ancestors https:\/\/social.example/);
  const token=new URLSearchParams(url.hash.slice(1)).get('session');
  const data=await s.call(base+'/map-session-data','GET',undefined,{Authorization:'Bearer '+token});assert.equal(data.status,200);assert.equal(data.json.data.mapbox_public_token,'pk.public');
  assert.equal((await s.call(base+'/map-sessions','POST',{...b,allowed_origin:'https://evil.example'})).status,403);
  s.db.partnerKeys[0].active=false;assert.equal((await s.call(base+'/map-session-data','GET',undefined,{Authorization:'Bearer '+token})).status,401);
 }finally{await s.close();}
});
test('admin key lifecycle hashes secrets, requires CSRF and rolls back failed saves',async()=>{
 const s=await setup();try{
  const path='/api/admin/partner-keys',b={name:'Partner',origins:['https://social.example']};
  assert.equal((await s.call(path,'POST',b)).status,403);
  assert.equal((await s.call(path,'POST',b,{'X-Test-Admin':'yes'})).status,403);
  const headers={'X-Test-Admin':'yes','X-Test-Csrf':'yes'},r=await s.call(path,'POST',b,headers);assert.equal(r.status,201);
  const raw=r.json.data.api_key,k=s.db.partnerKeys.find(k=>k.id===r.json.data.id);assert.equal(k.keyHash,hash(raw));assert.ok(!JSON.stringify(k).includes(raw));
  assert.ok(!k.scopes.includes('reports:write'));assert.ok(!(await s.call(path,'GET',undefined,headers)).raw.includes(raw));
  s.failSave=true;const failed=await s.call(path+'/'+k.id+'/rotate','POST',undefined,headers);assert.equal(failed.status,503);assert.equal(k.keyHash,hash(raw));assert.ok(!failed.raw.includes('private db secret'));
  s.failSave=false;const rotated=await s.call(path+'/'+k.id+'/rotate','POST',undefined,headers);assert.equal(rotated.status,200);
  assert.equal((await s.call(base+'/capabilities','GET',undefined,{Authorization:'Bearer '+raw})).status,401);
  assert.equal((await s.call(base+'/capabilities','GET',undefined,{Authorization:'Bearer '+rotated.json.data.api_key})).status,200);
  assert.equal((await s.call(path+'/'+k.id,'DELETE',undefined,headers)).status,200);
  assert.equal((await s.call(base+'/capabilities','GET',undefined,{Authorization:'Bearer '+rotated.json.data.api_key})).status,401);
 }finally{await s.close();}
});
test('report writes are scoped, idempotent and cannot confirm own report',async()=>{
 const s=await setup();try{
  const body={actor_id:'pseudonym_1',type:'acidente',...sample.origin,description:'Relato de teste'},header={'Idempotency-Key':'a-unique-idempotency-key'};
  const r=await s.call(base+'/reports','POST',body,header);assert.equal(r.status,201);assert.equal(r.json.data.status,'nao_verificado');assert.equal(r.json.data.owner,undefined);
  assert.equal((await s.call(base+'/reports','POST',body,header)).status,200);assert.equal(s.db.reports.length,1);
  assert.equal((await s.call(base+'/reports','POST',{...body,description:'Mudou'},header)).status,409);
  const p=base+'/reports/'+r.json.data.id+'/confirmations';
  assert.equal((await s.call(p,'POST',{actor_id:'pseudonym_1',choice:'present'})).status,403);
  assert.equal((await s.call(p,'POST',{actor_id:'pseudonym_2',choice:'present'})).status,200);
  assert.equal((await s.call(p,'POST',{actor_id:'pseudonym_2',choice:'present'})).json.data.already_recorded,true);
 }finally{await s.close();}
});
test('input size, malformed JSON, rate limit and spec routes',async()=>{
 const s=await setup();try{
  assert.equal((await s.call(base+'/routes','POST','{oops')).status,400);
  assert.equal((await s.call(base+'/routes','POST',JSON.stringify({x:'a'.repeat(17000)}))).status,413);
  const openapi=await s.call(base+'/openapi.json','GET',undefined,{Authorization:''});assert.equal(openapi.status,200);assert.equal(openapi.json.openapi,'3.1.0');
  assert.ok(partnerOpenAPI().paths['/routes/{route_id}/recalculate']);
  for(let i=0;i<61;i++)await s.call(base+'/capabilities');
  const limited=await s.call(base+'/capabilities');assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
 }finally{await s.close();}
});
test('browser session searches with location and receives complete map feeds without leaking permanent keys',async()=>{
 const s=await setup({searchResults:Array.from({length:25},(_,i)=>({name:'Rua '+i,address:'Cidade',coords:[-46.65,-23.56]}))});try{
  const created=await s.call(base+'/map-sessions','POST',{allowed_origin:'https://social.example',center:sample.origin});
  assert.equal(created.status,201);const token=created.json.data.browser_token;assert.ok(token&&!token.startsWith('vp_'));
  const auth={Authorization:'Bearer '+token,Origin:'https://social.example','Sec-Fetch-Site':'cross-site'};
  const preflight=await s.call(base+'/places/search','OPTIONS',undefined,{Origin:'https://social.example','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://social.example');
  assert.equal((await s.call(base+'/places/search','OPTIONS',undefined,{Origin:'https://evil.example'})).status,403);
  const found=await s.call(base+'/places/search?query=Rua&lat=-23.56&lng=-46.65&limit=30','GET',undefined,auth);
  assert.equal(found.status,200);assert.equal(found.json.data.items.length,25);assert.equal(found.json.data.proximity_applied,true);
  assert.deepEqual(s.searchCalls[0].slice(0,3),['Rua','pt-BR',[-46.65,-23.56]]);assert.equal(s.searchCalls[0][3].limit,30);
  assert.ok(found.json.data.items[0].coords);assert.ok(found.json.data.items[0].id);
  assert.equal((await s.call(base+'/places/search?q=Rua&lat=','GET',undefined,auth)).status,422);
  const pins=await s.call(base+'/map-data?service=map-features&bbox=-46.68,-23.59,-46.63,-23.54','GET',undefined,auth);
  assert.equal(pins.status,200);assert.equal(pins.json.data.features[0].type,'hospital');
  assert.equal((await s.call(base+'/map-data?service=admin/users&bbox=-46.68,-23.59,-46.63,-23.54','GET',undefined,auth)).status,404);
  assert.equal((await s.call(base+'/places/search?q=Rua','GET',undefined,{...auth,Origin:'https://other.example'})).status,403);
  assert.equal((await s.call(base+'/map-sessions','POST',{allowed_origin:'https://social.example',center:sample.origin},auth)).status,403);
  assert.equal((await s.call(base+'/reports','POST',{actor_id:'x'},auth)).status,403);
  assert.equal((await s.call(base+'/routes','POST',sample,auth)).status,200);
 }finally{await s.close();}
});
test('browser tokens renew until their original deadline and remain revocable',async()=>{
 const s=await setup();try{
  const created=await s.call(base+'/map-sessions','POST',{allowed_origin:'https://social.example',center:sample.origin});
  const token=created.json.data.browser_token;s.advance(4*60000);
  const renewed=await s.call(base+'/map-sessions/renew','POST',undefined,{Authorization:'Bearer '+token,Origin:'https://social.example'});
  assert.equal(renewed.status,200);assert.notEqual(renewed.json.data.browser_token,token);
  s.advance(61000);assert.equal((await s.call(base+'/map-session-data','GET',undefined,{Authorization:'Bearer '+token})).status,410);
  const headers={Authorization:'Bearer '+renewed.json.data.browser_token,Origin:'https://social.example'};
  assert.equal((await s.call(base+'/map-session-data','GET',undefined,headers)).status,200);
  s.db.partnerKeys[0].active=false;assert.equal((await s.call(base+'/map-sessions/renew','POST',undefined,headers)).status,401);
 }finally{await s.close();}
});
