/** Read-only traffic corroboration for administrators. No ETA changes, no
 * route persistence, no GPS from users. TomTom Flow API v4 is requested with
 * the server's existing VANO_TOMTOM_API_KEY and bounded per-install quota.
 * Traffic measurement is never mapped to another carriageway by proximity
 * alone: geometry and direction must agree or the sample is rejected.
 */
const URL_BASE='https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/16/json';
const ttlMs=120000,cacheMax=45,dailyMax=96;
const cache=new Map();let daily={day:-1,count:0};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const radians=x=>x*Math.PI/180;
function meters(a,b){
 const lat=(a[1]+b[1])/2;
 return Math.hypot((a[0]-b[0])*111320*Math.cos(radians(lat)),(a[1]-b[1])*110540);
}
function bearing(a,b){
 const dy=(b[1]-a[1])*110540,dx=(b[0]-a[0])*111320*Math.cos(radians((a[1]+b[1])/2));
 return Math.atan2(dx,dy)*180/Math.PI;
}
function angle(a,b){return Math.abs(((a-b+540)%360)-180);}
function closestDistance(a,line){
 let best=Infinity;
 for(let i=1;i<line.length;i++){
  const p=line[i-1],q=line[i];
  const sx=111320*Math.cos(radians(a[1])),sy=110540;
  const dx=(q[0]-p[0])*sx,dy=(q[1]-p[1])*sy;
  const d=dx*dx+dy*dy;
  const t=d>0?Math.max(0,Math.min(1,((a[0]-p[0])*sx*dx+(a[1]-p[1])*sy*dy)/d)):0;
  best=Math.min(best,Math.hypot((a[0]-p[0])*sx-t*dx,(a[1]-p[1])*sy-t*dy));
 }
 return best;
}
export function selectFlowSamplePoints(geometry,max=4){
 const points=geometry?.coordinates;
 if(!Array.isArray(points)||points.length<4||points.length>100000||!points.every(point))return [];
 const lengths=[0];
 for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+meters(points[i-1],points[i]));
 const total=lengths.at(-1);
 if(total<500||total>150000)return [];
 const positions=[];
 for(const f of [.18,.39,.61,.82].slice(0,max)){
  let i=1;while(i<lengths.length-1&&lengths[i]<total*f)i++;
  if(i<=0||i>=points.length-1)continue;
  if(meters(points[i-1],points[i+1])<20)continue;
  positions.push({point:points[i],bearing:bearing(points[i-1],points[i+1]),
    distanceFromStartKm:Number((lengths[i]/1000).toFixed(2))});
 }
 return positions;
}
export function normalizeFlowReading(raw,sample){
 const d=raw?.flowSegmentData||raw;
 if(!sample||!point(sample.point)||!finite(sample.bearing)||!d)return {status:'rejected',reason:'invalid-sample'};
 const v=d.currentSpeed,ff=d.freeFlowSpeed,cf=d.confidence;
 const coords=Array.isArray(d?.coordinates?.coordinate)?d.coordinates.coordinate.map(p=>[p.longitude,p.latitude]):[];
 if(!finite(v)||v<=0||v>160||!finite(ff)||ff<=0||ff>180||
    !finite(cf)||cf<.55||cf>1||coords.length<2||coords.length>200||
    !coords.every(point))return {status:'rejected',reason:'insufficient-provider-evidence'};
 const distance=closestDistance(sample.point,coords);
 if(distance>55)return {status:'rejected',reason:'unmatched-road'};
 // Direction evidence: the provider polyline is oriented in the measured flow
 // direction, not necessarily the same carriageway as the nearby query point.
 const heading=bearing(coords[0],coords.at(-1));
 if(angle(heading,sample.bearing)>42)return {status:'rejected',reason:'direction-not-verified'};
 const speedRatio=Math.min(1.5,Math.max(0,v/ff));
 return {status:'matched',distanceFromStartKm:sample.distanceFromStartKm,
  currentKmh:v,freeFlowKmh:ff,speedRatio:Number(speedRatio.toFixed(3)),
  confidence:Number(cf.toFixed(2)),roadClosure:d.roadClosure===true,
  geomMatchMeters:Math.round(distance),directionDiffDegrees:Math.round(angle(heading,sample.bearing)),
  // This is a sample, not a multiplier for the route-wide ETA.
  quality:cf>=.8?'high':'limited'};
}
const responseLimit=100000;
async function fetchFlow(sample,secret,{fetcher=fetch,now=Date.now}={}){
 const key=sample.point.map(n=>n.toFixed(4)).join(',')+'|'+Math.round(sample.bearing/15);
 const hit=cache.get(key),time=now();
 if(hit&&time-hit.at<ttlMs)return {...hit.reading,cache:true};
 const day=Math.floor(time/86400000);
 if(daily.day!==day)daily={day,count:0};
 if(daily.count>=dailyMax)return {status:'unavailable',reason:'daily-budget'};
 daily.count++;
 const u=new URL(URL_BASE);
 u.searchParams.set('point',sample.point[1].toFixed(6)+','+sample.point[0].toFixed(6));
 u.searchParams.set('unit','kmph');
 u.searchParams.set('key',secret);
 let reading;
 try{
  const res=await fetcher(u.toString(),{signal:AbortSignal.timeout(4000),headers:{Accept:'application/json'}});
  if(!res.ok)throw Error(res.status===403||res.status===401?'permission-or-product-not-authorized':res.status===429?'rate-limit':'source-unavailable');
  if(Number(res.headers?.get?.('content-length')||0)>responseLimit)throw Error('payload-too-large');
  const text=await res.text();
  if(text.length>responseLimit)throw Error('payload-too-large');
  reading=normalizeFlowReading(JSON.parse(text),sample);
 }catch(error){reading={status:'unavailable',reason:/permission-or-product-not-authorized|rate-limit/.test(String(error?.message))?
  String(error.message):'network-or-provider-failure'};}
 // Cache only safely redacted diagnostics; never cache URLs containing keys.
 cache.set(key,{at:time,reading});
 if(cache.size>cacheMax)cache.delete(cache.keys().next().value);
 return reading;
}
export async function tomTomFlowAudit(route,key,{fetcher=fetch,now=Date.now}={}){
 const secret=String(key||'').trim();
 if(!secret||secret.startsWith('REPLACE_'))return {status:'not-configured',source:'TomTom Traffic Flow',samples:[],matched:0,canAdjustEta:false};
 const points=selectFlowSamplePoints(route?.geometry);
 if(!points.length)return {status:'invalid-route',source:'TomTom Traffic Flow',samples:[],matched:0,canAdjustEta:false};
 const samples=[];
 // Serial, never a fan-out across all users or a quota-busting request burst.
 for(const p of points) samples.push(await fetchFlow(p,secret,{fetcher,now}));
 const matched=samples.filter(x=>x.status==='matched');
 const sum=matched.reduce((s,x)=>s+x.confidence,0);
 const avg=matched.length?matched.reduce((s,x)=>s+x.speedRatio*x.confidence,0)/sum:null;
 return {source:'TomTom Traffic Flow',status:matched.length?'sampled':'unverified',
  sampledAt:new Date(now()).toISOString(),attempted:samples.length,matched:matched.length,
  lowFlowSamples:matched.filter(x=>x.speedRatio<.45).length,
  medianLikeWeightedFlowRatio:avg===null?null:Number(avg.toFixed(3)),
  sampledCoveragePct:null, // No route-wide coverage claim from 4 spot measurements.
  canAdjustEta:false, // Needs calibration and non-overlap vs Mapbox existing delays.
  reason:'Comparação independente; amostras de velocidade não provam tempo restante ou atraso adicional.',
  samples};
}
