/** Smoke test the real VANU production API with a single public route request.
 * It creates no user data and never prints credentials/cookies.
 */
const url='https://vanomaps.online';
const timeout=AbortSignal.timeout(45000);
async function read(url,opts={}){
 const started=Date.now();
 const response=await fetch(url,{...opts,signal:timeout,redirect:'manual'});
 const text=await response.text();
 let data={};
 try{data=JSON.parse(text)}catch{data={snippet:text.slice(0,160)}}
 return {response,data,elapsed:Date.now()-started};
}
const h=await read(url+'/api/health');
console.log('HEALTH',JSON.stringify({status:h.response.status,ok:h.data.ok,mapboxConfigured:h.data.mapboxConfigured,v1BridgeConfigured:h.data.v1BridgeConfigured,storage:h.data.storage,elapsedMs:h.elapsed}));
const b=await read(url+'/api/bootstrap');
const cookie=(b.response.headers.get('set-cookie')||'').split(';')[0];
const csrf=b.data.csrfToken;
console.log('BOOTSTRAP',JSON.stringify({status:b.response.status,guestCookie:cookie.startsWith('vano_guest='),csrf:!!csrf,elapsedMs:b.elapsed}));
if(!cookie.startsWith('vano_guest=')||!csrf)throw Error('Bootstrap unable to issue a guest session');
const body={origin:[-46.6552,-23.5617],destination:[-46.6412,-23.5634],vehicle:'carro',language:'pt-BR',telemetry:{bearing:null,speed:null}};
try{
 const result=await read(url+'/api/route',{
 method:'POST',
 headers:{'Content-Type':'application/json','Accept':'application/json','Origin':url,'X-VANO-CSRF':csrf,'Cookie':cookie},
 body:JSON.stringify(body)
 });
 console.log('ROUTE_SMOKE_AFTER_RENDER_ORIGIN_FIX',JSON.stringify({status:result.response.status,elapsedMs:result.elapsed,error:String(result.data?.error||'').slice(0,250),source:result.data?.source,routeCount:result.data?.routes?.length,routeIds:result.data?.routes?.map(r=>r.id)}));
 if(result.response.status!==200||!Array.isArray(result.data.routes)||!result.data.routes.length)process.exitCode=1;
}catch(e){console.error('ROUTE_SMOKE_FAILED',e?.message||String(e));process.exitCode=1;}
