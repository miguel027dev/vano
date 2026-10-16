import test from 'node:test';
import assert from 'node:assert/strict';
import {jevRouteFingerprint} from '../src/lib/jevShared.mjs';
import {positionOnRoute} from './mavi-poi.mjs';
// Temporary disposable live smoke against Render and Mapbox.
// All points are fixed public São Paulo test coordinates, not a user's GPS.
test('real Render V2 MAVI category search returns real routable grocery stop',async()=>{
 const host='https://vanu-73xu.onrender.com';
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),48000);
 const origin=[-46.734,-23.636],destination=[-46.715,-23.602];
 try{
  const init=await fetch(host+'/api/bootstrap',{signal:controller.signal});
  assert.equal(init.status,200);const boot=await init.json();
  const cookie=(init.headers.get('set-cookie')||'').split(';')[0];
  assert.ok(cookie.includes('vano_guest='));
  const post=async(endpoint,data)=>fetch(host+endpoint,{method:'POST',signal:controller.signal,
    headers:{'Content-Type':'application/json','X-VANO-CSRF':boot.csrfToken,'Cookie':cookie},
    body:JSON.stringify(data)});
  const r=await post('/api/route',{origin,destination,vehicle:'carro',language:'pt-BR'});
  assert.equal(r.status,200,'real baseline routing');
  const routeData=await r.json();
  const current=routeData.routes?.find(x=>x.id==='fast')||routeData.routes?.[0];
  assert.ok(current&&current.geometry?.coordinates?.length>3);
  const sourceKey=jevRouteFingerprint(current);
  assert.ok(sourceKey);
  const points=current.geometry.coordinates;
  const stride=Math.max(1,Math.ceil((points.length-1)/159));
  const routeGeometry=points.filter((_,i)=>i%stride===0||i===points.length-1);
  const body={origin,destination,routeGeometry,vehicle:'carro',currentRouteKey:sourceKey,
    currentDuration:current.duration,language:'pt-BR',context:{hasRoute:true,pendingStop:false}};
  const start=Date.now();
  const near=await post('/api/v2/assistant',{...body,text:'Mavi, encontra o mercado mais próximo'});
  assert.equal(near.status,200);
  const nearData=await near.json();
  console.info('Real MAVI nearby market:',JSON.stringify({
    mode:nearData.mode,intent:nearData.intent,kind:nearData.kind||null,
    info:nearData.mode==='information'?String(nearData.text).slice(0,150):undefined,
    elapsedMs:Date.now()-start
  }));
  assert.equal(nearData.mode,'proposal','the real API should find a routable marketplace stop');
  assert.equal(nearData.kind,'poi_stop');
  assert.ok(nearData.poi?.name&&Array.isArray(nearData.poi?.coords));
  assert.deepEqual(nearData.originalDestination,destination);
  assert.equal(nearData.sourceKey,sourceKey);
  assert.ok(nearData.routeData?.routes?.find(x=>x.id===nearData.routeId)?.proof);
  const alongside=await post('/api/v2/assistant',{...body,text:'Mavi, procura um mercado que esteja no meu caminho'});
  assert.equal(alongside.status,200);
  const onData=await alongside.json();
  console.info('Real MAVI along-route market:',JSON.stringify({
    mode:onData.mode,kind:onData.kind||null,
    info:onData.mode==='information'?String(onData.text).slice(0,150):undefined
  }));
  if(onData.mode==='proposal'){
   assert.equal(onData.kind,'poi_stop');
   const offset=positionOnRoute(onData.poi.coords,routeGeometry);
   assert.ok(offset&&offset.distance<=1400,'candidate must be near verified route corridor');
   assert.deepEqual(onData.originalDestination,destination);
  }else{
   assert.match(onData.text,/Não encontrei|Não consegui|A busca/i);
  }
 }finally{clearTimeout(timer);}
},{timeout:50000});
