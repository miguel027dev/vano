/** Traffic source registry and opt-in municipal GeoJSON adapter.
 * Mapbox vector traffic works without this endpoint. Public feeds must be
 * independently verified for license, geometry and freshness before enabling.
 * Historical congestion metrics and satellite imagery are NOT live traffic.
 */
export const TRAFFIC_PROVIDER_CATALOG=Object.freeze([
 {id:'mapbox-traffic-v1',name:'Mapbox Traffic v1',mode:'live-vector',enabled:true,coverage:'where offered by Mapbox',refreshApproxMinutes:8},
 {id:'municipal-geojson',name:'Verified municipal GeoJSON feed',mode:'opt-in-live',enabled:false,coverage:'regional; requires vetted HTTPS feed'},
 {id:'cet-lentidao-historica',name:'CET SP historical congestion 2001–2018',mode:'historical-only',enabled:false},
 {id:'satellite-imagery',name:'Satellite/aerial imagery',mode:'basemap-only',enabled:false}
]);
const statuses=new Set(['low','moderate','heavy','severe']);
const trim=x=>typeof x==='string'?x.trim().slice(0,90):'';
export function parseTrafficBBox(raw){
 if(typeof raw!=='string'||raw.length>120)return null;
 const a=raw.split(',').map(Number);
 if(a.length!==4||!a.every(Number.isFinite))return null;
 const [w,s,e,n]=a;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>.2||n-s>.16)return null;
 return a.map(v=>+v.toFixed(5));
}
function validPoint(point){
 return Array.isArray(point)&&point.length>=2&&point.slice(0,2).every(Number.isFinite)&&
  Math.abs(point[0])<=180&&Math.abs(point[1])<=85;
}
function intersects(points,b){
 return points.some(([x,y])=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]);
}
export function normalizeMunicipalTraffic(payload,{bbox,now=Date.now(),max=260,source='Fonte pública verificada'}={}){
 const features=Array.isArray(payload?.features)?payload.features:[];
 if(!Array.isArray(bbox)||bbox.length!==4)return {type:'FeatureCollection',features:[]};
 const result=[],seen=new Set();
 for(const item of features.slice(0,3000)){
  if(result.length>=max)break;
  if(item?.type!=='Feature'||!['LineString','MultiLineString'].includes(item?.geometry?.type))continue;
  const prop=item.properties||{};
  const level=trim(prop.congestion).toLowerCase();
  if(!statuses.has(level))continue;
  const when=Date.parse(String(prop.observedAt||prop.updatedAt||''));
  // Reject undated, future, stale or hourly traffic snapshots represented as "live".
  if(!Number.isFinite(when)||when>now+60_000||now-when>20*60_000)continue;
  const lines=item.geometry.type==='LineString'?[item.geometry.coordinates]:item.geometry.coordinates;
  if(!Array.isArray(lines))continue;
  for(const line of lines){
   if(!Array.isArray(line)||line.length<2||line.length>1400||!line.every(validPoint)||!intersects(line,bbox))continue;
   const coordinates=line.map(p=>p.slice(0,2));
   const key=level+'|'+coordinates[0].join(',')+'|'+coordinates.at(-1).join(',');
   if(seen.has(key))continue;
   seen.add(key);
   result.push({type:'Feature',properties:{congestion:level,observedAt:new Date(when).toISOString(),
    source:trim(source)},geometry:{type:'LineString',coordinates}});
   if(result.length>=max)break;
  }
 }
 return {type:'FeatureCollection',features:result};
}
let memory=new Map();
function safeFeedUrl(raw){
 if(!raw)return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
  const h=u.hostname.toLowerCase();
  if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||
     /^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))return null;
  return u;
 }catch{return null;}
}
export async function configuredPublicTraffic(bbox,{url='',token='',fetcher=fetch,now=Date.now()}={}){
 if(!parseTrafficBBox(bbox?.join?.(',')))return {enabled:false,features:[],reason:'invalid-bbox'};
 const validated=safeFeedUrl(url);
 if(!validated)return {enabled:false,features:[],source:'Nenhuma base municipal atual configurada'};
 const key=bbox.map(x=>x.toFixed(2)).join(',');
 const cached=memory.get(key);
 if(cached&&now-cached.at<100000)return cached.value;
 try{
  const destination=new URL(validated);
  destination.searchParams.set('bbox',bbox.join(','));
  const response=await fetcher(destination.toString(),{
   signal:AbortSignal.timeout(4500),
   headers:{Accept:'application/geo+json,application/json',...(token?{Authorization:'Bearer '+token}:{})}
  });
  if(!response.ok)throw Error('traffic-upstream-'+response.status);
  if(Number(response.headers?.get?.('content-length')||0)>2_000_000)throw Error('feed-too-large');
  const body=await response.text();
  if(body.length>2_000_000)throw Error('feed-too-large');
  const normalized=normalizeMunicipalTraffic(JSON.parse(body),{bbox,now});
  const value={enabled:true,source:'Fonte municipal cadastrada',features:normalized.features,fetchedAt:new Date(now).toISOString()};
  memory.set(key,{at:now,value});
  if(memory.size>35)memory.delete(memory.keys().next().value);
  return value;
 }catch(error){
  return {enabled:true,source:'Fonte municipal cadastrada',features:[],stale:true,error:'Fonte pública temporariamente indisponível'};
 }
}
