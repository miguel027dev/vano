/** Backend-only bridge for the original VANO Python routing engine.
 * When VANO_V1_API_URL is not configured, no claim is made about micro-routing.
 */
import { pointOK } from './routing.mjs';

export function normalizeV1Route(payload,mode){
  const all=Array.isArray(payload?.routes)?payload.routes:[];
  const route=all.find(r=>String(r.id)===String(payload.selected_id))||all[0];
  if(!route||route.geometry?.type!=='LineString'||route.geometry.coordinates?.length<2||!route.geometry.coordinates.every(pointOK))throw Error('A V1 retornou uma rota sem geometria válida.');
  const duration=Number(route.duration),distance=Number(route.distance);
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(distance)||distance<=0)throw Error('A V1 retornou ETA ou distância inválidos.');
  return {
    id:mode==='fastest'?'fast':'safe',label:mode==='fastest'?'Mais rápida':'Mais segura',
    duration:Math.max(1,Math.round(duration/60)),distance:Math.round(distance/100)/10,
    geometry:route.geometry,steps:Array.isArray(route.steps)?route.steps.map(s=>({instruction:s.instruction||'Continue pela rota',distance:s.distance,location:s.location,bearing_after:s.bearing_after,type:s.type})):[],
    verifiedSafety:mode!=='fastest'&&Number.isFinite(Number(route.safety_score))&&route.safety_score!==null,
    microRoute:!!route.micro_route, microStrategy:String(route.micro_strategy||''),microStreets:Array.isArray(route.micro_streets)?route.micro_streets.slice(0,4):[],
    etaGainSeconds:Number(route.eta_gain_s)||0,source:'vano-v1',trafficLevel:route.traffic_level||null,
    rawRouteSignature:route.route_signature||null,
  };
}
export function buildV1Url(base,origin,destination,mode,vehicle,telemetry={}){
  if(!pointOK(origin)||!pointOK(destination))throw Error('Coordenadas inválidas.');
  const url=new URL('/api/route',base);
  for(const [key,value] of Object.entries({start_lon:origin[0],start_lat:origin[1],end_lon:destination[0],end_lat:destination[1],mode,profile:vehicle==='moto'?'motorcycle':'driving',adaptive:'1',variant_budget:'4'}))url.searchParams.set(key,String(value));
  if(Number.isFinite(telemetry.bearing)&&telemetry.bearing>=0)url.searchParams.set('start_bearing',String(telemetry.bearing));
  if(Number.isFinite(telemetry.speed)&&telemetry.speed>=0)url.searchParams.set('start_speed',String(telemetry.speed));
  return url;
}
export async function directionsFromV1(base,origin,destination,vehicle,telemetry={}){
  const root=new URL(base);
  if(!['https:','http:'].includes(root.protocol))throw Error('Endereço da API V1 inválido.');
  const get=async mode=>{
    const url=buildV1Url(base,origin,destination,mode,vehicle,telemetry);
    let response;try{response=await fetch(url,{headers:{'Accept':'application/json','X-VANO-Client':'local-v2'},signal:AbortSignal.timeout(25000)});}catch(e){throw Error(`Não foi possível conectar à API V1 (${mode}): ${e.message}`);}
    if(!response.ok)throw Error(`API V1 indisponível (${mode}, HTTP ${response.status}). Verifique acesso, permissões e limite de rotas.`);
    const payload=await response.json();return normalizeV1Route(payload,mode);
  };
  const [safe,fast]=await Promise.all([get('safest'),get('fastest')]);
  return {source:'vano-v1',engine:'original-python',routes:[safe,fast],microRoutingActive:safe.microRoute||fast.microRoute,safetyMessage:'Motor de rotas original VANO V1. Os indicadores dependem da cobertura e da qualidade dos dados disponíveis.'};
}
