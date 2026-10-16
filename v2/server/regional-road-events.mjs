/** Keyless regional road events: source-owned fixed HTTPS feeds only.
 * These are advisory map markers, NEVER instructions to alter route geometry.
 * A cold request reads empty cache immediately and refreshes in background.
 */
const REGION=[
 {id:'tfl-london',label:'Transport for London',region:'London',bounds:[-.68,51.25,.38,51.76],
  endpoint:'https://api.tfl.gov.uk/Road/all/Disruption',ttl:240000},
 {id:'drivebc',label:'DriveBC Open511',region:'British Columbia, Canada',bounds:[-139.1,48,-114,60.2],
  endpoint:'https://api.open511.gov.bc.ca/events',ttl:240000},
 {id:'fintraffic-works',label:'Fintraffic Digitraffic',region:'Finland',bounds:[19,59,32,70.3],
  endpoint:'https://tie.digitraffic.fi/api/traffic-message/v2/roadworks?includeAreaGeometry=false',ttl:360000},
 {id:'fintraffic-alerts',label:'Fintraffic Digitraffic',region:'Finland',bounds:[19,59,32,70.3],
  endpoint:'https://tie.digitraffic.fi/api/traffic-message/v2/traffic-announcements?includeAreaGeometry=false',ttl:360000}
];
export const KEYLESS_ROAD_SOURCES=Object.freeze(REGION.map(({id,label,region})=>({
 id,label,region,keyRequired:false,enabled:true,routingImpact:'none'
})));
const MAX_CACHE=36,MAX_BYTES=3_200_000,STALE_MS=15*60000,COOLDOWN_MS=35000;
const clean=(x,n=160)=>String(x??'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,n);
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const inside=(p,b)=>valid(p)&&p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const intersection=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function parseRegionalRoadBBox(raw){
 if(typeof raw!=='string'||raw.length>100)return null;
 const arr=raw.split(',').map(Number);
 if(arr.length!==4||!arr.every(Number.isFinite))return null;
 const [w,s,e,n]=arr;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>1.3||n-s>1.3)return null;
 return arr;
}
function pickPoint(geometry,bbox){
 // Some Open511 Points are represented with one extra coordinate-array level.
 if(!geometry||!['Point','MultiPoint','LineString','MultiLineString'].includes(geometry.type))return null;
 const stack=[geometry.coordinates],possible=[];
 let checked=0;
 while(stack.length&&checked++<500){
  const item=stack.pop();
  if(!Array.isArray(item))continue;
  if(valid(item)){possible.push(item.slice(0,2));if(inside(item,bbox))return item.slice(0,2);}
  else for(let i=Math.min(item.length,100)-1;i>=0;i--)stack.push(item[i]);
 }
 return null; // Never guess position using a point outside the viewport.
}
function activeTime(start,end,now){
 const a=start?Date.parse(start):NaN,b=end?Date.parse(end):NaN;
 return (!Number.isFinite(a)||a<=now+120000)&&(!Number.isFinite(b)||b>=now);
}
const event=(id,type,coords,name,description,source,observedAt,endsAt,priority=67)=>({
 id:'regional-'+clean(id,110),type,coords,name:clean(name,110),
 description:clean(description,200),source,observedAt:observedAt||null,
 endsAt:endsAt||null,priority,verified:false,routingVerified:false,regional:true
});
export function normalizeTflRoadEvents(body,bbox,now=Date.now()){
 if(!Array.isArray(body))return [];
 const out=[],seen=new Set();
 for(const f of body.slice(0,2000)){
  if(f?.status&&String(f.status).toLowerCase()!=='active')continue;
  if(!activeTime(f?.startDateTime,f?.endDateTime,now))continue;
  const coords=valid(f?.geography?.coordinates)&&inside(f.geography.coordinates,bbox)?
    f.geography.coordinates:null;
  if(!coords)continue;
  const category=String(f.category||'').toLowerCase();
  const type=/work|construction|maintenance/.test(category)?'obra':'alerta-via';
  const id=clean(f.id,80);if(!id||seen.has(id))continue;seen.add(id);
  out.push(event('tfl-'+id,type,coords,type==='obra'?'Obra na via':'Ocorrência na via',
   f.comments||f.currentUpdate||f.location,'Transport for London',
   f.lastModifiedTime||f.currentUpdateDateTime,f.endDateTime,type==='obra'?70:77));
 }
 return out.slice(0,100);
}
export function normalizeDriveBcRoadEvents(body,bbox,now=Date.now()){
 const entries=Array.isArray(body?.events)?body.events:[];
 const out=[],seen=new Set();
 for(const f of entries.slice(0,500)){
  if(String(f?.status||'').toUpperCase()!=='ACTIVE')continue;
  const id=clean(f.id,80);if(!id||seen.has(id))continue;
  const isWorks=String(f.event_type||'').toUpperCase()==='CONSTRUCTION';
  if(!['CONSTRUCTION','INCIDENT','ROAD_CONDITION','SPECIAL_EVENT'].includes(String(f.event_type||'').toUpperCase()))continue;
  const point=pickPoint(f.geography,bbox);
  if(!point)continue;
  if(!activeTime(f?.schedule?.intervals?.[0]?.split?.('/')[0]||f.created,null,now))continue;
  seen.add(id);
  out.push(event('drivebc-'+id,isWorks?'obra':'alerta-via',point,
   isWorks?'Obra na via':'Ocorrência na via',f.headline||f.description,'DriveBC Open511',
   f.updated||f.created,null,isWorks?70:76));
 }
 return out.slice(0,100);
}
export function normalizeFintrafficRoadEvents(body,bbox,now=Date.now()){
 const features=Array.isArray(body?.features)?body.features:[];
 const out=[],seen=new Set();
 for(const f of features.slice(0,1200)){
  const p=f?.properties||{};
  const id=clean(p.situationId||f.id,80);if(!id||seen.has(id))continue;
  const isWorks=String(p.situationType||'').toUpperCase()==='ROAD_WORK';
  const point=pickPoint(f.geometry,bbox);
  if(!point)continue;
  const anns=Array.isArray(p.announcements)?p.announcements:[];
  const a=anns.find(x=>String(x.language||'').toUpperCase()==='EN')||anns[0]||{};
  const period=a.timeAndDuration||{};
  if(!activeTime(period.startTime,period.endTime,now))continue;
  seen.add(id);
  out.push(event('fintraffic-'+id,isWorks?'obra':'alerta-via',point,
   isWorks?'Obra na via':'Aviso rodoviário',
   a.comment||a.title||a.location?.description||'', 'Fintraffic Digitraffic',
   p.releaseTime,period.endTime,isWorks?70:74));
 }
 return out.slice(0,100);
}
const PARSERS={'tfl-london':normalizeTflRoadEvents,'drivebc':normalizeDriveBcRoadEvents,
 'fintraffic-works':normalizeFintrafficRoadEvents,'fintraffic-alerts':normalizeFintrafficRoadEvents};
function locationKey(source,bbox){
 if(source.id!=='drivebc')return source.id;
 const snapped=bbox.map((x,i)=>(i<2?Math.floor(x*10)/10:Math.ceil(x*10)/10));
 return source.id+':'+snapped.map(x=>x.toFixed(1)).join(',');
}
function sourceRequest(source,key){
 if(source.id!=='drivebc')return source.endpoint;
 const bbox=key.slice(key.indexOf(':')+1);
 return source.endpoint+'?format=json&status=ACTIVE&limit=120&bbox='+encodeURIComponent(bbox);
}
export function createKeylessRegionalGateway({fetcher=fetch,clock=Date.now}={}){
 // A module-shared gateway handles provider caches across requests; tests can
 // inject their own transport. Independent instances should not share state.
 const cache=new Map(),active=new Map(),attempt=new Map();
 const remember=(key,item)=>{cache.delete(key);cache.set(key,item);while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);};
 async function refresh(source,key){
  try{
   const headers={Accept:'application/json','User-Agent':'VANO-Maps/1.0 (+https://vanomaps.online)'};
   if(source.id.startsWith('fintraffic'))headers['Digitraffic-User']='VANO-Maps/1.0';
   const response=await fetcher(sourceRequest(source,key),{headers,signal:AbortSignal.timeout(2500)});
   if(!response.ok)throw Error('unavailable');
   if(Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('too-large');
   const text=await response.text();
   if(text.length>MAX_BYTES)throw Error('too-large');
   const data=JSON.parse(text);
   if(source.id==='tfl-london'&&!Array.isArray(data))throw Error('bad-data');
   if(source.id==='drivebc'&&!Array.isArray(data?.events))throw Error('bad-data');
   if(source.id.startsWith('fintraffic')&&!Array.isArray(data?.features))throw Error('bad-data');
   remember(key,{events:PARSERS[source.id](data,source.bounds,clock()),at:clock(),ok:true});
  }catch{
   // Cached events are reused for at most 15 minutes, then disappear.
   if(!cache.has(key))remember(key,{events:[],at:clock(),ok:false});
  }finally{active.delete(key);}
 }
 function snapshot(bbox){
  const area=Array.isArray(bbox)?bbox:parseRegionalRoadBBox(bbox);
  if(!area||!parseRegionalRoadBBox(area.join(',')))throw new RangeError('Invalid geographic bounds');
  const now=clock(),sources=[],all=[];
  for(const source of REGION){
   if(!intersection(source.bounds,area))continue;
   const key=locationKey(source,area),saved=cache.get(key),age=saved?now-saved.at:Infinity;
   if(!active.has(key)&&(!saved?.ok||age>=source.ttl)&&now-(attempt.get(key)??-Infinity)>COOLDOWN_MS){
    attempt.set(key,now);
    // Launch asynchronously, never await a remote API on a map request.
    active.set(key,Promise.resolve().then(()=>refresh(source,key)));
   }
   const available=!!saved?.ok&&age<=STALE_MS;
   const status=available?(age<=source.ttl?'fresh':'stale')
     :active.has(key)?'loading':'unavailable';
   sources.push({id:source.id,status,cacheAgeSeconds:Number.isFinite(age)?Math.max(0,Math.round(age/1000)):null});
   if(available)for(const f of saved.events)if(inside(f.coords,area))all.push(f);
  }
  const unique=new Map();
  for(const f of all)if(!unique.has(f.id))unique.set(f.id,f);
  return {features:[...unique.values()].slice(0,100),sources,affectsRouting:false,
   notice:'Eventos regionais informativos; nenhum bloqueio de rua é inferido automaticamente.'};
 }
 return {snapshot};
}
const shared=createKeylessRegionalGateway();
export const keylessRegionalSnapshot=bbox=>shared.snapshot(bbox);
