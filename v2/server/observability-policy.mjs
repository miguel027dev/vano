import {createHmac} from 'node:crypto';
export const OBSERVABILITY_EVENTS=new Set(['app_foreground','app_background','route_request','route_calculation_start','route_calculation_complete','route_calculation_error','navigation_start','navigation_end','navigation_cancel','route_complete','route_recalculation','navigation_error','api_response','api_error','communication_error','map_load_error','web_ready','webview_renderer_gone']);
const kinds=new Set(['route','map','service','network','cancelled','completed','unknown','timeout','aborted']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function sanitizeObservabilityBatch(body,secret,now=Date.now()){
 if(!body||body.consent!==true||!uuid.test(body.installation||'')||!uuid.test(body.session||'')||!Array.isArray(body.events)||body.events.length<1||body.events.length>20)throw Error('invalid_batch');
 const pseudonym=value=>createHmac('sha256',secret).update('vano-observability-v1:'+value).digest('hex');
 const subject=pseudonym(body.installation),session=pseudonym(body.session);
 return body.events.map(event=>{
  if(!event||!OBSERVABILITY_EVENTS.has(event.name)||!uuid.test(event.id||'')||!Number.isSafeInteger(event.timestamp)||event.timestamp>now+300000||event.timestamp<now-7*86400000)throw Error('invalid_event');
  const params={},input=event.params||{};
  if(Number.isSafeInteger(input.duration_ms)&&input.duration_ms>=0&&input.duration_ms<=3600000)params.duration_ms=input.duration_ms;
  if(Number.isSafeInteger(input.status)&&input.status>=100&&input.status<=599)params.status=input.status;
  if(kinds.has(input.kind))params.kind=input.kind;
  // Version is bounded metadata, never arbitrary free text.
  const version=typeof event.version==='string'&&['3.1.7','3.1.8'].includes(event.version)?event.version:'unknown';
  return {id:event.id,subject,session,name:event.name,version,occurredAt:new Date(event.timestamp).toISOString(),params};
 });
}
