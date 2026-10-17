/**
 * Open Charge Map: optional, server-side charging POIs.
 * Never exposes credentials, blocks navigation, or invents charger availability.
 * https://www.openchargemap.org/develop/api
 */
import {parseBBox} from './map-public-data.mjs';

const API='https://api.openchargemap.io/v3/poi/';
const FRESH_MS=12*60_000,STALE_MS=45*60_000,RETRY_MS=90_000;
const clean=(value,max=120)=>String(value??'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
const valid=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=180&&Math.abs(y)<=85;
const bounds=b=>parseBBox(Array.isArray(b)?b.join(','):b,.12,.12);
const inBox=(x,y,b)=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];
const snap=b=>b.map(x=>(Math.round(x*1000)/1000).toFixed(3)).join(',');
const finite=n=>n===null||n===undefined||n===''?null:Number.isFinite(Number(n))?Number(n):null;

export function normalizeOpenChargeMap(raw,bbox){
 if(!Array.isArray(raw))return [];
 const out=[],ids=new Set();
 for(const point of raw.slice(0,240)){
  const loc=point?.AddressInfo||{};
  const lon=finite(loc.Longitude),lat=finite(loc.Latitude);
  const id=Number(point?.ID);
  if(!Number.isSafeInteger(id)||id<=0||!valid(lon,lat)||!inBox(lon,lat,bbox)||ids.has(id))continue;
  if(point?.StatusType?.IsOperational===false)continue;
  const n=clean(loc.Title||loc.AddressLine1||'Ponto de recarga',90);
  const connectorTypes=(Array.isArray(point.Connections)?point.Connections:[])
    .map(c=>clean(c?.ConnectionType?.Title||'',35)).filter(Boolean);
  const power=(Array.isArray(point.Connections)?point.Connections:[])
    .map(c=>finite(c?.PowerKW)).filter(x=>x!==null&&x>0&&x<1500);
  const parts=[clean(loc.Town||'',60),connectorTypes.slice(0,2).join(', '),
   power.length?'Até '+Math.max(...power)+' kW':''].filter(Boolean);
  ids.add(id);
  out.push({id:'ocm-'+id,type:'estacao-recarga',coords:[lon,lat],name:n,
   description:clean(parts.join(' · '),190),source:'Open Charge Map',
   sourceUrl:'https://openchargemap.org/site/poi/details/'+id,
   priority:55,poi:true,verified:false,liveAvailability:false});
  if(out.length===80)break;
 }
 return out;
}

export function createOpenChargeGateway({fetcher=fetch,clock=Date.now}={}){
 const cache=new Map(),pending=new Map(),attempt=new Map();
 const remember=(key,value)=>{cache.delete(key);cache.set(key,value);
  while(cache.size>70)cache.delete(cache.keys().next().value);};
 async function load(key,bbox,apiKey){
  try{
   const lon=(bbox[0]+bbox[2])/2,lat=(bbox[1]+bbox[3])/2;
   const url=new URL(API);
   url.searchParams.set('output','json');
   url.searchParams.set('latitude',String(lat));
   url.searchParams.set('longitude',String(lon));
   url.searchParams.set('distance',String(Math.min(18,Math.max(2,Math.ceil(Math.hypot(
    (bbox[2]-bbox[0])*111*Math.cos(lat*Math.PI/180),(bbox[3]-bbox[1])*111)*0.65)))));
   url.searchParams.set('distanceunit','KM');
   url.searchParams.set('maxresults','100');
   url.searchParams.set('compact','true');
   url.searchParams.set('opendata','true');
   const response=await fetcher(url,{headers:{'Accept':'application/json','X-API-Key':apiKey,
    'User-Agent':'VANO Maps (https://vanomaps.online)'},signal:AbortSignal.timeout(3200)});
   if(!response.ok)throw Error('Upstream HTTP '+response.status);
   if(Number(response.headers?.get?.('content-length')||0)>750_000)throw Error('payload-too-large');
   const body=await response.text();
   if(body.length>750_000)throw Error('payload-too-large');
   const data=JSON.parse(body);
   if(!Array.isArray(data))throw Error('invalid-shape');
   remember(key,{features:normalizeOpenChargeMap(data,bbox),at:clock(),ok:true});
  }catch{
   // A provider failure never removes last-known POIs within the stale TTL.
   if(!cache.has(key))remember(key,{features:[],at:clock(),ok:false});
  }finally{pending.delete(key);}
 }
 function snapshot(bbox,apiKey=''){
  const area=bounds(bbox);
  if(!area)throw new RangeError('Invalid charging viewport');
  if(typeof apiKey!=='string'||!apiKey.trim())return {enabled:false,status:'disabled',
   features:[],source:'Open Charge Map',affectsRouting:false};
  const key=snap(area),now=clock(),saved=cache.get(key);
  const age=saved?now-saved.at:Infinity;
  if(!pending.has(key)&&(!saved?.ok||age>FRESH_MS)
   &&now-(attempt.get(key)??-Infinity)>=RETRY_MS){
    attempt.set(key,now);
    pending.set(key,Promise.resolve().then(()=>load(key,area,apiKey.trim())));
  }
  const usable=saved?.ok&&age<STALE_MS;
  return {enabled:true,status:usable?(age<=FRESH_MS?'fresh':'stale')
   :pending.has(key)?'loading':'unavailable',
   features:usable?saved.features:[],source:'Open Charge Map',affectsRouting:false,
   sourceUrl:'https://www.openchargemap.org/',cacheAgeSeconds:Number.isFinite(age)?Math.round(age/1000):null};
 }
 return {snapshot};
}
const gateway=createOpenChargeGateway();
export const openChargeSnapshot=(bbox,key)=>gateway.snapshot(bbox,key);
