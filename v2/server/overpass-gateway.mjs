import {readLimitedText} from './read-limited.mjs';

/** One health state per provider, shared across viewports. No retries during cooldown.
 * The two attempts overlap; a dead primary cannot add its timeout to the backup.
 */
export function createOverpassGateway({fetcher=fetch,now=Date.now,timeoutMs=9000,
 hedgeMs=900,cooldownMs=60000,maxCooldownMs=30*60000,log=console.warn}={}){
 const health=new Map();
 async function query(endpoints,body,{beforeAttempt=async()=>{}}={}){
  const candidates=endpoints.filter(url=>{
   const state=health.get(url);
   return !state?.busy&&!(state?.retryAt>now());
  });
  if(!candidates.length)throw Error('Overpass em pausa após falha');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(Error('Overpass deadline')),timeoutMs);
  let won=false;
  const attempt=async(url,index)=>{
   if(index)await new Promise(resolve=>{
    const finish=()=>{clearTimeout(delay);controller.signal.removeEventListener('abort',finish);resolve();};
    const delay=setTimeout(finish,hedgeMs);
    controller.signal.addEventListener('abort',finish,{once:true});
   });
   if(controller.signal.aborted)throw Error('Overpass attempt cancelled');
   const state=health.get(url)||{failures:0,retryAt:0,busy:false};
   if(state.busy||state.retryAt>now())throw Error('Overpass em pausa após falha');
   state.busy=true;health.set(url,state);
   try{
    await beforeAttempt();
    if(controller.signal.aborted)throw Error('Overpass attempt cancelled');
    const response=await fetcher(url,{method:'POST',headers:{
     'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json',
     'User-Agent':'VANO Maps public road-safety map (https://vanomaps.online)'
    },body,signal:controller.signal});
    if(!response.ok)throw Error('Overpass status '+response.status);
    const data=JSON.parse(await readLimitedText(response,6*1024*1024));
    if(!Array.isArray(data?.elements)||data.remark)throw Error('Resposta Overpass incompleta');
    if(state.failures)log('VANO optional OSM provider recovered',new URL(url).hostname);
    state.failures=0;state.retryAt=0;
    return data.elements;
   }catch(error){
    // Aborting a slower loser after a valid result is not a provider failure.
    if(!won){
     state.failures++;
     const delay=Math.min(maxCooldownMs,cooldownMs*2**Math.min(10,state.failures-1));
     state.retryAt=now()+delay;
     log('VANO optional OSM provider unavailable',JSON.stringify({
      provider:new URL(url).hostname,retryInMs:delay,affectsRouting:false,
      reason:error?.cause?.code||error?.code||error?.message||'network error'
     }));
    }
    throw error;
   }finally{state.busy=false;}
  };
  try{
   const elements=await Promise.any(candidates.map(attempt));
   won=true;return elements;
  }finally{controller.abort();clearTimeout(timer);}
 }
 return {query};
}
