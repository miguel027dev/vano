/** TomTom Orbis v2 incident adapter. Secret API key lives server-side only.
 * Map-only advisory context; never used to block or rerank VANO routes.
 * API: https://api.tomtom.com/maps/orbis/traffic/incidents/details
 */
export const TOMTOM_ENV_NAME='VANO_TOMTOM_API_KEY';
const ENDPOINT='https://api.tomtom.com/maps/orbis/traffic/incidents/details';
const ATTRIBUTES='incidents(type,geometry(type,coordinates),properties(id,iconCategory,events(description),startTime,endTime,from,to,timeValidity,lastReportTime))';
const CACHE_TTL=3*60_000,STALE_WINDOW=8*60_000,RETRY_MS=45_000;
const MAX_CACHE=36,MAX_BYTES=1_500_000,MAX_DAY=500,MAX_INFLIGHT=2;
const DELTA=.04,HALF=.055;
const allowed=new Map([
 ['roadworks',['obra','Obra na via',72]],
 ['roadclosed',['alerta-via','Via interditada',83]],
 ['laneclosed',['alerta-via','Faixa interditada',78]],
 ['accident',['alerta-via','Acidente na via',81]],
 ['brokendownvehicle',['alerta-via','Veículo parado na via',70]],
 ['dangerousconditions',['alerta-via','Condições perigosas na via',75]]
]);
const sanitize=(x,n=180)=>typeof x==='string'?x.replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,n):'';
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const inside=(p,b)=>valid(p)&&p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
export function parseTomTomBBox(raw){
 if(typeof raw!=='string'||raw.length>100)return null;
 const b=raw.split(',').map(Number);
 if(b.length!==4||!b.every(Number.isFinite))return null;
 const [w,s,e,n]=b;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>.15||n-s>.15)return null;
 return b.map(v=>+v.toFixed(5));
}
function pointInBox(geometry,bbox){
 if(geometry?.type==='Point')return inside(geometry.coordinates,bbox)?geometry.coordinates.slice(0,2):null;
 if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates))return null;
 const center=[(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2];
 let selected=null,distance=Infinity;
 for(const p of geometry.coordinates.slice(0,1000)){
  if(!inside(p,bbox))continue;
  const d=(p[0]-center[0])**2+(p[1]-center[1])**2;
  if(d<distance){distance=d;selected=p.slice(0,2);}
 }
 return selected;
}
export function normalizeTomTomIncidents(body,bbox,now=Date.now()){
 const events=[],seen=new Set();
 for(const feature of (Array.isArray(body?.incidents)?body.incidents:[]).slice(0,600)){
  if(feature?.type!=='Feature')continue;
  const p=feature.properties||{},category=String(p.iconCategory??'').replace(/[-_\s]/g,'').toLowerCase();
  const mapped=allowed.get(category);
  if(!mapped||String(p.timeValidity||'present').toLowerCase()==='future')continue;
  const start=Date.parse(String(p.startTime||'')),end=Date.parse(String(p.endTime||''));
  if(Number.isFinite(start)&&start>now+60_000)continue;
  if(Number.isFinite(end)&&end<now)continue;
  const coords=pointInBox(feature.geometry,bbox),rawId=String(p.id||'');
  if(!coords||!rawId||rawId.length>96||!/^[-a-zA-Z0-9_:.]+$/.test(rawId)||seen.has(rawId))continue;
  seen.add(rawId);
  const summary=Array.isArray(p.events)?p.events.map(x=>sanitize(x?.description,110)).filter(Boolean).slice(0,2).join(' · '):'';
  const between=[sanitize(p.from,60),sanitize(p.to,60)].filter(Boolean).join(' → ');
  events.push({
   id:'tomtom-'+rawId,type:mapped[0],coords,priority:mapped[2],
   name:mapped[1],description:sanitize([summary,between].filter(Boolean).join(' · '),190),
   source:'TomTom Traffic',regional:true,verified:false,routingVerified:false,
   observedAt:typeof p.lastReportTime==='string'?p.lastReportTime:null,
   endsAt:typeof p.endTime==='string'?p.endTime:null
  });
  if(events.length>=120)break;
 }
 return events;
}
function tileFor(bbox){
 const cx=(bbox[0]+bbox[2])/2,cy=(bbox[1]+bbox[3])/2;
 const x=Math.floor(cx/DELTA)*DELTA+DELTA/2;
 const y=Math.floor(cy/DELTA)*DELTA+DELTA/2;
 return {key:x.toFixed(2)+','+y.toFixed(2),bounds:[
  Math.max(-180,x-HALF),Math.max(-85,y-HALF),
  Math.min(180,x+HALF),Math.min(85,y+HALF)
 ].map(v=>+v.toFixed(5))};
}
export function createTomTomGateway({fetcher=fetch,clock=Date.now}={}){
 const cache=new Map(),pending=new Map(),retry=new Map();
 let day=-1,count=0,holdUntil=0;
 const save=(key,value)=>{
  cache.delete(key);cache.set(key,value);
  while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
 };
 async function refresh(key,bounds,secret){
  try{
   const url=new URL(ENDPOINT);
   url.searchParams.set('apiVersion','2');
   url.searchParams.set('bbox',bounds.join(','));
   url.searchParams.set('timeValidity','present');
   url.searchParams.set('iconCategories','roadWorks,roadClosed,laneClosed,accident,brokenDownVehicle,dangerousConditions');
   const res=await fetcher(url.toString(),{headers:{
    'TomTom-Api-Key':secret,
    'Attributes':ATTRIBUTES,
    'Accept':'application/json',
    'Accept-Language':'pt-PT'
   },signal:AbortSignal.timeout(2500)});
   if(!res.ok){if([401,403,429].includes(res.status))holdUntil=clock()+10*60_000;throw Error('unavailable');}
   if(Number(res.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('too-large');
   const raw=await res.text();
   if(raw.length>MAX_BYTES)throw Error('too-large');
   const body=JSON.parse(raw);
   if(!Array.isArray(body?.incidents))throw Error('invalid-json');
   save(key,{events:normalizeTomTomIncidents(body,bounds,clock()),at:clock(),ok:true});
  }catch{
   if(!cache.has(key))save(key,{events:[],at:clock(),ok:false});
  }finally{pending.delete(key);}
 }
 function snapshot(rawBBox,apiKey=''){
  const b=Array.isArray(rawBBox)?parseTomTomBBox(rawBBox.join(',')):parseTomTomBBox(rawBBox);
  if(!b)throw new RangeError('Bounding box inválida');
  const secret=String(apiKey||'').trim();
  if(!secret||secret.startsWith('REPLACE_'))return {enabled:false,features:[],source:'TomTom Traffic',status:'unconfigured',affectsRouting:false};
  const now=clock(),currentDay=Math.floor(now/86400000);
  if(currentDay!==day){day=currentDay;count=0;}
  const tile=tileFor(b),saved=cache.get(tile.key),age=saved?now-saved.at:Infinity;
  if(age>=CACHE_TTL&&!pending.has(tile.key)&&pending.size<MAX_INFLIGHT&&
   count<MAX_DAY&&now>=holdUntil&&now>=(retry.get(tile.key)||0)){
   retry.set(tile.key,now+RETRY_MS);
   count++;
   pending.set(tile.key,Promise.resolve().then(()=>refresh(tile.key,tile.bounds,secret)));
  }
  const fresh=!!saved?.ok&&age<=STALE_WINDOW;
  const data=fresh?saved.events.filter(x=>inside(x.coords,b)&&(!x.endsAt||!Number.isFinite(Date.parse(x.endsAt))||Date.parse(x.endsAt)>=now)):[];
  return {enabled:true,features:data,source:'TomTom Traffic',
   status:fresh?(age<CACHE_TTL?'fresh':'stale'):pending.has(tile.key)?'loading':'unavailable',
   affectsRouting:false,attribution:'© TomTom',cacheAgeSeconds:Number.isFinite(age)?Math.round(age/1000):null};
 }
 return {snapshot};
}
const gateway=createTomTomGateway();
export const tomtomSnapshot=(bbox,apiKey)=>gateway.snapshot(bbox,apiKey);
