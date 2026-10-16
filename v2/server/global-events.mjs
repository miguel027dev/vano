/** VANO international event context.
 * Fixed public providers; advisory only — NEVER a road closure or route penalty.
 * Cold requests never wait for remote APIs. No persistent storage required.
 */
const PROVIDERS=Object.freeze([
 {id:'nasa-eonet',url:'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=250',ttl:600_000},
 {id:'usgs-earthquakes',url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',ttl:90_000}
]);
const safeLabel=x=>String(x||'').replace(/[<>\u0000-\u001f]/g,'').slice(0,150);
const validCoord=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90;
function pointGeometry(g){
 const c=g?.coordinates||[];
 return g?.type==='Point'&&Array.isArray(c)&&validCoord(c[0],c[1])?[c[0],c[1]]:null;
}
export function parseGlobalEventFeed(id,body){
 const out=[];
 if(id==='nasa-eonet'){
  for(const item of (Array.isArray(body?.events)?body.events:[]).slice(0,300)){
   if(item?.closed)continue;
   const geometries=(Array.isArray(item?.geometry)?item.geometry:[]).filter(g=>pointGeometry(g));
   const latest=geometries.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
   const p=pointGeometry(latest);
   if(!p)continue; // Polygon centroids do not establish a road closure.
   out.push({id:'eonet:'+safeLabel(item.id),source:id,type:safeLabel(item.categories?.[0]?.id||'natural-event'),
    name:safeLabel(item.title||'Evento natural'),coords:p,observedAt:latest.date||null,
    precision:'regional',routeImpact:'none'});
  }
 }else if(id==='usgs-earthquakes'){
  for(const item of (Array.isArray(body?.features)?body.features:[]).slice(0,150)){
   const p=pointGeometry(item?.geometry);if(!p)continue;
   const mag=Number(item?.properties?.mag),millis=Number(item?.properties?.time);
   out.push({id:'usgs:'+safeLabel(item.id),source:id,type:'earthquake',
    name:safeLabel(item?.properties?.title||'Terremoto'),coords:p,
    magnitude:Number.isFinite(mag)?mag:null,
    observedAt:Number.isFinite(millis)&&millis>0?new Date(millis).toISOString():null,
    precision:'regional',routeImpact:'none'});
  }
 }
 return out;
}
function distanceKm(a,b){
 const rad=x=>x*Math.PI/180;
 const y1=rad(a[1]),y2=rad(b[1]),dy=y2-y1,dx=rad(b[0]-a[0]);
 const q=Math.sin(dy/2)**2+Math.cos(y1)*Math.cos(y2)*Math.sin(dx/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(Math.max(0,q))));
}
export function parseGlobalEventQuery(params){
 const lat=Number(params.get('lat')),lon=Number(params.get('lon'));
 const radiusKm=params.has('radius_km')?Number(params.get('radius_km')):100;
 if(!params.has('lat')||!params.has('lon')||!validCoord(lon,lat)||
    !Number.isFinite(radiusKm)||radiusKm<1||radiusKm>250)return null;
 return {lat,lon,radiusKm};
}
export const GLOBAL_EVENT_SOURCES=PROVIDERS.map(p=>({
 id:p.id,active:true,coverage:'global; incomplete',kind:'regional-event',routeImpact:'none',
 freshness: p.id==='nasa-eonet'?'event-updates':'usgs-significant-week'
}));
export function createGlobalEventGateway({fetcher=fetch,now=()=>Date.now()}={}){
 const state=new Map(PROVIDERS.map(p=>[p.id,{
  items:[],lastSuccess:-Infinity,lastAttempt:-Infinity,inflight:null
 }]));
 const fetchProvider=async provider=>{
  const response=await fetcher(provider.url,{headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('upstream-'+response.status);
  if(Number(response.headers?.get?.('content-length')||0)>2_000_000)throw new Error('oversized-upstream');
  const body=await response.text();
  if(body.length>2_000_000)throw new Error('oversized-upstream');
  return parseGlobalEventFeed(provider.id,JSON.parse(body));
 };
 function query({lat,lon,radiusKm=100}){
  if(!validCoord(lon,lat)||!Number.isFinite(radiusKm)||radiusKm<1||radiusKm>250)throw new RangeError('invalid-coordinates');
  const clock=now(),sources=[],events=[];
  for(const provider of PROVIDERS){
   const record=state.get(provider.id);
   const age=clock-record.lastSuccess;
   if(!record.inflight&&clock-record.lastAttempt>=60_000&&age>=provider.ttl){
    record.lastAttempt=clock;
    record.inflight=Promise.resolve().then(()=>fetchProvider(provider))
     .then(items=>{record.items=items;record.lastSuccess=now();})
     .catch(()=>{}) // Fail open, keep last known good snapshot for 1 hour.
     .finally(()=>{record.inflight=null;});
   }
   const available=Number.isFinite(record.lastSuccess)&&clock-record.lastSuccess<=3_600_000;
   const status=!available?(record.inflight?'loading':'unavailable')
    :age>provider.ttl?'stale':'fresh';
   sources.push({id:provider.id,status,updating:Boolean(record.inflight),
    ageSeconds:available?Math.max(0,Math.round(age/1000)):null});
   if(available)for(const e of record.items){
    const km=distanceKm([lon,lat],e.coords);
    if(km<=radiusKm)events.push({...e,distanceKm:+km.toFixed(1)});
   }
  }
  events.sort((a,b)=>a.distanceKm-b.distanceKm);
  return {events:events.slice(0,40),sources,routeImpact:'none',
   notice:'Alertas regionais informativos. Não confirmam bloqueios em ruas.'};
 }
 return {query};
}
const shared=createGlobalEventGateway();
export const queryGlobalEvents=point=>shared.query(point);
