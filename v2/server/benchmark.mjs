/** Public, read-only route benchmark contract for the VANO V2 router.
 * No account data, persistence, example results or provider secrets.
 */
import {pointOK} from './routing.mjs';

const PLACES=Object.freeze({
  morumbi:{label:'Shopping Morumbi · São Paulo',coords:[-46.6987,-23.6223]},
  paulista:{label:'MASP · Avenida Paulista',coords:[-46.6557,-23.5615]},
  congonhas:{label:'Aeroporto de Congonhas',coords:[-46.6566,-23.6263]},
  faria:{label:'Avenida Faria Lima',coords:[-46.6883,-23.5731]},
  ibirapuera:{label:'Parque Ibirapuera',coords:[-46.6597,-23.5874]}
});
const PAIRS=[['morumbi','paulista'],['congonhas','paulista'],['faria','ibirapuera'],['morumbi','ibirapuera'],['congonhas','faria'],['paulista','congonhas'],['paulista','morumbi'],['ibirapuera','faria']];
const IDS={fastest:'fast',safest:'safe',smart:'smart',quietest:'quiet'};
export const PUBLIC_BENCHMARK_MAX_KM=35;
export const PUBLIC_BENCHMARK_RATE=6;

export function benchmarkScenarios(limit=8){
  const count=Number.isInteger(limit)?Math.max(1,Math.min(8,limit)):8;
  return PAIRS.slice(0,count).map(([from,to])=>({
    id:from+'-'+to,
    origin:{...PLACES[from],coords:[...PLACES[from].coords]},
    destination:{...PLACES[to],coords:[...PLACES[to].coords]},
    profiles:['driving','motorcycle']
  }));
}
export function benchmarkModes(originalEngine=false){
  return originalEngine?Object.keys(IDS):['fastest','safest'];
}
export function benchmarkCapabilities({originalEngine=false,baseUrl='',enabled=true}={}){
  const prefix=String(baseUrl).replace(/\/$/,'');
  return {ok:enabled,service:'VANO Maps Benchmark Lab',protocol:'vano-route-benchmark',
    version:'2.0',public:true,readOnly:true,agentReady:true,
    enabled,engine:originalEngine?'vano-original':'mapbox-v2',
    limits:{requestsPerMinutePerIp:PUBLIC_BENCHMARK_RATE,maxDistanceKm:PUBLIC_BENCHMARK_MAX_KM,
      maxVariantBudget:4,recommendedParallelism:1,recommendedDelayMs:350},
    profiles:['driving','motorcycle'],
    modes:benchmarkModes(originalEngine),
    notes:[
      'Use identical coordinates and vehicle when comparing modes.',
      'Traffic and safety scores can be null; never treat null as zero.',
      'Without the original engine, safest is an alternative, not a verified safety ranking.',
      'Latency is measured on the V2 server; browser round-trip time is measured separately.',
      'Benchmark calls do not write trip history or require a user session.'
    ],
    endpoints:{
      capabilities:prefix+'/api/benchmark/v1/capabilities',
      scenarios:prefix+'/api/benchmark/v1/scenarios',
      route:prefix+'/api/benchmark/v1/route',
      page:prefix+'/benchmark-de-rotas'
    },
    parameters:{
      required:['start_lat','start_lon','end_lat','end_lon'],
      optional:{
        profile:'driving | motorcycle (default driving)',
        mode:'fastest | safest | smart | quietest (check modes first)',
        adaptive:'0 | 1 (default 0)',
        variant_budget:'2..4 (default 2)',
        include_geometry:'0 | 1 (default 0)',
        avoid_tolls:'0 | 1', avoid_ferries:'0 | 1',avoid_unpaved:'0 | 1'
      }
    },
    example:{method:'GET',url:prefix+'/api/benchmark/v1/route?start_lat=-23.6223&start_lon=-46.6987&end_lat=-23.5615&end_lon=-46.6557&profile=driving&mode=fastest'}
  };
}
const decimal=(text,lo,hi)=>{
  if(text===null||!/^-?\d{1,3}(?:\.\d{1,7})?$/.test(text))return null;
  const value=Number(text);
  return Number.isFinite(value)&&value>=lo&&value<=hi?value:null;
};
const kmBetween=(a,b)=>{
  const r=Math.PI/180,dLat=(b[1]-a[1])*r,dLon=(b[0]-a[0])*r;
  const v=Math.sin(dLat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dLon/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(v)));
};
export function parseBenchmarkParams(query,{originalEngine=false}={}){
  const origin=[decimal(query.get('start_lon'),-180,180),decimal(query.get('start_lat'),-90,90)];
  const destination=[decimal(query.get('end_lon'),-180,180),decimal(query.get('end_lat'),-90,90)];
  if(!pointOK(origin)||!pointOK(destination))return {error:'invalid_coordinates',message:'Informe coordenadas válidas (lat/lon) para origem e destino.',status:400};
  const distance=kmBetween(origin,destination);
  if(distance<0.08)return {error:'same_location',message:'Origem e destino estão muito próximos.',status:422};
  if(distance>PUBLIC_BENCHMARK_MAX_KM)return {error:'distance_limit',message:'A distância direta excede o limite público de 35 km.',status:422};
  const profile=query.get('profile')||'driving';
  if(!['driving','motorcycle'].includes(profile))return {error:'invalid_profile',message:'Perfil inválido. Use driving ou motorcycle.',status:400};
  const mode=query.get('mode')||'fastest';
  if(!Object.hasOwn(IDS,mode)||!benchmarkModes(originalEngine).includes(mode))return {error:'unsupported_mode',message:'Modo não disponível neste motor. Consulte /capabilities.',status:422};
  const flag=name=>{const value=query.get(name);return value===null||value==='0'?false:value==='1'?true:null;};
  const names=['adaptive','include_geometry','avoid_tolls','avoid_ferries','avoid_unpaved'],flags={};
  for(const name of names){flags[name]=flag(name);if(flags[name]===null)return {error:'invalid_parameter',message:'Parâmetro inválido: '+name,status:400};}
  const raw=query.get('variant_budget')??'2';
  if(!/^[234]$/.test(raw))return {error:'invalid_variant_budget',message:'variant_budget deve ser 2, 3 ou 4.',status:400};
  return {origin,destination,profile,vehicle:profile==='motorcycle'?'moto':'carro',mode,routeId:IDS[mode],
    directDistanceKm:distance,variantBudget:Number(raw),...flags};
}
const validNumber=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
export function summarizeBenchmark(result,request,{elapsedMs=0,requestId='',generatedAt=new Date().toISOString()}={}){
  const routes=Array.isArray(result?.routes)?result.routes:[];
  const selected=routes.find(r=>r?.id===request.routeId);
  if(!selected||!pointOK(selected.geometry?.coordinates?.[0])||selected.geometry?.type!=='LineString'||selected.geometry.coordinates.length<2)
    return {error:'missing_route',message:'Motor não retornou um trajeto válido para este modo.',status:502};
  const duration=validNumber(selected.duration),distance=validNumber(selected.distance);
  if(duration===null||duration<=0||distance===null||distance<=0)return {error:'invalid_metrics',message:'Motor retornou duração ou distância inválida.',status:502};
  const meta=selected.engineMetadata||{};
  const count=validNumber(meta.candidateCount)??validNumber(result.candidateEngine?.candidateCount)??routes.length;
  return {ok:true,protocol:'vano-route-benchmark',version:'2.0',requestId,generatedAt,
    request:{origin:request.origin,destination:request.destination,profile:request.profile,mode:request.mode,
      adaptive:request.adaptive,variantBudget:request.variantBudget,directDistanceKm:Number(request.directDistanceKm.toFixed(2))},
    metrics:{serverLatencyMs:Math.round(elapsedMs),etaMin:duration,distanceKm:distance,
      candidateCount:count,provider:selected.routingProvider||meta.provider||result.source||'unknown',
      trafficScore:validNumber(selected.trafficScore),safetyScore:validNumber(selected.safetyScore),
      verifiedSafety:selected.verifiedSafety===true,distributed:meta.distributedUsed??null,
      degraded:result.degraded===true||meta.degraded===true,source:result.source||'unknown',
      selectedRouteId:selected.id},
    geometry:request.include_geometry?selected.geometry:null,
    limitations:result.safetyMessage||null
  };
}
