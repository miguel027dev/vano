/** Admin V2 traffic enrichment. Private, ephemeral, quota-bounded and advisory.
 * Only the selected route is examined; never touches ETA or routing policy.
 */
import {trafficRouteIndex,trafficPointAt,projectTrafficPoint,matchTrafficLine,trafficPoint} from '../src/lib/routeTraffic.mjs';
const ENDPOINT='https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/18/json';
const TTL=120000,MAX_DAY=480,MAX_HOUR=60;
// Live flow is ephemeral display evidence. It cannot become a historical
// training/ETA source without a separately verified redistribution license.
export function parseRouteTrafficRequest(body){
 const g=body?.geometry;
 if(g?.type!=='LineString'||!Array.isArray(g.coordinates)||g.coordinates.length>700||
  !g.coordinates.every(p=>Array.isArray(p)&&p.length===2&&trafficPoint(p)))return null;
 const index=trafficRouteIndex(g);
 if(!index||index.total<30||!['carro','moto'].includes(body.vehicle))return null;
 const from=body.fromMeters??0;
 if(!Number.isFinite(from)||from<0||from>index.total+100)return null;
 return {geometry:g,index,fromMeters:Math.min(from,index.total)};
}
export function normalizeRouteFlow(raw,index,sample,observedAt){
 const d=raw?.flowSegmentData;
 const coordinates=d?.coordinates?.coordinate?.map(p=>[p.longitude,p.latitude]);
 if(!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>1300||!coordinates.every(trafficPoint)||
  !Number.isFinite(d.currentSpeed)||d.currentSpeed<0||d.currentSpeed>180||
  !Number.isFinite(d.freeFlowSpeed)||d.freeFlowSpeed<=0||d.freeFlowSpeed>200||
  !Number.isFinite(d.confidence)||d.confidence<.65||d.confidence>1)return null;
 const geometry={type:'LineString',coordinates};
 const match=matchTrafficLine(index,geometry),near=projectTrafficPoint(trafficRouteIndex(geometry),sample);
 if(!match||!near||near.distance>18)return null;
 return {geometry,currentKmh:d.currentSpeed,freeFlowKmh:d.freeFlowSpeed,confidence:d.confidence,
  roadClosure:d.roadClosure===true,observedAt};
}
export function createRouteTrafficGateway({fetcher=fetch,clock=Date.now,incidentSnapshot=()=>({features:[],status:'unavailable'})}={}){
 const cache=new Map(),pending=new Map();
 let day=-1,calls=0,hour=-1,hourCalls=0,inflight=0,holdUntil=0;
 const metrics={cacheHits:0,providerSuccesses:0,providerFailures:0,
  acceptedSegments:0,rejectedSegments:0,quotaDeferrals:0,
  lastSuccessAt:null,lastFailureAt:null,lastFailureCategory:null};
 function rollover(){
  const now=clock(),today=Math.floor(now/86400000),thisHour=Math.floor(now/3600000);
  if(today!==day){day=today;calls=0;}
  if(thisHour!==hour){hour=thisHour;hourCalls=0;}
 }
 function status(){
  rollover();
  return {mode:'live-visualization-only',provider:'TomTom Flow Segment v4',
   dailyLimit:MAX_DAY,hourlyLimit:MAX_HOUR,callsToday:calls,callsThisHour:hourCalls,
   dailyRemaining:Math.max(0,MAX_DAY-calls),hourlyRemaining:Math.max(0,MAX_HOUR-hourCalls),
   inflight,cacheEntries:cache.size,cacheHits:metrics.cacheHits,
   providerSuccesses:metrics.providerSuccesses,providerFailures:metrics.providerFailures,
   acceptedSegments:metrics.acceptedSegments,rejectedSegments:metrics.rejectedSegments,
   quotaDeferrals:metrics.quotaDeferrals,
   circuitOpen:clock()<holdUntil,
   lastSuccessAt:metrics.lastSuccessAt,lastFailureAt:metrics.lastFailureAt,
   lastFailureCategory:metrics.lastFailureCategory,
   snapshotLifetimeSeconds:TTL/1000,routeEtaModified:false,
   persistedProviderData:false,trainedOnProviderData:false};
 }
 async function reading(index,p,key){
  const cacheKey=p.map(n=>n.toFixed(5)).join(','),hit=cache.get(cacheKey),now=clock();
  if(hit&&now-hit.at<TTL){
   metrics.cacheHits++;
   return hit.raw?normalizeRouteFlow(hit.raw,index,p,hit.at):null;
  }
  if(pending.has(cacheKey)){const saved=await pending.get(cacheKey);return saved?.raw?normalizeRouteFlow(saved.raw,index,p,saved.at):null;}
  rollover();
  if(calls>=MAX_DAY||hourCalls>=MAX_HOUR||inflight>=2||now<holdUntil){metrics.quotaDeferrals++;return null;}
  calls++;hourCalls++;inflight++;
  const job=(async()=>{
   let raw=null;
   try{
    const url=new URL(ENDPOINT);url.searchParams.set('point',p[1].toFixed(6)+','+p[0].toFixed(6));
    url.searchParams.set('key',key);url.searchParams.set('unit','kmph');
    const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(2500)});
    if(!response.ok){
     if([401,403].includes(response.status))holdUntil=clock()+60*60_000;
     else if(response.status===429)holdUntil=clock()+10*60_000;
     else if(response.status>=500)holdUntil=clock()+60_000;
     throw Error(response.status===429?'rate-limited':response.status===401||response.status===403?'permission-denied':'upstream-failure');
    }
    if(Number(response.headers?.get?.('content-length')||0)>150000)throw Error('oversize');
    const text=await response.text();if(text.length>150000)throw Error('oversize');
    const body=JSON.parse(text);
    // Retain provider evidence only in bounded process memory, never URL/key/GPS history.
    if(normalizeRouteFlow(body,index,p,clock())){
     raw=body;metrics.acceptedSegments++;metrics.providerSuccesses++;
     metrics.lastSuccessAt=new Date(clock()).toISOString();
    }else metrics.rejectedSegments++;
   }catch(error){
    metrics.providerFailures++;metrics.lastFailureAt=new Date(clock()).toISOString();
    const kind=String(error?.message||'').toLowerCase();
    metrics.lastFailureCategory=['permission-denied','rate-limited','upstream-failure','oversize'].includes(kind)
     ?kind:'network-or-payload';
    // No provider URL, credential, coordinates or response bodies in logs/status.
   }
   const value={raw,at:clock()};cache.set(cacheKey,value);
   while(cache.size>64)cache.delete(cache.keys().next().value);
   return value;
  })();
  pending.set(cacheKey,job);
  try{const saved=await job;return saved.raw?normalizeRouteFlow(saved.raw,index,p,saved.at):null;}
  finally{pending.delete(cacheKey);inflight--;}
 }
 return {status,async snapshot(request,secret=''){
  const key=String(secret).trim(),{index,fromMeters}=request;
  if(!key||key.startsWith('REPLACE_'))return {status:'unconfigured',flow:[],incidents:[],sampledAt:clock(),affectsEta:false};
  const end=Math.min(index.total,fromMeters+8000),span=end-fromMeters;
  const sampleCount=Math.min(8,Math.max(1,Math.ceil(span/650)));
  const samples=Array.from({length:sampleCount},(_,i)=>
   trafficPointAt(index,fromMeters+span*(i+.5)/sampleCount));
  // Up to three local cached incident areas along the upcoming corridor.
  const centers=[samples[0],samples[Math.floor(samples.length/2)],samples.at(-1)].filter(Boolean);
  const boxes=centers.map(p=>[Math.max(-180,p[0]-.04),Math.max(-85,p[1]-.04),Math.min(180,p[0]+.04),Math.min(85,p[1]+.04)]);
  boxes.forEach(b=>incidentSnapshot(b,key)); // Warm the existing non-blocking cache.
  const flow=[];
  for(let i=0;i<samples.length;i+=2){
   const batch=await Promise.all(samples.slice(i,i+2).map(p=>reading(index,p,key)));
   for(const r of batch)if(r&&!flow.some(x=>JSON.stringify(x.geometry)===JSON.stringify(r.geometry)))flow.push(r);
  }
  const incidents=new Map();
  for(const b of boxes){const result=incidentSnapshot(b,key);
   if(result.status==='fresh')for(const event of result.features||[])if(matchTrafficLine(index,event.roadGeometry))incidents.set(event.id,event);
  }
  return {status:flow.length||incidents.size?'fresh':'unavailable',source:'TomTom Traffic',sampledAt:clock(),
   flow,incidents:[...incidents.values()],affectsEta:false,coverage:'sampled-segments',attribution:'© TomTom'};
 }};
}
