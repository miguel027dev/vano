/**
 * VANO Original Engine adapter (V2 Node -> original VANO Python).
 * Keeps the Python implementation authoritative for geometry, safety, traffic,
 * micro-routes, distributed nodes and bounded AI candidate selection.
 * This adapter NEVER generates invented roads or 'verified' safety scores.
 */
import { pointOK } from './routing.mjs';

const MODES = Object.freeze({ safest: 'safe', fastest: 'fast', smart: 'smart', quietest: 'quiet' });
const TRUE_OPTIONS = Object.freeze({ avoidTolls:'avoid_tolls', avoidFerries:'avoid_ferries', avoidUnpaved:'avoid_unpaved', reroute:'reroute' });
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value,min,max) => isFiniteNumber(value) ? Math.max(min,Math.min(max,value)) : null;
const numberOrNull = value => isFiniteNumber(value) ? value : null;
const cleanText = (value,max=160) => typeof value === 'string' ? value.slice(0,max) : '';

export function engineUrl(base){
  const url=new URL(base);
  if(url.username || url.password || url.search || url.hash || !['http:','https:'].includes(url.protocol)) throw Error('URL de motor VANO inválida.');
  if(url.protocol!=='https:' && !['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname)) throw Error('Motor VANO remoto exige HTTPS.');
  return url;
}

/** Preserve the actual V1 API contract, including adaptive exclusions and GPS heading. */
export function buildV1Url(base,origin,destination,mode,vehicle,telemetry={},options={}) {
  if(!pointOK(origin)||!pointOK(destination))throw Error('Coordenadas inválidas.');
  if(!Object.hasOwn(MODES,mode))throw Error('Modo VANO inválido.');
  const url=new URL('/api/route',engineUrl(base));
  const values={start_lon:origin[0],start_lat:origin[1],end_lon:destination[0],end_lat:destination[1],mode,
    profile:vehicle==='moto'?'motorcycle':'driving',adaptive:options.adaptive===false?'0':'1',
    variant_budget:Math.floor(bounded(options.variantBudget,2,8)??4)};
  if(isFiniteNumber(telemetry.bearing)&&telemetry.bearing>=0&&telemetry.bearing<360) values.start_bearing=telemetry.bearing;
  if(isFiniteNumber(telemetry.speed)&&telemetry.speed>=0&&telemetry.speed<90) values.start_speed=telemetry.speed;
  if(options.departAt==='now' || /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(String(options.departAt||''))) values.depart_at=String(options.departAt).slice(0,28);
  for(const [option,parameter] of Object.entries(TRUE_OPTIONS)) if(options[option]===true) values[parameter]='1';
  if(Number.isInteger(options.localHour)&&options.localHour>=0&&options.localHour<24) values.local_hour=options.localHour;
  for(const [name,param] of [['safetyBias','safety_bias'],['trafficBias','traffic_bias']]){
    const n=bounded(options[name],0,100); if(n!==null)values[param]=Math.round(n);
  }
  for(const [key,value] of Object.entries(values))url.searchParams.set(key,String(value));
  return url;
}

/** Contract translation only: unit conversion + whitelisted route metadata. */
export function normalizeV1Route(payload,mode){
  const routes=Array.isArray(payload?.routes)?payload.routes:[];
  const selected=routes.find(r=>String(r?.id)===String(payload?.selected_id))||routes[0];
  const geometry=selected?.geometry;
  if(!selected||geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>100000||!geometry.coordinates.every(pointOK))throw Error('Motor original retornou geometria inválida.');
  const duration=Number(selected.duration),distance=Number(selected.distance);
  if(!Number.isFinite(duration)||duration<=0||duration>604800||!Number.isFinite(distance)||distance<=0||distance>3000000)throw Error('Motor original retornou distância ou ETA inválidos.');
  const degraded=payload?.degraded_mode?.active===true||payload?.distributed_routing?.fallback===true&&payload?.degraded_mode?.advanced_scoring_skipped===true;
  const steps=(Array.isArray(selected.steps)?selected.steps:[]).slice(0,700).map(s=>({
    instruction:cleanText(s?.instruction||'Continue pela rota',220),
    street:cleanText(s?.name,180),
    distance:numberOrNull(s?.distance),
    duration:numberOrNull(s?.duration),
    durationTypical:numberOrNull(s?.duration_typical),
    exit:numberOrNull(s?.exit),
    location:pointOK(s?.location)?s.location:null,
    bearing_after:numberOrNull(s?.bearing_after),
    type:cleanText(s?.type,60),
    modifier:cleanText(s?.modifier||s?.maneuver?.modifier,60),
    lanes:Array.isArray(s?.lanes)?s.lanes.slice(0,10).map(l=>({valid:l?.valid===true,active:l?.active===true,indications:Array.isArray(l?.indications)?l.indications.slice(0,6):[]})):[],
    speedLimitSign:cleanText(s?.speed_limit_sign,40),
    speedLimitUnit:cleanText(s?.speed_limit_unit,20),
    controls:Array.isArray(s?.controls)?s.controls.slice(0,24).map(c=>({lon:numberOrNull(c?.lon),lat:numberOrNull(c?.lat),type:cleanText(c?.type,40),label:cleanText(c?.label,120)})):[],
    voicePrompts:Array.isArray(s?.voice_prompts)?s.voice_prompts.slice(0,5).map(v=>({distance:numberOrNull(v?.distance),announcement:cleanText(v?.announcement,280)})):[],
  }));
  const meta={
    mode, engine:cleanText(payload.engine,120),
    selectedId:String(selected.id??''),
    provider:cleanText(payload.provider||selected.routing_provider,60),
    microRoutingSupported:payload.micro_routing===true,
    distributedUsed:payload?.distributed_routing?.used===true,
    distributedFallback:payload?.distributed_routing?.fallback===true,
    degraded,
    aiApplied:payload?.ai_routing?.applied===true,
    safetyEngine:cleanText(payload?.safety_engine,100),
    candidateCount:routes.length,
    candidatePoolCacheHit:payload?.candidate_pool_cache_hit===true,
    adaptiveEnabled:payload?.adaptive_routing?.enabled===true,
  };
  const safetyScore=numberOrNull(selected.safety_conservative_score??selected.safety_score);
  return {
    id:MODES[mode], label:({safest:'Mais segura',fastest:'Mais rápida',smart:'VANO inteligente',quietest:'Mais tranquila'})[mode],
    duration:Math.max(1,Math.round(duration/60)),distance:Math.round(distance/100)/10,
    geometry,steps,
    verifiedSafety:mode!=='fastest'&&!degraded&&selected.safety_evidence_verified===true,
    safetyScore, safetyLevel:numberOrNull(selected.safety_level),
    safetyConfidence:numberOrNull(selected.decision_confidence),
    riskExposurePct:numberOrNull(selected.risk_exposure_pct),
    microRoute:selected.micro_route===true,
    microStrategy:cleanText(selected.micro_strategy,100),
    microStreets:Array.isArray(selected.micro_streets)?selected.micro_streets.slice(0,6).map(x=>cleanText(x,100)):[],
    etaGainSeconds:numberOrNull(selected.eta_gain_s)??0,
    trafficScore:numberOrNull(selected.traffic_score),
    trafficLevel:cleanText(selected.traffic_level,70),
    liveFlowScore:numberOrNull(selected.live_flow_score),
    routingProvider:cleanText(selected.routing_provider,60),
    roadWarnings:Array.isArray(selected.professional_flags)?selected.professional_flags.slice(0,8).map(x=>cleanText(x,120)):[],
    source:'vano-original-python',
    originalRouteSignature:cleanText(selected.route_signature,140),
    engineMetadata:meta,
  };
}

/**
 * Consult the original engine for the two distinct objectives, in parallel.
 * Fastest mode is strictly ETA-only in the original; never derive it by applying
 * a heuristic to the safest response. The original response retains all the
 * candidate/micro-route computations, risk scoring and AI guardrails.
 */
export async function directionsFromV1(base,origin,destination,vehicle,telemetry={},options={},fetcher=fetch){
  engineUrl(base);
  const modes=options.includeAdvanced===true?['safest','fastest','smart','quietest']:['safest','fastest'];
  const timeout=Math.floor(bounded(options.timeoutMs,10000,90000)??65000);
  const get=async mode=>{
    const url=buildV1Url(base,origin,destination,mode,vehicle,telemetry,options);
    let response;
    try{response=await fetcher(url,{headers:{Accept:'application/json','X-VANO-Client':'vano-v2-original-engine'},signal:AbortSignal.timeout(timeout)});}
    catch(e){throw Error(`Motor original indisponível (${mode}): ${e?.name==='TimeoutError'?'tempo limite excedido':e?.message||'falha de rede'}`);}
    if(!response.ok)throw Error(`Motor original recusou rota (${mode}, HTTP ${response.status}).`);
    const payload=await response.json();
    if(!Array.isArray(payload?.routes)||payload.routes.length===0)throw Error(`Motor original não retornou candidatos (${mode}).`);
    return normalizeV1Route(payload,mode);
  };
  const routes=await Promise.all(modes.map(get));
  const degraded=routes.some(r=>r.engineMetadata.degraded);
  return {
    routes, source:'vano-original-python', engine:'vano-python-original',
    microRoutingActive:routes.some(r=>r.microRoute),
    microRoutingSupported:routes.some(r=>r.engineMetadata.microRoutingSupported),
    distributedRoutingUsed:routes.some(r=>r.engineMetadata.distributedUsed),
    degraded,
    safetyMessage:degraded
      ?'Motor VANO operando em contingência; avaliação avançada de segurança reduzida.'
      :'Rotas calculadas pela engenharia original VANO. Segurança é estimativa, não garantia; respeite a sinalização real.',
  };
}
