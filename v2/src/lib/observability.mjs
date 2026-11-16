/** Opt-in analytics with a bounded retry queue. No route geometry, URLs or user text. */
const names=new Set(['route_request','route_calculation_start','route_calculation_complete','route_calculation_error','navigation_start','navigation_end','navigation_cancel','route_complete','route_recalculation','navigation_error','api_response','api_error','communication_error','map_load_error','app_foreground','app_background']);
const consentKey='vano-observability-consent-v1';
let transport=null,queue=[],timer=null,inFlight=false,attempt=0,session=null,identity=null;
function granted(){try{return typeof window!=='undefined'&&window.localStorage.getItem(consentKey)==='granted';}catch{return false;}}
function bridge(message){try{if(window===window.top&&window.VanoHost?.postMessage)window.VanoHost.postMessage(JSON.stringify(message));}catch{}}
export function setObservabilityConsent(value){
 try{
  window.localStorage.setItem(consentKey,value===true?'granted':'denied');
  bridge({action:'observabilityConsent',granted:value===true});
  if(value!==true){queue=[];identity=null;session=null;window.localStorage.removeItem('vano-observability-installation-v1');if(timer)clearTimeout(timer);timer=null;}
 }catch{}
}
function ids(){
 session||=crypto.randomUUID();
 if(!identity){
  try{identity=JSON.parse(window.localStorage.getItem('vano-observability-installation-v1')||'null');}catch{}
  if(!identity||typeof identity.id!=='string'||!Number.isFinite(identity.expires)||identity.expires<Date.now()){
   identity={id:crypto.randomUUID(),expires:Date.now()+30*86400000};
   window.localStorage.setItem('vano-observability-installation-v1',JSON.stringify(identity));
  }
 }
 return {session,installation:identity.id};
}
export function configureObservability(sender){transport=sender;}
function schedule(delay=2000){if(!timer){timer=setTimeout(()=>{timer=null;void flush();},delay);timer.unref?.();}}
async function flush(){
 if(!granted()||!transport||inFlight||!queue.length)return;
 inFlight=true;const pending=queue.slice(0,20);
 try{
  await transport({consent:true,...ids(),events:pending});
  queue=queue.filter(e=>!pending.some(p=>p.id===e.id));attempt=0;
 }catch{
  attempt++;
  if(attempt>=3){queue=queue.filter(e=>!pending.some(p=>p.id===e.id));attempt=0;}
 }finally{inFlight=false;if(queue.length)schedule(Math.min(30000,2000*2**attempt));}
}
export function observe(name,input={}){
 // A failed sink never throws into navigation, fetch or rendering code.
 try{
  if(!granted()||!names.has(name))return;
  const params={};
  if(Number.isSafeInteger(input.duration_ms)&&input.duration_ms>=0&&input.duration_ms<=3600000)params.duration_ms=input.duration_ms;
  if(Number.isSafeInteger(input.status)&&input.status>=100&&input.status<=599)params.status=input.status;
  if(['route','map','service','network','cancelled','completed','unknown','timeout','aborted'].includes(input.kind))params.kind=input.kind;
  const event={id:crypto.randomUUID(),name,params,timestamp:Date.now(),version:(typeof navigator!=='undefined'?navigator.userAgent.match(/VANOAndroid\/(\d+\.\d+\.\d+)/)?.[1]:null)||'unknown'};
  bridge({action:'observabilityConsent',granted:true});
  bridge({action:'observabilityEvent',...event});
  // One copy per destination: native SDK -> GA4, first-party queue -> VANO. Never sum these streams.
  queue=queue.filter(e=>Date.now()-e.timestamp<86400000).slice(-99);queue.push(event);schedule();
 }catch{}
}
