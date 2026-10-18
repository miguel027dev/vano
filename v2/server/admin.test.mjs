import test from 'node:test';
import assert from 'node:assert/strict';
import {isAdminAccount,ADMIN_EMAIL,signupMethod,adminMetrics,adminUsers,platformCategory,recordOperationalEvent} from './admin.mjs';
const owner={id:'a',name:'Proprietário',email:ADMIN_EMAIL,verifiedAt:'2026-10-01',verificationMethod:'google',googleSub:'109388900',signupMethod:'google'};
test('admin console is restricted to the specified verified email exclusively',()=>{
 assert.equal(ADMIN_EMAIL,'miguelpinxs@gmail.com');
 assert.equal(isAdminAccount(owner),true);
 assert.equal(isAdminAccount({...owner,verifiedAt:null}),false);
 assert.equal(isAdminAccount({...owner,verificationMethod:'dev'}),false);
 assert.equal(isAdminAccount({...owner,email:'other@example.com'}),false);
 assert.equal(isAdminAccount({...owner,email:'attacker@example.com',googleSub:owner.googleSub}),false);
 assert.equal(isAdminAccount({...owner,email:owner.email.toUpperCase()}),true);
 assert.equal(isAdminAccount({...owner,verificationMethod:'email',googleSub:''}),true);
 assert.equal(isAdminAccount({...owner,email:'other@example.com'},{
  VANO_ADMIN_EMAILS:'other@example.com',VANO_ADMIN_GOOGLE_SUBS:owner.googleSub
 }),false);
});
test('signup provenance is not confused with linking a Google login afterward',()=>{
 assert.equal(signupMethod(owner),'Google');
 assert.equal(signupMethod({...owner,signupMethod:'email',verificationMethod:'google'}),'E-mail e senha');
 assert.equal(signupMethod({...owner,signupMethod:undefined,verificationMethod:'google'}),'Google (registro anterior)');
 assert.equal(signupMethod({...owner,signupMethod:undefined,verificationMethod:'dev'}),'Não registrado');
});
test('summary includes signup channel but never passwords or GPS',()=>{
 const db={users:[owner,{...owner,id:'b',email:'client@example.com',signupMethod:'email',passwordHash:'secret'}],history:[{duration:12,routeType:'fast',createdAt:'2026-10-12T02:00:00Z',coords:[-46,-23]}],reports:[{status:'nao_verificado',description:'private coordinates'}],favorites:[],routines:[]};
 const a=adminMetrics(db,{requests:11,routeRequests:1,routeLatencyMs:120},{now:Date.parse('2026-10-12T03:00:00Z'),startedAt:Date.parse('2026-10-12T02:00:00Z')});
 assert.equal(a.usersTotal,2);
 assert.equal(a.signupsEmail,1);
 assert.equal(a.signupsGoogle,1);
 assert.equal(a.avgApiRouteMs,120);
 assert.ok(!JSON.stringify(a).includes('private coordinates'));
 assert.ok(!JSON.stringify(a).includes('-46'));
 assert.ok(!JSON.stringify(a).includes('secret'));
});
test('user list paginates and removes authentication credentials and personal location',()=>{
 const db={users:[{...owner,passwordHash:'VERYSECRET',coords:[23,42]},
  {...owner,id:'b',name:'Other',email:'other@e.co',createdAt:'2026-11-01',signupMethod:'email'}]};
 const listing=adminUsers(db,{limit:1});
 assert.equal(listing.total,2);
 assert.equal(listing.items.length,1);
 assert.equal(listing.items[0].id,'b');
 assert.equal(listing.items[0].signupMethod,'E-mail e senha');
 assert.ok(!JSON.stringify(listing).includes('VERYSECRET'));
 assert.ok(!JSON.stringify(listing).includes('109388900'));
 assert.ok(!JSON.stringify(listing).includes('coords'));
});


test('operational categories count API use without storing IPs, devices or queries',()=>{
 const metric={requests:0,routeRequests:0};
 recordOperationalEvent(metric,{path:'/api/route',method:'GET',userAgent:'Mozilla Android',accept:'application/json'});
 recordOperationalEvent(metric,{path:'/api/search',method:'GET',userAgent:'Mozilla Android'});
 recordOperationalEvent(metric,{path:'/admin',method:'GET',userAgent:'Mozilla Android',accept:'text/html'});
 recordOperationalEvent(metric,{path:'/mapa',method:'GET',userAgent:'Mozilla Android',accept:'text/html'});
 assert.equal(metric.operationCounts['Cálculos de rota'],1);
 assert.equal(metric.operationCounts['Buscas de endereço'],1);
 assert.equal(metric.platformPageLoads.Android,2);
 assert.equal(JSON.stringify(metric).includes('192.168'),false);
 assert.equal(platformCategory('Mozilla/5.0 (iPhone)'), 'iOS / iPadOS');
 assert.equal(platformCategory('Mozilla/5.0 (Windows NT)'), 'Windows');
});
test('V2 analytics exposes already-saved destination but not private GPS or source coordinates',()=>{
 const today=Date.now(), createdAt=new Date(today).toISOString();
 const data={users:[{...owner,activity:{lastVisitAt:createdAt}}],
 sessions:[{userId:owner.id,expires:today+60000}],
 history:[{destination:{name:'Centro',coords:[-46.6,-23.5]},routeType:'safe',distance:4,duration:12,createdAt}],reports:[]};
 const stats=adminMetrics(data,{operationCounts:{'Cálculos de rota':2},platformPageLoads:{Android:1}},{now:today,startedAt:today});
 assert.equal(stats.recentlySeenAccounts,1);
 assert.equal(stats.validSessions,1);
 assert.equal(stats.recentRoutes.length,1);
 assert.equal(stats.recentRoutes[0].destination,'Centro');
 assert.equal(stats.recentRoutes[0].origin,'Não registrada');
 assert.equal(stats.operationCounts[0].count,2);
 assert.equal(stats.platformPageLoads[0].count,1);
 assert.equal(JSON.stringify(stats).includes('-46.6'),false);
 assert.equal(JSON.stringify(stats).includes('192.168'),false);
});
