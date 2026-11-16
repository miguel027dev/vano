/** Bounded diagnostics. Never read API bodies, paths, coordinates or identities. */
const EVENTS=new Set(['route_requested','route_calculation_started','route_calculation_completed','route_calculation_failed',
 'navigation_started','navigation_ended','navigation_cancelled','route_completed','route_recalculated',
 'navigation_error','communication_failure','api_error','map_load_failed','app_returned']);
const ERRORS=new Set(['offline','timeout','http_4xx','http_5xx','network','invalid_response','provider','webview','renderer','tls','unknown']);
export function cleanParams(raw={}){
 const out={};
 if(Number.isFinite(raw.duration_ms)&&raw.duration_ms>=0&&raw.duration_ms<=86400000)out.duration_ms=Math.round(raw.duration_ms);
 if(Number.isInteger(raw.status_code)&&raw.status_code>=100&&raw.status_code<=599)out.status_code=raw.status_code;
 if(['carro','moto','a-pe'].includes(raw.vehicle))out.vehicle=raw.vehicle;
 if(ERRORS.has(raw.error_code))out.error_code=raw.error_code;
 return out;
}
export function createTelemetryClient({send,host=()=>{},clock=Date.now,id=()=>crypto.randomUUID(),version='web',timer=setTimeout,cancel=clearTimeout}){
 let allowed=false,configured=false,queue=[],pending=null,inflight=false,retries=0,generation=0,session=id(),quotaAt=clock(),quota=0,dropped=0;
 const cooldown=new Map();
 const safeHost=message=>{try{host(message);}catch{/* Optional native transport. */}};
 function schedule(delay=5000){if(allowed&&!pending&&queue.length)pending=timer(()=>{pending=null;void flush();},delay);}
 function consent(value){
  if(configured&&allowed===(value===true))return;
  configured=true;
  allowed=value===true;generation++;queue=[];retries=0;session=id();cooldown.clear();quota=0;quotaAt=clock();
  if(pending)cancel(pending);pending=null;
  safeHost({action:'telemetryConsent',allowed});
 }
 function record(name,params={}){
  try{
   if(!allowed||!EVENTS.has(name))return false;
   const now=clock();
   if(now-quotaAt>=60000){quota=0;quotaAt=now;}
   if(quota>=60){dropped++;return false;}
   if(['map_load_failed','navigation_error','communication_failure','api_error'].includes(name)){
    if(now-(cooldown.get(name)??-Infinity)<30000)return false;cooldown.set(name,now);
   }
   quota++;
   const event={event_id:id(),session_id:session,name,version,occurred_at:new Date(now).toISOString(),params:cleanParams(params)};
   if(queue.length>=100){queue.shift();dropped++;}
   queue.push(event);
   // Send to native once; server delivery retries never replay Firebase events.
   safeHost({action:'telemetry',event_id:event.event_id,name,params:event.params});
   schedule();return true;
  }catch{return false;}
 }
 async function flush(){
  if(!allowed||inflight||!queue.length)return;
  const epoch=generation,rows=queue.slice(0,20);inflight=true;
  try{
   await send({events:rows});
   if(epoch!==generation)return;
   const sent=new Set(rows.map(e=>e.event_id));queue=queue.filter(e=>!sent.has(e.event_id));retries=0;
  }catch{
   if(epoch!==generation)return;
   retries++;
   if(retries>=6){dropped+=queue.length;queue=[];retries=0;}
  }finally{inflight=false;schedule(Math.min(60000,5000*2**retries));}
 }
 return {consent,record,flush,close:()=>consent(false),stats:()=>({allowed,queued:queue.length,dropped})};
}
