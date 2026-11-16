import {notifyNative} from './nativeShell.js';
import {createTelemetryClient} from './telemetryClient.mjs';
let client=null;
export function analyticsEvent(name,params){try{return client?.record(name,params)||false;}catch{return false;}}
/** No cookies/localStorage are created by this module. Consent is server-owned. */
export function mountAnalytics(request){
 try{
 let stopped=false,checkId=0;
 const version=typeof navigator!=='undefined'?navigator.userAgent.match(/VANOAndroid\/(3\.1\.[78])\b/)?.[1]||'web':'web';
 const instance=createTelemetryClient({send:body=>request('/observability/events',{method:'POST',body,signal:AbortSignal.timeout(5000)}),host:notifyNative,version});
 client=instance;instance.consent(false);
 const check=()=>{
  const current=++checkId;
  return request('/observability/consent',{signal:AbortSignal.timeout(5000)}).then(result=>{
   if(stopped||current!==checkId)return;
   instance.consent(result.policy==='2026-11-v1'&&result.allowed===true);
  }).catch(()=>{if(!stopped&&current===checkId)instance.consent(false);});
 };
 void check();
 const interval=setInterval(()=>{if(document.visibilityState==='visible')void check();},60000);
 const resume=()=>{if(document.visibilityState==='visible')void check().then(()=>{if(!stopped)analyticsEvent('app_returned');});};
 document.addEventListener('visibilitychange',resume);
 return()=>{stopped=true;clearInterval(interval);document.removeEventListener('visibilitychange',resume);instance.close();if(client===instance)client=null;};
 }catch{client=null;try{notifyNative({action:'telemetryConsent',allowed:false});}catch{}return ()=>{};}
}
/** Fetch observer: no await, request mutation, response parsing or retries. */
export function observeRouteRequest(path){
 try{
 if(path!=='/route')return ()=>{};
 const start=performance.now();
 analyticsEvent('route_requested');analyticsEvent('route_calculation_started');
 let ended=false;
 return ({ok,status,error_code}={})=>{
  try{
  if(ended)return;ended=true;
  const duration_ms=performance.now()-start;
  analyticsEvent(ok?'route_calculation_completed':'route_calculation_failed',{duration_ms,status_code:status,error_code});
  if(!ok)analyticsEvent(status?'api_error':'communication_failure',{duration_ms,status_code:status,error_code:error_code||'unknown'});
  }catch{/* The caller's request and response are never affected. */}
 };
 }catch{return ()=>{};}
}
