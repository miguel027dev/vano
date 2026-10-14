/**
 * VANO Transit - provider-neutral journey planner (opt-in).
 * Timetables, platforms and live arrivals must come from licensed agency feeds,
 * never inferred from road routing, OpenStreetMap POIs or model-generated data.
 *
 * Region endpoints are TRUSTED server configuration, not user-provided URLs.
 * OTP2 GTFS GraphQL planConnection is used per covered region.
 */
import {pointOK} from './routing.mjs';

export const TRANSIT_SORTS=Object.freeze(['balanced','fastest','lessWalking','fewerTransfers']);
const OTP_QUERY=String.raw`query VanoTransitPlan($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!, $first: Int!, $dateTime: PlanDateTimeInput!) {
  planConnection(origin: $origin, destination: $destination, first: $first, dateTime: $dateTime) {
    routingErrors { code description }
    edges { node {
      start end numberOfTransfers walkDistance
      legs {
        mode transitLeg duration distance headsign
        from { name lat lon } to { name lat lon }
        start { scheduledTime estimated { time } }
        end { scheduledTime estimated { time } }
        route { shortName color textColor }
        legGeometry { points }
      }
    } }
  }
}`;

export class TransitError extends Error {
  constructor(code,message,status=503){super(message);this.name='TransitError';this.code=code;this.status=status;}
}

const coord=(p)=>pointOK(p)&&p.length===2?p:null;
const allowedMode=(mode)=>typeof mode==='string'&&/^[A-Z_]{2,32}$/.test(mode)?mode:'UNKNOWN';
const safeLabel=(value,max=100)=>typeof value==='string'?value.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,max):'';
const color=(value)=>typeof value==='string'&&/^[0-9a-fA-F]{6}$/.test(value)?'#'+value.toUpperCase():null;
const validTime=(v)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const timeMs=(v)=>Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
const positive=(n)=>Number.isFinite(n)&&n>=0?n:0;

export function transitRegions(env=process.env){
  let source;
  try{source=JSON.parse(env.VANO_TRANSIT_REGIONS_JSON||'[]');}catch{return [];}
  if(!Array.isArray(source))return [];
  const names=new Set();
  return source.slice(0,80).flatMap(r=>{
    if(!r||typeof r!=='object'||!Array.isArray(r.bbox)||r.bbox.length!==4)return [];
    const id=safeLabel(r.id,48),name=safeLabel(r.name,90);
    const bb=r.bbox;
    if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id)||!name||names.has(id)
      ||!bb.every(Number.isFinite)||bb[0]>=bb[2]||bb[1]>=bb[3]
      ||bb[0]<-180||bb[2]>180||bb[1]<-90||bb[3]>90)return [];
    let url;
    try{url=new URL(r.otpUrl);}catch{return [];}
    // Reject credentials, query parameters, fragment, and non-HTTPS upstreams.
    // A region is a privately configured, vetted and isolated OTP deployment.
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return [];
    if(url.pathname!=='/otp/gtfs/v1')return [];
    names.add(id);
    return [{id,name,bbox:bb,otpUrl:url.toString(),timezone:safeLabel(r.timezone,80)||'UTC',version:'otp2-graphql'}];
  });
}
export function transitCapabilities(regions=[]){
  return {enabled:regions.length>0,protocol:'vano-transit-v1',coverage:regions.map(r=>({
    id:r.id,name:r.name,bbox:r.bbox,timezone:r.timezone,provider:'OpenTripPlanner/GTFS',
    timetable:true,realtime:'where-available',fares:'where-available'
  })),note:regions.length?'Cobertura limitada aos sistemas integrados; horários dependem das operadoras.':'Transporte público ainda não configurado nesta região.'};
}
export function findTransitRegion(origin,destination,regions=[]){
  return regions.find(({bbox:b})=>[origin,destination].every(p=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]))||null;
}
export function validateTransitRequest(input,now=Date.now()){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TransitError('invalid_request','Solicitação inválida.',400);
  const origin=coord(input.origin),destination=coord(input.destination);
  if(!origin||!destination||origin.every((c,i)=>Math.abs(c-destination[i])<.000001))throw new TransitError('invalid_coordinates','Informe origem e destino diferentes com coordenadas válidas.',400);
  const sort=TRANSIT_SORTS.includes(input.sort)?input.sort:'balanced';
  const date=input.departAt===undefined?new Date(now).toISOString():validTime(input.departAt);
  if(!date||timeMs(date)<now-300000||timeMs(date)>now+30*86400000)
    throw new TransitError('invalid_datetime','Escolha uma partida válida nos próximos 30 dias.',400);
  return {origin,destination,sort,departAt:date};
}
const place=p=>{
  const lon=Number(p?.lon),lat=Number(p?.lat);
  return {name:safeLabel(p?.name,110),coords:pointOK([lon,lat])?[lon,lat]:null};
};
const stopTime=(s)=>({scheduled:validTime(s?.scheduledTime),estimated:validTime(s?.estimated?.time)});
const modeKey=mode=>{
  const m=allowedMode(mode);
  if(m==='WALK')return 'walk';
  if(m==='BUS'||m==='COACH')return 'bus';
  if(m==='SUBWAY'||m==='METRO')return 'metro';
  if(m==='RAIL'||m==='TRAIN')return 'train';
  if(m==='TRAM')return 'tram';
  if(m==='FERRY')return 'ferry';
  if(m==='GONDOLA'||m==='CABLE_CAR'||m==='FUNICULAR')return 'other';
  return m.toLowerCase();
};
export function normalizeTransitResult(data,region,sort='balanced'){
  if(!data||typeof data!=='object')throw new TransitError('invalid_provider','Resposta incompleta do planejador de transporte.',502);
  if(data.errors?.length)throw new TransitError('provider_schema','O planejador de transporte retornou erro de compatibilidade.',502);
  const plan=data.data?.planConnection;
  if(!plan||!Array.isArray(plan.edges))throw new TransitError('invalid_provider','Resposta inválida do planejador de transporte.',502);
  const results=plan.edges.slice(0,12).flatMap((edge,index)=>{
    const item=edge?.node;
    if(!item||!Array.isArray(item.legs)||item.legs.length===0)return [];
    const legs=item.legs.slice(0,20).map((leg,i)=>({
      id:i,mode:modeKey(leg.mode),transit:leg.transitLeg===true,
      line:safeLabel(leg.route?.shortName,32)||null,
      headsign:safeLabel(leg.headsign,95)||null,
      lineColor:color(leg.route?.color),textColor:color(leg.route?.textColor),
      from:place(leg.from),to:place(leg.to),
      departure:stopTime(leg.start),arrival:stopTime(leg.end),
      durationSeconds:positive(leg.duration),distanceMeters:positive(leg.distance),
      geometryEncoded:typeof leg.legGeometry?.points==='string'&&leg.legGeometry.points.length<50000?leg.legGeometry.points:null
    }));
    if(!legs.some(l=>l.transit))return []; // never substitute walking-only for transit
    const start=validTime(item.start)||legs[0].departure.estimated||legs[0].departure.scheduled;
    const end=validTime(item.end)||legs.at(-1).arrival.estimated||legs.at(-1).arrival.scheduled;
    const durationSeconds=Number.isFinite(timeMs(start))&&Number.isFinite(timeMs(end))?Math.max(0,(timeMs(end)-timeMs(start))/1000):legs.reduce((s,l)=>s+l.durationSeconds,0);
    const walkMeters=Number.isFinite(item.walkDistance)?positive(item.walkDistance):legs.filter(l=>l.mode==='walk').reduce((s,l)=>s+l.distanceMeters,0);
    const transfers=Number.isInteger(item.numberOfTransfers)?Math.max(0,item.numberOfTransfers):Math.max(0,legs.filter(l=>l.transit).length-1);
    const realtime=legs.some(l=>l.transit&&(l.departure.estimated||l.arrival.estimated));
    return [{id:'transit-'+index,departure:start,arrival:end,durationMinutes:Math.ceil(durationSeconds/60),walkMeters:Math.round(walkMeters),transfers,realtime:Boolean(realtime),fare:null,legs}];
  });
  const score=r=>r.durationMinutes + (sort==='lessWalking'?r.walkMeters/65:r.walkMeters/260) +
    (sort==='fewerTransfers'?r.transfers*28:r.transfers*8);
  results.sort((a,b)=>sort==='fastest'?a.durationMinutes-b.durationMinutes:score(a)-score(b));
  return {source:'otp2-gtfs',coverage:{id:region.id,name:region.name,timezone:region.timezone},sort,
    itineraries:results.slice(0,6),errors:plan.routingErrors?.map(e=>safeLabel(e.description,120)).filter(Boolean).slice(0,3)||[],
    notice:'Horários previstos podem mudar. Tempo real somente quando informado pela operadora.'};
}
export async function planTransitTrip(input,{regions=transitRegions(),fetcher=fetch,now=Date.now(),timeoutMs=8000}={}){
  const request=validateTransitRequest(input,now);
  const region=findTransitRegion(request.origin,request.destination,regions);
  if(!region)throw new TransitError('not_covered','Ainda não há dados de transporte integrados para este trajeto.',404);
  const coords=p=>({location:{coordinate:{latitude:p[1],longitude:p[0]}}});
  let response;
  try{
    response=await fetcher(region.otpUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({query:OTP_QUERY,operationName:'VanoTransitPlan',variables:{
        origin:coords(request.origin),destination:coords(request.destination),first:8,
        dateTime:{earliestDeparture:request.departAt}
      }}),
      signal:AbortSignal.timeout(Math.min(12000,Math.max(1000,timeoutMs)))
    });
  }catch{throw new TransitError('provider_unavailable','O serviço de horários está temporariamente indisponível.',503);}
  if(!response.ok)throw new TransitError('provider_unavailable','O provedor não conseguiu calcular esta viagem.',502);
  let data;try{data=await response.json();}catch{throw new TransitError('provider_invalid','Resposta inválida do provedor.',502);}
  return normalizeTransitResult(data,region,request.sort);
}
