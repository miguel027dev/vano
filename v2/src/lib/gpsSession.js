/** Browser GPS session supervisor.
 * Only sensor callbacks may supply coordinates. The supervisor can restart
 * a silent watch while the app is active, never synthesize or extrapolate GPS.
 * Permission denial disables automatic retries until a new user gesture.
 */
export function startGpsSession(geolocation,{onPosition,onError,onRecover=()=>{}},{
 navigation=false,schedule=setTimeout,cancel=clearTimeout,now=Date.now,
 documentObject=globalThis.document,windowObject=globalThis.window,
 firstFixTimeoutMs=8500,staleMs=navigation?35000:60000,
 watchdogMs=12000,minRestartMs=12000
}={}){
 if(!geolocation||typeof geolocation.watchPosition!=='function'||typeof geolocation.clearWatch!=='function')
  throw new TypeError('Geolocation watch unavailable');
 let active=true,denied=false,watchId=null,generation=0,watchStarted=0,lastAccepted=now();
 let everAccepted=false,failedSince=null,restarts=0;
 let firstTimer=null,retryTimer=null,watchdogTimer=null;
 const clear=(id)=>{if(id!==null)cancel(id);return null;};
 const visible=()=>documentObject?.visibilityState!=='hidden';
 const clearWatch=()=>{
  generation++;
  const id=watchId;watchId=null;
  if(id!==null&&id!==undefined){try{geolocation.clearWatch(id);}catch{/* already disposed */}}
 };
 const success=(position,epoch)=>{
  if(!active||denied||epoch!==generation)return;
  let accepted;
  try{accepted=onPosition(position);}catch(error){onError(error);return;}
  if(accepted){
   everAccepted=true;lastAccepted=now();failedSince=null;restarts=0;
   firstTimer=clear(firstTimer);
   retryTimer=clear(retryTimer);
  }
 };
 const nextRetry=(delay)=>{
  if(!active||denied||!visible()||retryTimer!==null)return;
  retryTimer=schedule(()=>{
   retryTimer=null;
   if(!active||denied||!visible())return;
   const since=now()-watchStarted;
   if(since<minRestartMs){nextRetry(minRestartMs-since);return;}
   restart();
  },Math.max(1000,delay));
 };
 const failure=(error,epoch)=>{
  if(!active||epoch!==generation)return;
  if(error?.code===1){
   denied=true;firstTimer=clear(firstTimer);retryTimer=clear(retryTimer);
   watchdogTimer=clear(watchdogTimer);clearWatch();
  }else if(visible()){
   if(failedSince===null)failedSince=now();
   const backoff=Math.min(60000,4000*Math.pow(2,Math.min(restarts,4)));
   nextRetry(backoff);
  }
  onError(error);
 };
 const armFirstFallback=(epoch)=>{
  firstTimer=clear(firstTimer);
  if(!active||denied||typeof geolocation.getCurrentPosition!=='function')return;
  firstTimer=schedule(()=>{
   firstTimer=null;
   if(!active||denied||epoch!==generation||!visible())return;
   // A coarse one-shot is only a recovery aid; the original high-accuracy
   // watch stays active and remains the single primary GPS subscription.
   if(everAccepted&&now()-lastAccepted<staleMs)return;
   try{
    geolocation.getCurrentPosition(p=>success(p,epoch),e=>failure(e,epoch),{
     enableHighAccuracy:false,maximumAge:8000,timeout:12000
    });
   }catch(error){failure(error,epoch);}
  },firstFixTimeoutMs);
 };
 function beginWatch(){
  if(!active||denied||!visible())return;
  const epoch=++generation;watchStarted=now();
  try{
   const id=geolocation.watchPosition(p=>success(p,epoch),e=>failure(e,epoch),{
    enableHighAccuracy:true,
    maximumAge:navigation?1000:8000,
    timeout:navigation?16000:25000
   });
   // A synchronous permission error may invalidate this generation.
   if(active&&!denied&&generation===epoch)watchId=id;
   else if(id!==null&&id!==undefined)geolocation.clearWatch(id);
  }catch(error){failure(error,epoch);}
  armFirstFallback(epoch);
 }
 function restart(){
  if(!active||denied||!visible())return;
  firstTimer=clear(firstTimer);retryTimer=clear(retryTimer);
  clearWatch();restarts++;
  if(everAccepted)onRecover({reason:'gps-signal-stale',sinceLastFixMs:now()-lastAccepted});
  beginWatch();
 }
 function watchdog(){
  watchdogTimer=null;
  if(!active||denied)return;
  if(visible()&&now()-lastAccepted>=staleMs){
   const delay=Math.min(60000,4000*Math.pow(2,Math.min(restarts,4)));
   nextRetry(Math.max(1500,delay));
  }
  watchdogTimer=schedule(watchdog,watchdogMs);
 }
 function onReturn(){
  if(!active||denied||!visible())return;
  // On resume, if the last accepted reading is old, obtain a fresh watch.
  if(now()-lastAccepted>=staleMs)nextRetry(1000);
 }
 const onVisibility=()=>{if(visible())onReturn();else{firstTimer=clear(firstTimer);retryTimer=clear(retryTimer);}};
 beginWatch();
 watchdogTimer=schedule(watchdog,watchdogMs);
 documentObject?.addEventListener?.('visibilitychange',onVisibility);
 windowObject?.addEventListener?.('focus',onReturn);
 windowObject?.addEventListener?.('pageshow',onReturn);
 windowObject?.addEventListener?.('online',onReturn);
 return()=>{
  if(!active)return;
  active=false;
  firstTimer=clear(firstTimer);retryTimer=clear(retryTimer);watchdogTimer=clear(watchdogTimer);
  clearWatch();
  documentObject?.removeEventListener?.('visibilitychange',onVisibility);
  windowObject?.removeEventListener?.('focus',onReturn);
  windowObject?.removeEventListener?.('pageshow',onReturn);
  windowObject?.removeEventListener?.('online',onReturn);
 };
}
