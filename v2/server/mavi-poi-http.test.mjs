import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const directory=mkdtempSync(path.join(tmpdir(),'mavi-stop-api-'));
process.env.NODE_ENV='test';process.env.VANO_DISABLE_AUTOSTART='1';
process.env.VANO_DATA_FILE=path.join(directory,'store.json');
process.env.VANO_SECURITY_SECRET='mavi-stop-test-secret-123456789012345';
process.env.VITE_MAPBOX_PUBLIC_TOKEN='pk.test-mavi-poi-token';
process.env.VANO_V1_API_URL='';
const {server}=await import('./index.mjs');
const a=[-46.72,-23.61],b=[-46.71,-23.60],mid=[-46.716,-23.606],poi=[-46.714,-23.604];
const route=[a,mid,b];
const poiFeature={type:'Feature',geometry:{type:'Point',coordinates:poi},
 properties:{name:'Mercado do Teste',feature_type:'poi',mapbox_id:'test-123',
 full_address:'Rua de Teste, São Paulo',operational_status:'active'}};
const routeFor=(coords,duration=630)=>({duration,distance:1500,
 geometry:{type:'LineString',coordinates:[a,[-46.718,-23.608],...coords]},
 legs:[{steps:[{name:'Rua Teste',distance:1500,maneuver:{instruction:'Siga até o destino',location:a}}],
 annotation:{distance:Array(coords.length+1).fill(400),congestion_numeric:Array(coords.length+1).fill(12)}}]});
const providerResponse=routes=>new Response(JSON.stringify({code:'Ok',routes}),{status:200,headers:{'Content-Type':'application/json'}});
test('full MAVI browser guest to real-category stop is transactional, no guessed destination',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const native=globalThis.fetch,base='http://127.0.0.1:'+server.address().port,calls=[];
 globalThis.fetch=async(url,...args)=>{
  const u=new URL(String(url));
  if(u.hostname!=='api.mapbox.com')return native(url,...args);
  calls.push(u);
  if(u.pathname.includes('/searchbox/v1/category/grocery'))
   return new Response(JSON.stringify({features:[poiFeature]}),{status:200,headers:{'Content-Type':'application/json'}});
  if(u.pathname.includes('/directions/v5/'))
   return providerResponse([routeFor([poi],630),routeFor([[-46.716,-23.607],poi],670)]);
  throw Error('unexpected provider endpoint');
 };
 try{
  const boot=await native(base+'/api/bootstrap');assert.equal(boot.status,200);
  const data=await boot.json(),cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const send=async(text,context={},way=route)=>native(base+'/api/v2/assistant',{method:'POST',
   headers:{'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':data.csrfToken},
   body:JSON.stringify({text,origin:a,destination:b,vehicle:'carro',language:'pt-BR',
     currentRouteKey:'current-real-route',routeGeometry:way,context,telemetry:{}})
  });
  const response=await send('Mavi qual é o mercado mais perto no meu caminho');
  assert.equal(response.status,200);
  const offer=await response.json();
  assert.equal(offer.mode,'proposal',offer.text);
  assert.equal(offer.kind,'poi_stop');
  assert.equal(offer.poi.name,'Mercado do Teste');
  assert.deepEqual(offer.poi.coords,poi);
  assert.deepEqual(offer.originalDestination,b);
  assert.equal(offer.sourceKey,'current-real-route');
  assert.ok(offer.routeData.routes.find(r=>r.id===offer.routeId)?.proof);
  assert.match(offer.text,/destino original/i);
  assert.ok(calls.some(u=>u.pathname.includes('/category/grocery')&&u.searchParams.has('route')),
     'must perform provider search along the verified geometry');
  assert.ok(calls.some(u=>u.pathname.includes('/directions/v5/')),
     'must validate route-to-POI before proposing a stop');
  const pending=await send('Mavi me acha outro mercado',{pendingStop:true});
  const pendingData=await pending.json();
  assert.equal(pendingData.mode,'information');
  assert.match(pendingData.text,/já tem uma parada/i);
  const resume=await send('Mavi, continuar viagem',{pendingStop:true});
  const answer=await resume.json();
  assert.deepEqual([answer.mode,answer.action],['action','resume_original']);
  const invalid=await send('Mavi mercado na rota',{},[[0,0]]);
  assert.equal((await invalid.json()).mode,'information');
 }finally{
  globalThis.fetch=native;await new Promise(resolve=>server.close(resolve));
  rmSync(directory,{recursive:true,force:true});
 }
});
