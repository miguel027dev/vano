import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalyticsHTTP,ANALYTICS_POLICY} from './analytics-http.mjs';
function harness(overrides={}){
 let response,ingested=0;
 const user={id:'account',analyticsConsent:{policy:ANALYTICS_POLICY,allowed:true}};
 const args={pathname:'/api/observability/events',req:{method:'POST'},res:{},
  runtime:{enabled:true,ready:Promise.resolve({ingest:async()=>{ingested++;return {status:202,accepted:1};}})},
  userSession:()=>({user}),isAdminAccount:()=>false,protectedWrite:()=>true,limits:()=>true,limitAccount:()=>true,
  getBody:async()=>({}),persist:async()=>{},json:(res,status,body)=>{response={status,body};},
  err:(res,status,error)=>{response={status,error};},...overrides};
 return {run:()=>handleAnalyticsHTTP(args),get response(){return response;},get ingested(){return ingested;},user,args};
}
test('requires authentication, consent and CSRF before touching durable ingestion',async()=>{
 const unauth=harness({userSession:()=>null});await unauth.run();assert.equal(unauth.response.status,401);assert.equal(unauth.ingested,0);
 const noConsent=harness();noConsent.user.analyticsConsent.allowed=false;await noConsent.run();assert.equal(noConsent.response.status,403);assert.equal(noConsent.ingested,0);
 const csrf=harness({protectedWrite:()=>false});await csrf.run();assert.equal(csrf.ingested,0);
});
test('does not expose admin data to ordinary accounts, and fails closed when disabled',async()=>{
 const admin=harness({pathname:'/api/admin/observability',req:{method:'GET'}});await admin.run();assert.equal(admin.response.status,403);
 const disabled=harness({runtime:{enabled:false}});await disabled.run();assert.equal(disabled.response.status,404);assert.equal(disabled.ingested,0);
});
test('does not acknowledge ingestion when durable storage fails',async()=>{
 const broken=harness({runtime:{enabled:true,ready:Promise.resolve({ingest:async()=>{throw Error('db');}})}});
 await broken.run();assert.equal(broken.response.status,503);
});
test('rolls back a consent mutation if persistence fails',async()=>{
 const h=harness({pathname:'/api/observability/consent',getBody:async()=>({policy:ANALYTICS_POLICY,allowed:false}),persist:async()=>{throw Error('db');}});
 await h.run();assert.equal(h.response.status,503);assert.equal(h.user.analyticsConsent.allowed,true);
});
