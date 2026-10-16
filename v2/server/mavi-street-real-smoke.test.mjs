import test from 'node:test';
import assert from 'node:assert/strict';
import {jevRouteFingerprint} from '../src/lib/jevShared.mjs';
import {routeRoadEvidence} from '../src/lib/jevStreetRouting.mjs';
// Temporary, unmerged, real Mapbox/Render V2 smoke. No keys, cookies or
// user locations appear in logs; these are representative public test points.
test('live VANO V2 named-road MAVI never confirms a noncompliant route',async()=>{
 const base='https://vanu-73xu.onrender.com';
 const controller=new AbortController();
 const deadline=setTimeout(()=>controller.abort(),50000);
 try{
   const boot=await fetch(base+'/api/bootstrap',{signal:controller.signal});
   assert.equal(boot.status,200,'bootstrap');
   const session=(boot.headers.get('set-cookie')||'').split(';')[0];
   const data=await boot.json();
   assert.ok(session.startsWith('vano_guest='),'guest cookie');
   assert.ok(data.csrfToken,'csrf token');
   const headers={'Content-Type':'application/json','Cookie':session,'X-VANO-CSRF':data.csrfToken};
   const post=(url,body)=>fetch(base+url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
   const origin=[-46.734,-23.636],destination=[-46.715,-23.602];
   const raw=await post('/api/route',{origin,destination,vehicle:'carro',language:'pt-BR',telemetry:{}});
   assert.equal(raw.status,200,'live route engine');
   const result=await raw.json();
   assert.ok(result.source!=='demonstracao'&&result.routes?.length,'actual provider routing');
   const current=result.routes[0],fingerprint=jevRouteFingerprint(current);
   assert.ok(fingerprint,'real geometry');
   const start=Date.now();
   const answer=await post('/api/v2/assistant',{
     text:'Mavi, não quero ir pela Avenida Giovanni Gronchi',
     origin,destination,vehicle:'carro',language:'pt-BR',
     currentRouteKey:fingerprint,currentDuration:current.duration,telemetry:{}
   });
   assert.equal(answer.status,200,'MAVI endpoint');
   const response=await answer.json();
   assert.ok(['proposal','information'].includes(response.mode),'valid MAVI reply');
   if(response.mode==='proposal'){
     const suggested=response.routeData.routes.find(r=>r.id===response.routeId);
     assert.ok(suggested,'selected real alternative');
     assert.equal(response.roadConstraint?.kind,'avoid');
     assert.equal(routeRoadEvidence(suggested,'Giovanni Gronchi').known,true);
     assert.equal(routeRoadEvidence(suggested,'Giovanni Gronchi').uses,false,'must not include excluded road');
     assert.notEqual(jevRouteFingerprint(suggested),fingerprint,'distinct real geometry');
   }else{
     assert.match(response.text,/nao encontrei|não encontrei|mantid|mantive|nao consegui|não consegui/i,
       'honest refusal, not a fictional success');
   }
   console.info('MAVI real provider smoke:',JSON.stringify({
     provider:result.source,baselineHasNamedRoad:routeRoadEvidence(current,'Giovanni Gronchi').uses,
     maviMode:response.mode,verifiedNewRoute:response.mode==='proposal',
     durationMs:Date.now()-start
   }));

   const observed=current.steps
     .filter(x=>typeof x?.street==='string'&&x.street.trim().length>=5&&x.street.trim().length<62&&Number(x.distance)>200)
     .sort((a,b)=>Number(b.distance)-Number(a.distance))[0];
   if(observed){
     // This second sample selects a road genuinely present in the returned
     // baseline, so it exercises the real avoidance/probe branch.
     const street=observed.street.trim();
     const check=await post('/api/v2/assistant',{
       text:'Mavi, não quero ir pela '+street,
       origin,destination,vehicle:'carro',language:'pt-BR',
       currentRouteKey:fingerprint,currentDuration:current.duration,telemetry:{}
     });
     assert.equal(check.status,200,'named road currently used');
     const body=await check.json();
     assert.ok(['proposal','information'].includes(body.mode));
     if(body.mode==='proposal'){
       const verified=body.routeData.routes.find(r=>r.id===body.routeId);
       assert.ok(verified,'new selected provider route');
       assert.ok(routeRoadEvidence(verified,street).known);
       assert.equal(routeRoadEvidence(verified,street).uses,false,
         'actual route must no longer use the specifically named street');
       assert.notEqual(jevRouteFingerprint(verified),fingerprint);
     }else{
       assert.match(body.text,/nao encontrei|não encontrei|mantid|mantive|nao consegui|não consegui/i);
     }
     console.info('MAVI on-road real avoidance:',JSON.stringify({
       inputStreet:street.slice(0,60),initialStreetVerified:true,
       maviMode:body.mode,verifiedNewRoute:body.mode==='proposal'
     }));
   }else console.info('MAVI on-road real avoidance: baseline had no named step longer than 200m.');
 }finally{clearTimeout(deadline);}
},{timeout:55000});
