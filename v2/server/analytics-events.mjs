/** Minimal first-party protocol. Automatic Firebase events must not be replayed. */
export const EVENT_NAMES=Object.freeze([
 'route_requested','route_calculation_started','route_calculation_completed','route_calculation_failed',
 'navigation_started','navigation_ended','route_completed','navigation_cancelled','route_recalculated',
 'navigation_error','communication_failure','api_error','map_load_failed','app_returned'
]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ERRORS=new Set(['offline','timeout','http_4xx','http_5xx','network','invalid_response','provider','webview','renderer','tls','unknown']);
export function validateAnalyticsBatch(body,{now=Date.now()}={}){
 if(!body||!Array.isArray(body.events)||!body.events.length||body.events.length>20||JSON.stringify(body).length>16384)return null;
 const events=[];
 for(const event of body.events){
  if(!event||!UUID.test(event.event_id)||!UUID.test(event.session_id)||!EVENT_NAMES.includes(event.name))return null;
  if(typeof event.occurred_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.occurred_at))return null;
  const timestamp=Date.parse(event.occurred_at);
  if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString()!==event.occurred_at||timestamp<now-86400000||timestamp>now+300000)return null;
  if(!['web','3.1.7','3.1.8'].includes(event.version))return null;
  const input=event.params||{},params={};
  if(typeof input!=='object'||Array.isArray(input))return null;
  if(Number.isFinite(input.duration_ms)&&input.duration_ms>=0&&input.duration_ms<=86400000)params.duration_ms=Math.round(input.duration_ms);
  if(Number.isInteger(input.status_code)&&input.status_code>=100&&input.status_code<=599)params.status_code=input.status_code;
  if(['carro','moto','a-pe'].includes(input.vehicle))params.vehicle=input.vehicle;
  if(ERRORS.has(input.error_code))params.error_code=input.error_code;
  events.push({event_id:event.event_id.toLowerCase(),session_id:event.session_id.toLowerCase(),name:event.name,
   occurred_at:new Date(timestamp).toISOString(),version:event.version,params});
 }
 return events;
}
