/**
 * Optional official road-event adapters. Provider-specific DATEX II/XML feeds
 * must be validated and transformed into GeoJSON upstream before enabling.
 * This intentionally does not guess event positions, lane status or traffic.
 * Never alters /api/route; data are advisory only.
 */
import {parseRegionalRoadBBox} from './regional-road-events.mjs';
const SPECS=Object.freeze([
 {id:'us-wzdx',label:'US DOT WZDx',region:'United States',bounds:[-125,24,-66,50],priority:95,
  urlEnv:'VANO_US_WZDX_GEOJSON_URL',keyEnv:'VANO_US_WZDX_API_KEY',keyHeader:'X-API-Key',format:'WZDx / GeoJSON'},
 {id:'uk-national',label:'National Highways',region:'England, UK',bounds:[-6,49.8,2,56],priority:95,
  urlEnv:'VANO_UK_ROADS_GEOJSON_URL',keyEnv:'VANO_UK_ROADS_API_KEY',keyHeader:'Ocp-Apim-Subscription-Key',format:'DATEX II / normalized GeoJSON'},
 {id:'es-dgt',label:'DGT DATEX II',region:'Spain (excluding separately managed regions)',bounds:[-10,35,4.6,44],priority:95,
  urlEnv:'VANO_ES_DGT_GEOJSON_URL',keyEnv:'VANO_ES_DGT_API_KEY',keyHeader:'X-API-Key',format:'DATEX II / normalized GeoJSON'},
 {id:'fr-bison',label:'Bison Futé',region:'France',bounds:[-5.4,41.2,9.7,51.3],priority:95,
  urlEnv:'VANO_FR_BISON_GEOJSON_URL',keyEnv:'VANO_FR_BISON_API_KEY',keyHeader:'X-API-Key',format:'DATEX II / normalized GeoJSON'},
 {id:'nl-ndw',label:'NDW',region:'Netherlands',bounds:[3.3,50.7,7.3,53.7],priority:95,
  urlEnv:'VANO_NL_NDW_GEOJSON_URL',keyEnv:'VANO_NL_NDW_API_KEY',keyHeader:'X-API-Key',format:'DATEX II / normalized GeoJSON'},
 {id:'no-vegvesen',label:'Statens vegvesen',region:'Norway',bounds:[4,57,32,72],priority:95,
  urlEnv:'VANO_NO_ROADS_GEOJSON_URL',keyEnv:'VANO_NO_ROADS_API_KEY',keyHeader:'X-API-Key',format:'Traffic messages / normalized GeoJSON'},
 {id:'au-nsw',label:'Transport for NSW',region:'New South Wales, Australia',bounds:[140,-38,154,-28],priority:95,
  urlEnv:'VANO_AU_NSW_GEOJSON_URL',keyEnv:'VANO_AU_NSW_API_KEY',keyHeader:'Authorization',format:'Traffic incidents / GeoJSON'},
 {id:'au-vic',label:'Transport Victoria',region:'Victoria, Australia',bounds:[140.8,-39.5,150.1,-33.8],priority:100,
  urlEnv:'VANO_AU_VIC_GEOJSON_URL',keyEnv:'VANO_AU_VIC_API_KEY',keyHeader:'KeyID',format:'Road disruptions / GeoJSON'},
 {id:'nz-nzta',label:'NZ Transport Agency',region:'New Zealand',bounds:[165,-48,180,-33],priority:95,
  urlEnv:'VANO_NZ_NZTA_GEOJSON_URL',keyEnv:'VANO_NZ_NZTA_API_KEY',keyHeader:'X-API-Key',format:'Road incidents / normalized GeoJSON'}
]);
const TTL=4*60_000,STALE=15*60_000,COOLDOWN=45_000,MAX_BYTES=2_200_000;
const intersect=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const inside=(p,b)=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)
 &&p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const text=(s,n=160)=>String(s??'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,n);
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const hostAllowed=(id,hostname)=>{
 const host=hostname.toLowerCase();
 if(id==='us-wzdx')return /(?:^|\.)(?:gov|us)$/.test(host)||host.endsWith('.511.org');
 const rules={
  'uk-national':/(?:^|\.)(?:nationalhighways\.co\.uk|trafficengland\.com)$/,
  'es-dgt':/(?:^|\.)dgt\.es$/,
  'fr-bison':/(?:^|\.)bison-fute\.gouv\.fr$/,
  'nl-ndw':/(?:^|\.)ndw\.nu$/,
  'no-vegvesen':/(?:^|\.)vegvesen\.no$/,
  'au-nsw':/(?:^|\.)(?:nsw\.gov\.au|transport\.nsw\.gov\.au)$/,
  'au-vic':/(?:^|\.)(?:vic\.gov\.au|transport\.vic\.gov\.au)$/,
  'nz-nzta':/(?:^|\.)(?:nzta\.govt\.nz|nzta\.govt\.nz)$/
 };
 return Boolean(rules[id]?.test(host));
};
export function officialRoadFeedConfig(env=process.env){
 return SPECS.map(spec=>{
  const raw=String(env[spec.urlEnv]||'').trim();
  let url=null;
  try{if(raw){const u=new URL(raw);
   if(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&hostAllowed(spec.id,u.hostname))url=u.toString();
  }}catch{/* unavailable until configured */}
  return {...spec,url,key:String(env[spec.keyEnv]||'').trim(),
   enabled:!!url};
 });
}
export function officialRoadSources(env=process.env){
 return officialRoadFeedConfig(env).map(({id,label,region,bounds,urlEnv,keyEnv,keyHeader,format,enabled,priority})=>({
  id,label,region,bounds,env:urlEnv,keyEnv,keyHeader,format,enabled,priority,
  affectsRouting:false,
  note:'Requer GeoJSON oficial validado; DATEX II/XML precisa de conversão prévia.'}));
}
function pointFromGeometry(g,bbox){
 if(!g||!['Point','MultiPoint','LineString','MultiLineString'].includes(g.type))return null;
 const stack=[g.coordinates];let inspected=0;
 while(stack.length&&inspected++<300){
  const x=stack.pop();
  if(inside(x,bbox))return x.slice(0,2);
  if(Array.isArray(x)&&Array.isArray(x[0]))
   for(let i=Math.min(x.length,100)-1;i>=0;i--)stack.push(x[i]);
 }
 return null;
}
export function normalizeOfficialRoadEvents(body,spec,bbox,now=Date.now()){
 const rows=Array.isArray(body?.features)?body.features:[];
 const out=[];
 for(const item of rows.slice(0,1500)){
  if(item?.type!=='Feature')continue;
  const p=item.properties||{};
  const status=text(p.road_event_status||p.status||p.statusCode,35).toLowerCase();
  if(/cancel|suspend|inactive|completed|expired|closed_record/.test(status))continue;
  const start=timestamp(p.start_date||p.start_time||p.startDate||p.startDateTime||p.validFrom);
  const end=timestamp(p.end_date||p.end_time||p.endDate||p.endDateTime||p.validTo);
  if(start&&Date.parse(start)>now+120000)continue;
  if(end&&Date.parse(end)<now)continue;
  const coords=pointFromGeometry(item.geometry,bbox);if(!coords)continue;
  const kind=text(p.event_type||p.type||p.category||p.subtype||'',70).toLowerCase();
  const title=text(p.description||p.title||p.headline||p.road_names?.join?.(', ')||p.roadName||'',130);
  if(spec.id.startsWith('au-')&&/wildfire|bushfire|fire|incêndio/.test(kind+' '+title.toLowerCase()))continue;
  const isWorks=/work|construction|maintenance|roadwork|obras?/.test(kind);
  const id=text(item.id||p.id||p.road_event_id||p.eventId||'',90);
  if(!id)continue;
  out.push({id:'official-'+spec.id+'-'+id,type:isWorks?'obra':'alerta-via',
   coords,source:spec.label,name:isWorks?'Obra na via':'Ocorrência rodoviária',
   description:title||'Aviso oficial · confirme as condições locais',
   observedAt:timestamp(p.updated_at||p.updated||p.lastUpdated),
   endsAt:end,priority:isWorks?70:78,verified:false,routingVerified:false,
   regional:true,providerPriority:spec.priority,providerId:spec.id});
  if(out.length===100)break;
 }
 return out;
}
export function createOfficialRoadGateway({fetcher=fetch,clock=Date.now,env=process.env}={}){
 const config=officialRoadFeedConfig(env),cache=new Map(),pending=new Map(),lastAttempt=new Map();
 const remember=(id,value)=>{cache.delete(id);cache.set(id,value);
  while(cache.size>28)cache.delete(cache.keys().next().value);};
 async function load(spec){
  try{
   const headers={Accept:'application/geo+json, application/json','User-Agent':'VANO Maps (https://vanomaps.online)'};
   if(spec.key)headers[spec.keyHeader]=spec.key;
   const response=await fetcher(spec.url,{headers,signal:AbortSignal.timeout(2800)});
   if(!response.ok||Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('bad-response');
   const content=await response.text();
   if(content.length>MAX_BYTES)throw Error('too-large');
   const json=JSON.parse(content);
   if(json?.type!=='FeatureCollection'||!Array.isArray(json.features))throw Error('not-geojson');
   remember(spec.id,{data:json,at:clock(),ok:true});
  }catch{
   if(!cache.has(spec.id))remember(spec.id,{data:null,at:clock(),ok:false});
  }finally{pending.delete(spec.id);}
 }
 function snapshot(bbox){
  const area=Array.isArray(bbox)?bbox:parseRegionalRoadBBox(bbox);
  if(!area||!parseRegionalRoadBBox(area.join(',')))throw RangeError('Invalid official feed bbox');
  const now=clock(),items=[],sources=[];
  for(const spec of config){
   if(!intersect(spec.bounds,area))continue;
   if(!spec.enabled){sources.push({id:spec.id,status:'not-configured'});continue;}
   const saved=cache.get(spec.id),age=saved?now-saved.at:Infinity;
   if(!pending.has(spec.id)&&(!saved?.ok||age>TTL)
     &&now-(lastAttempt.get(spec.id)??-Infinity)>COOLDOWN){
    lastAttempt.set(spec.id,now);
    pending.set(spec.id,Promise.resolve().then(()=>load(spec)));
   }
   const ok=saved?.ok&&age<STALE;
   sources.push({id:spec.id,status:ok?(age<=TTL?'fresh':'stale')
    :pending.has(spec.id)?'loading':'unavailable'});
   if(ok)items.push(...normalizeOfficialRoadEvents(saved.data,spec,area,now));
  }
  // Priority wins near the same incident; preserve separate roadwork/incident types.
  items.sort((a,b)=>b.providerPriority-a.providerPriority);
  const out=[],cells=new Set();
  for(const item of items){
   const cell=item.type+':'+Math.round(item.coords[0]*1500)+':'+Math.round(item.coords[1]*1500);
   if(cells.has(cell))continue;
   cells.add(cell);out.push(item);
   if(out.length===100)break;
  }
  return {features:out,sources,affectsRouting:false,
   notice:'Avisos oficiais informativos; não alteram automaticamente rotas ou bloqueios.'};
 }
 return {snapshot};
}
let singleton,signature;
export function officialRoadSnapshot(bbox,env=process.env){
 // A single process-scoped pool, rebuilt if source URLs/keys change.
 const next=JSON.stringify(SPECS.map(s=>[env[s.urlEnv]||'',env[s.keyEnv]||'']));
 if(!singleton||signature!==next){singleton=createOfficialRoadGateway({env});signature=next;}
 return singleton.snapshot(bbox);
}
