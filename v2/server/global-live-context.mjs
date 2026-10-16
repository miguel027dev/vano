/** Global read-only context for the VANO map.
 * Never blocks /api/route or changes the route graph.
 * Fixed server-owned upstreams; no geographic dataset persistence.
 */
export const GLOBAL_CONTEXT_SOURCES=Object.freeze([
 {id:'nasa-eonet',label:'NASA EONET',kind:'natural-events',affectsRouting:false},
 {id:'met-norway',label:'MET Norway',kind:'forecast',affectsRouting:false}
]);
const cache=new Map(),cooldownUntil=new Map();
const MAX_CACHE=64,DEFAULT_TTL=12*60_000,MAX_STALE=60*60_000,MAX_BYTES=550_000;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clean=(s,length=160)=>typeof s==='string'?s.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,length):'';
export function parseGlobalBBox(raw){
 if(typeof raw!=='string'||raw.length>100)return null;
 const b=raw.split(',').map(Number);
 if(b.length!==4||!b.every(Number.isFinite))return null;
 const [w,s,e,n]=b;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>4||n-s>4)return null;
 return b.map(v=>+v.toFixed(3));
}
async function boundedJson(response){
 const length=Number(response.headers?.get?.('content-length')||0);
 if(length>MAX_BYTES)throw Error('payload too large');
 const text=await response.text();
 if(text.length>MAX_BYTES)throw Error('payload too large');
 return JSON.parse(text);
}
const inside=(point,b)=>Array.isArray(point)&&point.length>=2&&finite(point[0])&&finite(point[1])&&point[0]>=b[0]&&point[0]<=b[2]&&point[1]>=b[1]&&point[1]<=b[3];
export function normalizeEonet(body,bbox){
 const out=[],ids=new Set();
 for(const feature of (Array.isArray(body?.features)?body.features:[]).slice(0,120)){
  if(!feature||feature.type!=='Feature'||feature.geometry?.type!=='Point'||!inside(feature.geometry.coordinates,bbox))continue;
  const p=feature.properties||{},id=clean(String(feature.id||p.id||''),80),name=clean(p.title||p.name);
  if(!id||!name||ids.has(id))continue;
  ids.add(id);
  const observedAt=Date.parse(String(p.date||p.geometry?.at?.(-1)?.date||''));
  out.push({id,category:clean(p.categories?.[0]?.title||p.categories?.[0]?.id||'event',60),
   name,coords:feature.geometry.coordinates.slice(0,2),
   observedAt:Number.isFinite(observedAt)?new Date(observedAt).toISOString():null,
   source:'NASA EONET',routingVerified:false});
  if(out.length>=35)break;
 }
 return out;
}
export function normalizeMet(body){
 const time=body?.properties?.timeseries?.[0],data=time?.data||{},details=data.instant?.details||{};
 if(!Number.isFinite(Date.parse(String(time?.time||''))))return null;
 const temperature=details.air_temperature,wind=details.wind_speed,precipitation=data.next_1_hours?.details?.precipitation_amount;
 if(!finite(temperature)&&!finite(wind)&&!finite(precipitation))return null;
 return {observedAt:time.time,temperatureC:finite(temperature)?temperature:null,
  windMs:finite(wind)?wind:null,precipitationNextHourMm:finite(precipitation)?precipitation:null,
  symbol:clean(data.next_1_hours?.summary?.symbol_code||'',60),
  source:'MET Norway',kind:'forecast',routingVerified:false};
}
function keep(key,entry){cache.delete(key);cache.set(key,entry);while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);}
async function cachedFetch(id,key,request,parse,{fetcher,clock,timeoutMs,ttlMs}){
 const now=clock(),cached=cache.get(key);
 if(cached?.value&&now<cached.expires)return {value:cached.value,stale:false,cacheHit:true};
 if(cached?.pending)return cached.pending;
 if((cooldownUntil.get(id)||0)>now)return {value:cached?.value??null,stale:true,unavailable:true};
 const promise=(async()=>{
  try{
   const response=await fetcher(request,{signal:AbortSignal.timeout(timeoutMs),
    headers:{Accept:'application/json','User-Agent':'VANO-Maps/1.0 (+https://vanomaps.online)'}});
   if(!response.ok)throw Error('upstream '+response.status);
   const value=parse(await boundedJson(response));
   const providerExpiry=id==='met-norway'?Date.parse(response.headers?.get?.('expires')||''):NaN;
   const expires=Number.isFinite(providerExpiry)&&providerExpiry>now
    ?clamp(providerExpiry,now+60_000,now+60*60_000):now+ttlMs;
   keep(key,{value,expires,staleUntil:expires+MAX_STALE});
   cooldownUntil.delete(id);
   return {value,stale:false,cacheHit:false};
  }catch{
   cooldownUntil.set(id,now+60_000);
   const old=cache.get(key);
   return {value:old&&old.staleUntil>now?old.value:null,stale:true,unavailable:true};
  }finally{
   const current=cache.get(key);
   if(current?.pending===promise){delete current.pending;if(!current.value)cache.delete(key);}
  }
 })();
 keep(key,{...cached,pending:promise});
 return promise;
}
export async function queryGlobalContext(bbox,{fetcher=fetch,clock=Date.now,timeoutMs=1700}={}){
 const area=parseGlobalBBox(Array.isArray(bbox)?bbox.join(','):bbox);
 if(!area)throw new RangeError('Área global inválida');
 const [w,s,e,n]=area;
 const nasa=new URL('https://eonet.gsfc.nasa.gov/api/v3/events/geojson');
 nasa.searchParams.set('bbox',[w,n,e,s].join(','));
 nasa.searchParams.set('status','open');nasa.searchParams.set('days','10');nasa.searchParams.set('limit','80');
 const met=new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
 const lat=((s+n)/2).toFixed(2),lon=((w+e)/2).toFixed(2);
 met.searchParams.set('lat',lat);met.searchParams.set('lon',lon);
 const opts={fetcher,clock,timeoutMs:clamp(timeoutMs,300,2500),ttlMs:DEFAULT_TTL};
 const [events,weather]=await Promise.all([
  cachedFetch('nasa-eonet','nasa:'+area.map(x=>x.toFixed(3)).join(','),nasa,body=>normalizeEonet(body,area),opts),
  cachedFetch('met-norway','met:'+lat+','+lon,met,normalizeMet,{...opts,ttlMs:30*60_000})
 ]);
 return {events:events.value||[],weather:weather.value||null,sources:[
  {id:'nasa-eonet',stale:!!events.stale,cacheHit:!!events.cacheHit},
  {id:'met-norway',stale:!!weather.stale,cacheHit:!!weather.cacheHit}
 ],affectsRouting:false,
 notice:'Informação regional, não comprova riscos ou bloqueios em ruas específicas.',
 attribution:['NASA EONET','MET Norway']};
}
