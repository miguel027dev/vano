import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'mavi-road-http-'));
process.env.NODE_ENV='test';
process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(dir,'store.json');
process.env.VANO_SECURITY_SECRET='test-secret-mavi-named-road-12345678';
process.env.VITE_MAPBOX_PUBLIC_TOKEN='pk.test-mapbox-mavi';
process.env.VANO_V1_API_URL='';
const {server}=await import('./index.mjs');
const origin=[-46.72,-23.61],destination=[-46.71,-23.60];
function fixture(street,shift=0,duration=1020){
 const coords=Array.from({length:15},(_,i)=>[
  -46.72+i*.01/14,
  -23.61+i*.01/14+(i===0||i===14?0:shift)
 ]);
 return {duration,distance:1600,geometry:{type:'LineString',coordinates:coords},
   legs:[{steps:[
     {maneuver:{instruction:'Continue na avenida',location:coords[0],modifier:'straight'},name:street,distance:900},
     {maneuver:{instruction:'Vire à direita',location:coords[12],modifier:'right'},name:'Rua José',distance:700}
   ],annotation:{distance:Array(14).fill(100),congestion_numeric:Array(14).fill(15)}}]};
}
const provider=routes=>new Response(JSON.stringify({code:'Ok',routes}),{status:200,headers:{'Content-Type':'application/json'}});

test('MAVI names a road, requests real exclusion points and only offers compliant new geometry',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const host='http://127.0.0.1:'+server.address().port;
 const nativeFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url)=>{
   const u=new URL(url);
   if(!u.hostname.endsWith('mapbox.com'))return nativeFetch(url);
   requests.push(u);
   const exclusion=u.searchParams.get('exclude')||'';
   if(exclusion.includes('point('))return provider([fixture('Avenida Morumbi',.003,1160),fixture('Avenida Morumbi',.004,1180)]);
   return provider([fixture('Avenida Giovanni Gronchi',0,1020),fixture('Avenida Giovanni Gronchi',.001,1060)]);
 };
 try{
   const bootstrap=await nativeFetch(host+'/api/bootstrap'),headers={'Content-Type':'application/json'};
   assert.equal(bootstrap.status,200);
   const b=await bootstrap.json();
   headers['X-VANO-CSRF']=b.csrfToken;
   headers.Cookie=(bootstrap.headers.get('set-cookie')||'').split(';')[0];
   const ask=async(text,dest=destination)=>nativeFetch(host+'/api/v2/assistant',{method:'POST',headers,
    body:JSON.stringify({text,origin,destination:dest,vehicle:'carro',language:'pt-BR',
      currentRouteKey:'different-from-all-provider-routes',currentDuration:17,
      routeGeometry:fixture('Avenida Giovanni Gronchi').geometry.coordinates})});
   const response=await ask('Mavi, tem outro caminho que não pega a Giovanni?');
   assert.equal(response.status,200);
   const proposal=await response.json();
   assert.equal(proposal.mode,'proposal',proposal.text);
   assert.equal(proposal.roadConstraint.kind,'avoid');
   assert.equal(proposal.roadConstraint.road,'giovanni');
   assert.ok(proposal.routeData.routes.length>0);
   assert.ok(proposal.routeData.routes.every(r=>r.steps.every(s=>!String(s.street).includes('Giovanni'))));
   assert.ok(requests.some(u=>(u.searchParams.get('exclude')||'').includes('point(')),
     'Provider must be asked to actually avoid road points, not just create a new URL-free promise.');
   assert.match(proposal.text,/giovanni/i);
   assert.equal(typeof proposal.routeData.routes[0].proof,'string');

   // Different names and route fingerprints are not enough. Reject near-identical
   // geometry, even if the provider describes it as a new street.
   globalThis.fetch=async url=>{
     const u=new URL(url);
     if(!u.hostname.endsWith('mapbox.com'))return nativeFetch(url);
     return provider([fixture('Avenida Morumbi',.00003,1030),fixture('Avenida Morumbi',.00004,1035)]);
   };
   const near=await ask('Mavi, recalcule uma rota que não passe pela Marginal Pinheiros',
     [-46.7092,-23.5992]);
   assert.equal(near.status,200);
   const nearResult=await near.json();
   assert.equal(nearResult.mode,'information',nearResult.text);
   assert.match(nearResult.text,/mantive a rota atual/i);

   // The backend must reject requests that cannot prove the named road was excluded.
   globalThis.fetch=async url=>{
     const u=new URL(url);
     if(!u.hostname.endsWith('mapbox.com'))return nativeFetch(url);
     return provider([fixture('Avenida Giovanni Gronchi',.002,1090)]);
   };
   const refused=await ask('Mavi, não quero ir pela Giovanni Gronchi',[-46.7101,-23.6001]);
   assert.equal(refused.status,200);
   const denial=await refused.json();
   assert.equal(denial.mode,'information',denial.text);
   assert.match(denial.text,/mantive a rota atual/i);
 }finally{
   globalThis.fetch=nativeFetch;
   await new Promise(resolve=>server.close(resolve));
   rmSync(dir,{recursive:true,force:true});
 }
});
