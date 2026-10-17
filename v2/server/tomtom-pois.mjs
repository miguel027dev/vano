/** TomTom Search API: short-lived global POI augmentation for the VANO map.
 * Secret is added to a fixed TomTom URL server-side; never returned to clients.
 * Classification comes from provider taxonomy, NEVER guesses from place name.
 */
const HOST='https://api.tomtom.com';
const MAX_BYTES=850000,MAX_CACHE=50,TTL=25*60_000,RETRY=90_000;
const clean=(s,n=140)=>typeof s==='string'?s.replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,n):'';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const inside=(p,b)=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const CATEGORY_RULES=[
 [/hospital|emergency room|hospital geral|hospital público/,['hospital',58]],
 [/pharmacy|drugstore|farm[aá]cia/,['farmacia',43]],
 [/clinic|doctor|medical center|medical centre|health centre/,['saude',45]],
 [/fire station|fire brigade|bombeiros/,['bombeiros',56]],
 [/police station|police department|delegacia/,['policia-base',50]],
 [/fuel station|petrol station|gas station|posto de combust[ií]vel/,['combustivel',37]],
 [/ev charging|electric vehicle charging|charging station|charge point/,['estacao-recarga',34]],
 [/parking|car park|parking garage|estacionamento/,['estacionamento',30]],
 [/supermarket|supermercado/,['supermercado',27]],
 [/grocery|convenience store|mini market|mercado/,['mercado',23]],
 [/shopping mall|shopping centre|shopping center|shopping complex/,['shopping',29]],
 [/fast food|fast-food|takeaway/,['fastfood',19]],
 [/restaurant|restaurante/,['restaurante',20]],
 [/coffee shop|caf[eé]|cafeteria/,['cafeteria',18]],
 [/hotel|lodging|accommodation/,['hotel',24]],
 [/school|primary education|secondary education|escola/,['escola',38]],
 [/gym|fitness center|fitness centre|academia/,['academia',25]],
 [/public park|city park|recreation park/,['parque',21]],
 [/pet shop|pet store|pet supplies/,['petshop',20]],
 [/post office|correios/,['correios',23]],
 [/car wash|lava.r[aá]pido/,['lavarapido',20]],
 [/bus terminal|bus station/,['terminal-onibus',27]],
 [/railway station|train station|metro station|subway station/,['estacao-trem',29]],
 [/airport|aeroporto/,['aeroporto',32]],
 [/bank|atm|banco/,['banco',26]]
];
function categoryOf(poi){
 const names=[
  ...(Array.isArray(poi?.categories)?poi.categories:[]),
  ...(Array.isArray(poi?.classifications)?poi.classifications.flatMap(c=>[c?.code,...(c?.names||[]).map(n=>n?.name)]):[])
 ].map(x=>clean(x,100).toLowerCase()).filter(Boolean);
 // Classification must itself name a supported category. Not the venue name.
 const text=names.join(' | ');
 for(const [pattern,result]of CATEGORY_RULES)if(pattern.test(text))return result;
 if((poi?.categorySet||[]).some(c=>Number(c.id)===7315))return ['restaurante',20];
 return null;
}
export function normalizeTomTomPois(body,bbox,{search=false}={}){
 const rows=Array.isArray(body?.results)?body.results:[];
 const output=[],seen=new Set();
 for(const row of rows.slice(0,120)){
  if(row?.type!=='POI')continue;
  const lat=Number(row.position?.lat),lon=Number(row.position?.lon),coords=[lon,lat];
  if(!valid(coords)||bbox&&!inside(coords,bbox))continue;
  const classed=categoryOf(row.poi);
  if(!search&&!classed)continue;
  const name=clean(row.poi?.name);if(!name)continue;
  const id=clean(row.id,90);if(!id||seen.has(id))continue;
  seen.add(id);
  const address=clean(row.address?.freeformAddress||[row.address?.streetName,row.address?.municipality].filter(Boolean).join(', '),160);
  output.push({id:'tomtom-poi-'+id,type:classed?.[0]||'local',coords,name,
   address,priority:classed?.[1]||20,category:classed?.[0]||'local',
   source:'TomTom Search',regional:true,poi:true,verified:false});
  if(output.length>70)break;
 }
 return output;
}
async function boundedFetch(url,secret,fetcher){
 // The legacy TomTom Search v2 API requires the key query parameter.
 url.searchParams.set('key',secret);
 const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(2400),
  headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('search-unavailable');
 if(Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('response-too-large');
 const raw=await response.text();if(raw.length>MAX_BYTES)throw Error('response-too-large');
 return JSON.parse(raw);
}
export async function searchTomTomPlaces(term,{key='',proximity=null,fetcher=fetch}={}){
 const query=clean(term,110),secret=String(key||'').trim();
 if(query.length<2||!secret)return [];
 const u=new URL(HOST+'/search/2/poiSearch/'+encodeURIComponent(query)+'.json');
 u.searchParams.set('limit','8');
 u.searchParams.set('language','pt-BR');
 if(valid(proximity)){
  u.searchParams.set('lat',String(proximity[1]));
  u.searchParams.set('lon',String(proximity[0]));
 }
 try{
  const data=await boundedFetch(u,secret,fetcher);
  return normalizeTomTomPois(data,null,{search:true}).map(p=>({
   id:p.id,name:p.name,address:p.address,coords:p.coords,category:p.category
  }));
 }catch{return [];}
}
export function createTomTomPoiGateway({fetcher=fetch,clock=Date.now}={}){
 const cache=new Map(),pending=new Set(),retry=new Map();
 let day=-1,used=0;
 function tile(bbox){
  const x=(bbox[0]+bbox[2])/2,y=(bbox[1]+bbox[3])/2;
  const lon=Math.round(x/.022)*.022,lat=Math.round(y/.022)*.022;
  return {id:lon.toFixed(4)+':'+lat.toFixed(4),lon,lat};
 }
 async function refresh(t,secret){
  try{
   const u=new URL(HOST+'/search/2/nearbySearch/.json');
   u.searchParams.set('lat',String(t.lat));u.searchParams.set('lon',String(t.lon));
   u.searchParams.set('radius','2300');u.searchParams.set('limit','75');
   const body=await boundedFetch(u,secret,fetcher);
   if(!Array.isArray(body?.results))throw Error('bad-json');
   const points=normalizeTomTomPois(body,null);
   cache.delete(t.id);cache.set(t.id,{points,at:clock()});
   while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  }catch{}finally{pending.delete(t.id);}
 }
 function snapshot(bbox,key=''){
  if(!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
   bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[2]-bbox[0]>.15||bbox[3]-bbox[1]>.15)throw new RangeError('Invalid bbox');
  const secret=String(key||'').trim();
  if(!secret)return {enabled:false,features:[],status:'unconfigured'};
  const now=clock(),today=Math.floor(now/86400000);
  if(day!==today){day=today;used=0;}
  const t=tile(bbox),item=cache.get(t.id),age=item?now-item.at:Infinity;
  if(age>TTL&&!pending.has(t.id)&&pending.size<1&&used<220&&now>=(retry.get(t.id)||0)){
   used++;retry.set(t.id,now+RETRY);
   pending.add(t.id);void Promise.resolve().then(()=>refresh(t,secret));
  }
  return {enabled:true,status:item&&age<45*60_000?'fresh':pending.has(t.id)?'loading':'unavailable',
   features:item&&age<45*60_000?item.points.filter(p=>inside(p.coords,bbox)).slice(0,70):[],
   attribution:'© TomTom',affectsRouting:false};
 }
 return {snapshot};
}
const gateway=createTomTomPoiGateway();
export const tomtomPoiSnapshot=(bbox,key)=>gateway.snapshot(bbox,key);
