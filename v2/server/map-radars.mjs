/** Dedicated, bounded OSM speed-camera feed.
 * This intentionally never guesses speed cameras from road geometry or names.
 * A failed ancillary POI query cannot delay or erase already-mapped radars.
 */
import {OSM_ATTRIBUTION,parseBBox,normalizeOsmElements} from './map-public-data.mjs';
import {queryRadarSnapshot} from './radar-catalog.mjs';
import {entirelyBrazilCore,overlapsBrazilBounds} from './radar-geography.mjs';
import {radarDisplayAllowed,radarFullyRestrictedBBox} from '../src/lib/radarPolicy.js';
import {queryWorldRadarCatalog} from './world-radar-catalog.mjs';

export const RADAR_OVERPASS_SERVERS=Object.freeze([
 'https://overpass-api.de/api/interpreter',
 'https://overpass.private.coffee/api/interpreter',
 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]);
const cache=new Map();
const successTtl=30*60*1000;
const failureTtl=2*60*1000;
const staleTtl=24*60*60*1000;
let running=0,upstreamDownUntil=0;

export function radarOverpassQuery(bbox){
 const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.3,.3);
 if(!b)throw new RangeError('Radar bounding box inválida');
 const area=[b[1],b[0],b[3],b[2]].map(n=>n.toFixed(5)).join(',');
 return '[out:json][timeout:14];('+
   'node["highway"="speed_camera"]('+area+');'+
   'node["enforcement"="maxspeed"]('+area+');'+
   ');out body 160;';
}
export function normalizeMappedRadars(elements=[]){
 const mapped=(Array.isArray(elements)?elements:[]).filter(e=>e?.type==='node'&&
  (e.tags?.highway==='speed_camera'||e.tags?.enforcement==='maxspeed'));
 return normalizeOsmElements(mapped,120).filter(p=>p.type==='radar'&&radarDisplayAllowed(p.coords));
}
function fallback(old,now,error){
 if(old?.result?.features?.length&&old.updatedAt+staleTtl>now)
  return {...old.result,stale:true,error,cacheHit:true};
 return {features:[],source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,stale:true,error};
}
function prune(){
 while(cache.size>160)cache.delete(cache.keys().next().value);
}
/** Existing Brazilian catalog takes precedence when OSM maps the same device.
 * This merges sources without slowing down the view, even if OSM is offline.
 */
export function mergeRadarSources(national,international){
 if(!national?.features?.length)return international;
 if(!international?.features?.length)return {
  ...national,cacheHit:international?.cacheHit||false,
  internationalUnavailable:Boolean(international?.error)
 };
 const features=[...national.features];
 for(const radar of international.features){
  const lon=radar.coords?.[0],lat=radar.coords?.[1];
  if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
  // Approx. 35 metres, latitude-adjusted. National coordinates win.
  const duplicate=features.some(p=>{
   const [x,y]=p.coords||[];
   return Number.isFinite(x)&&Number.isFinite(y)&&
    Math.hypot((x-lon)*Math.cos(lat*Math.PI/180),y-lat)<.00032;
  });
  if(!duplicate)features.push(radar);
  if(features.length>=160)break;
 }
 return {
  ...national,features,source:'VANO Radar Catalog + OpenStreetMap',
  coverage:'national-snapshot-and-mapped',fetchedAt:international.fetchedAt,
  cacheHit:international.cacheHit||false,stale:Boolean(international.stale),
  internationalUnavailable:Boolean(international.error)
 };
}
export async function queryPublicRadars(bbox,{fetcher=fetch,now=()=>Date.now(),servers=RADAR_OVERPASS_SERVERS,useSnapshot=true,
 useWorldSnapshot=useSnapshot&&fetcher===fetch,worldFetcher=fetch}={}){
 const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.3,.3);
 if(!b)throw new RangeError('Radar bounding box inválida');
 if(radarFullyRestrictedBBox(b))return {features:[],source:'VANO Radar Policy',stale:false,coverage:'restricted'};
 // Do not scan the 8,885-point national dataset for viewports outside Brazil.
 // Inside the Brazilian core the existing offline catalog retains priority,
 // including legitimately empty responses. Border/coastal areas merge sources.
 const snapshot=useSnapshot&&overlapsBrazilBounds(b)?queryRadarSnapshot(b):null;
 if(snapshot&&entirelyBrazilCore(b))return snapshot;
 const national=snapshot?.features?.length?snapshot:null;
 const withNational=result=>mergeRadarSources(national,result);
 // Worldwide OSM snapshots are indexed in memory and avoid external network
 // work on every pan. Keep the existing Brazil interior fast path untouched.
 if(useWorldSnapshot){
  // Production: start the large world/UK downloads in background so they never
  // block a viewport request. Unit fixtures can opt into awaiting the load.
  const catalog=await queryWorldRadarCatalog(b,{fetcher:worldFetcher,now,
   waitForLoad:worldFetcher!==fetch});
  if(catalog.available){
   if(catalog.features.length)return withNational(catalog);
   // A working world catalog can still miss locally mapped cameras.
   // Probe only small, empty viewports in the background without blocking map UX.
   const gapKey=b.map(n=>(Math.round(n*1000)/1000).toFixed(3)).join(',');
   const oldGap=cache.get(gapKey),moment=now();
   if(oldGap?.result?.features?.length&&oldGap.updatedAt+staleTtl>moment)
    return withNational({...oldGap.result,cacheHit:true,
     stale:oldGap.expires<=moment||oldGap.result.stale===true});
   const eligible=b[2]-b[0]<=.13&&b[3]-b[1]<=.13;
   const startProbe=eligible&&!oldGap?.pending&&(!oldGap?.expires||oldGap.expires<=moment)
    &&running<2&&(fetcher!==fetch||moment>=upstreamDownUntil);
   if(startProbe){
    void queryPublicRadars(b,{fetcher,now,servers,useSnapshot:false,useWorldSnapshot:false})
     .catch(error=>console.warn('[VANO radar gap probe]',error?.message||String(error)));
   }
   return withNational({...catalog,refreshing:startProbe||Boolean(cache.get(gapKey)?.pending)});
  }
 }
 // Radar-only Overpass queries are cheap compared with POI searches.
 // The normal camera viewport is up to 0.30 x 0.30 degrees; rejecting it
 // here previously left EVERY foreign city with zero pins when CSV failed.
 // parseBBox above already caps both dimensions and validates coordinates.
 // Stable ~100 m cells, to reuse results across adjacent camera pans.
 const key=b.map(n=>(Math.round(n*1000)/1000).toFixed(3)).join(',');
 const started=now(),old=cache.get(key);
 // Prevent repeated 504/timeout storms when external Overpass hosts are down.
 // Only production fetches influence this breaker, not mocked unit tests.
 if(fetcher===fetch&&started<upstreamDownUntil)
  return withNational(fallback(old,started,'Fonte Overpass temporariamente indisponível'));
 if(old?.result&&old.expires>started)return withNational({...old.result,cacheHit:true});
 if(old?.pending)return old.pending.then(withNational);
 if(running>=2)return withNational(fallback(old,started,'Fonte de radares ocupada'));
 running++;
 const request=(async()=>{
  const query=new URLSearchParams({data:radarOverpassQuery(b)}).toString();
  let lastError;
  for(const [index,url] of servers.entries()){
   try{
    const response=await fetcher(url,{method:'POST',
     headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json',
      'User-Agent':'VANO Maps radar map (+https://vanomaps.online)'},
     body:query,signal:AbortSignal.timeout(index===0?6500:5500)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data?.elements))throw Error('Invalid Overpass elements');
    const result={features:normalizeMappedRadars(data.elements),
      source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,
      licenseUrl:'https://www.openstreetmap.org/copyright',stale:false,
      coverage:'mapped-only',fetchedAt:new Date(now()).toISOString()};
    cache.delete(key);cache.set(key,{result,updatedAt:now(),expires:now()+successTtl});
    prune();
    return result;
   }catch(error){
    lastError=error;
    console.warn('[VANO radar source]',index+1,error?.message||String(error));
   }
  }
  if(fetcher===fetch)upstreamDownUntil=now()+5*60*1000;
  const failed=fallback(old,now(),'Radar temporariamente indisponível');
  cache.delete(key);
  cache.set(key,{result:failed,updatedAt:old?.updatedAt||now(),expires:now()+failureTtl});
  prune();
  return failed;
 })().finally(()=>{running--;});
 cache.set(key,{...old,pending:request,expires:started+successTtl});
 return request.then(withNational);
}
