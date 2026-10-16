/** VANO global seismic events, advisory only.
 * Fetch the public weekly significant-earthquakes GeoJSON in background,
 * keep only a tiny in-memory snapshot and NEVER delay routing or map start.
 */
const SOURCE='usgs-earthquakes';
const URL='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson';
const TTL=90_000,RETRY=60_000,STALE=3_600_000,MAX_BYTES=600_000;
const finite=Number.isFinite;
const clean=(x,max=130)=>String(x||'').replace(/[<>\u0000-\u001f]/g,'').slice(0,max);
export function normalizeUsgsEarthquakes(payload){
 const result=[];
 for(const item of (Array.isArray(payload?.features)?payload.features:[]).slice(0,120)){
  const coords=item?.geometry?.coordinates;
  if(item?.geometry?.type!=='Point'||!Array.isArray(coords)||coords.length<2)continue;
  const [lon,lat]=coords;
  if(!finite(lon)||!finite(lat)||Math.abs(lon)>180||Math.abs(lat)>85)continue;
  const ms=Number(item?.properties?.time),magnitude=Number(item?.properties?.mag);
  result.push({
   id:'usgs-'+clean(item.id,90),category:'earthquake',
   name:clean(item?.properties?.title||'Terremoto'),
   coords:[lon,lat],
   observedAt:finite(ms)&&ms>0?new Date(ms).toISOString():null,
   magnitude:finite(magnitude)?magnitude:null,source:'USGS',
   routingVerified:false
  });
 }
 return result;
}
const inBounds=(coords,[w,s,e,n])=>coords[0]>=w&&coords[0]<=e&&coords[1]>=s&&coords[1]<=n;
export function createSeismicGateway({fetcher=fetch,clock=Date.now}={}){
 let items=[],lastSuccess=-Infinity,lastAttempt=-Infinity,pending=null;
 async function refresh(){
  try{
   const response=await fetcher(URL,{headers:{Accept:'application/geo+json,application/json',
    'User-Agent':'VANO-Maps/1.0 (+https://vanomaps.online)'},
    signal:AbortSignal.timeout(2200)});
   if(!response.ok)throw Error('USGS unavailable');
   if(Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('USGS payload too large');
   const text=await response.text();
   if(text.length>MAX_BYTES)throw Error('USGS payload too large');
   const parsed=JSON.parse(text);
   if(!Array.isArray(parsed?.features))throw Error('USGS malformed payload');
   items=normalizeUsgsEarthquakes(parsed);
   lastSuccess=clock();
  }catch{ /* Keep the last known good snapshot, up to STALE. */ }
  finally{pending=null}
 }
 return function snapshot(bbox){
  const now=clock(),age=now-lastSuccess;
  if(!pending&&now-lastAttempt>=RETRY&&age>=TTL){
   lastAttempt=now;
   // Synchronous return: upstream refresh continues independently.
   pending=Promise.resolve().then(refresh);
  }
  const available=finite(lastSuccess)&&age<=STALE;
  const status=!available?(pending?'loading':'unavailable'):age>TTL?'stale':'fresh';
  return {events:available?items.filter(item=>inBounds(item.coords,bbox)).slice(0,25):[],
   source:{id:SOURCE,status,stale:status!=='fresh',cacheHit:available}};
 };
}
export const seismicSnapshot=createSeismicGateway();
