/** Standalone adapter for a future feature-flagged integration into /api/route.
 * No live route endpoint imports this file. Production output is unchanged.
 */
import {evaluateSafeCandidates} from './engine.mjs';
export async function dryRunSafeRouting(providerResult,{
 evidenceProvider,requestedAt=new Date().toISOString(),latitude,longitude,preference='balanced',
 timeoutMs=400
}={}){
 if(!providerResult||!Array.isArray(providerResult.routes))
  return {providerResult,analysis:{status:'invalid-provider-result',fallback:true}};
 if(typeof evidenceProvider!=='function')
  return {providerResult,analysis:{status:'not-configured',fallback:true}};
 if(!Number.isFinite(timeoutMs)||timeoutMs<10||timeoutMs>2000)
  return {providerResult,analysis:{status:'invalid-timeout',fallback:true}};
 // Evidence service receives only candidate geometries; no account or user IDs.
 const controller=new AbortController();
 let timer;
 try{
  const data=await Promise.race([
   Promise.resolve().then(()=>evidenceProvider(
    providerResult.routes.map(r=>({id:String(r.id),geometry:r.geometry})),
    {signal:controller.signal}
   )),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs)})
  ]);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid evidence');
  const analysis=evaluateSafeCandidates(providerResult.routes,{
   observationsByRoute:data,at:requestedAt,latitude,longitude,preference
  });
  // Shadow-mode: return provider response byte-for-byte logically unchanged.
  return {providerResult,analysis:{...analysis,shadowMode:true}};
 }catch{
  return {providerResult,analysis:{status:'evidence-unavailable',fallback:true,shadowMode:true}};
 }finally{
  clearTimeout(timer);controller.abort();
 }
}
