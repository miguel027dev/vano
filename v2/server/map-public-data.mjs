/** VANO Global Map Features. Overpass is a small-area source, not planet-scale hosting.
 * For large production demand, import OSM extracts into a managed spatial store.
 * OSM data must remain attributed: https://www.openstreetmap.org/copyright
 */
export const OSM_ATTRIBUTION='© OpenStreetMap contributors (ODbL)';
export const MAX_FEATURES=180;
const ENDPOINT='https://overpass-api.de/api/interpreter';
const ttlMs=5*60*1000,maxCache=100,cache=new Map();
let lastUpstream=0,queued=Promise.resolve(),pending=0,quotaWindow=Date.now(),quotaUsed=0;
const finite=Number.isFinite;
export function parseBBox(raw){
 if(typeof raw!=='string'||raw.length>100)return null;
 const b=raw.split(',').map(Number);
 if(b.length!==4||!b.every(finite))return null;
 const [w,s,e,n]=b;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>0.065||n-s>0.055)return null;
 return b.map(v=>+v.toFixed(5));
}
const safeTag=(v,max=100)=>typeof v==='string'?v.replace(/[\u0000-\u001F\u007F<>]/g,'').trim().slice(0,max):'';
export function classifyOsm(t={}){
 const h=t.highway||'',s=String(t.traffic_sign||'').toLowerCase();
 if(h==='speed_camera'||t.enforcement==='maxspeed')return ['radar',100,'Radar fixo'];
 if(h==='traffic_signals')return ['semaforo',74,'Semáforo'];
 if(['bump','hump','table','dynamic_bump'].includes(t.traffic_calming))return ['lombada',76,'Lombada'];
 if(h==='stop'||s.includes('stop'))return ['pare',72,'Parada obrigatória'];
 if(h==='give_way'||s.includes('give_way'))return ['preferencia',67,'Dê a preferência'];
 if(t.railway==='level_crossing')return ['ferrovia',71,'Passagem de nível'];
 if(h==='construction')return ['obra',62,'Obra na via'];
 if(s)return ['placa',40,'Sinalização'];
 if(h==='crossing')return ['travessia',45,'Travessia de pedestres'];
 const amenities={hospital:['hospital',58,'Hospital'],clinic:['saude',45,'Unidade de saúde'],fire_station:['bombeiros',56,'Bombeiros'],police:['policia-base',50,'Base policial'],fuel:['combustivel',37,'Posto de combustível'],parking:['estacionamento',22,'Estacionamento'],charging_station:['eletroposto',34,'Eletroposto']};
 return amenities[t.amenity]||null;
}
export function normalizeOsmElements(elements=[],limit=MAX_FEATURES){
 const items=[],seen=new Set();
 for(const el of Array.isArray(elements)?elements:[]){
  if(!el||!['node','way','relation'].includes(el.type)||!Number.isSafeInteger(el.id))continue;
  const kind=classifyOsm(el.tags||{});if(!kind)continue;
  const lon=Number(el.lon??el.center?.lon),lat=Number(el.lat??el.center?.lat);
  if(!finite(lon)||!finite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)continue;
  const id='osm-'+el.type+'-'+el.id;if(seen.has(id))continue;seen.add(id);
  const tags=el.tags||{};
  items.push({id,type:kind[0],coords:[lon,lat],priority:kind[1],name:safeTag(tags.name)||kind[2],
   description:safeTag(tags.maxspeed?'Limite informado: '+tags.maxspeed:tags.operator||'',90),
   source:'OpenStreetMap',sourceId:el.type+'/'+el.id,verified:false});
 }
 items.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 return items.slice(0,Math.max(1,Math.min(MAX_FEATURES,limit)));
}
export function overpassQuery(bbox){
 if(!Array.isArray(bbox)||bbox.length!==4)throw Error('bbox required');
 const [w,s,e,n]=bbox;
 const area=[s,w,n,e].map(v=>Number(v).toFixed(5)).join(',');
 return '[out:json][timeout:11];('+
 'node["highway"~"^(speed_camera|traffic_signals|stop|give_way|crossing|construction)$"]('+area+');'+
 'node["traffic_calming"~"^(bump|hump|table|dynamic_bump)$"]('+area+');'+
 'node["traffic_sign"]('+area+');'+
 'node["enforcement"="maxspeed"]('+area+');'+
 'node["railway"="level_crossing"]('+area+');'+
 'node["amenity"~"^(hospital|clinic|fire_station|police|fuel|parking|charging_station)$"]('+area+');'+
 ');out body 1500;';
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function sweep(now){
 for(const [key,value] of cache)if(value.expires<now-60000)cache.delete(key);
 while(cache.size>maxCache)cache.delete(cache.keys().next().value);
}
export async function queryPublicMap(bbox,{fetcher=fetch,now=()=>Date.now(),url=ENDPOINT}={}){
 const normalized=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox);
 if(!normalized)throw new RangeError('Área inválida ou maior que o limite permitido.');
 // Cache by a fine-grained grid, and use exactly the cached area for the query.
 const region=normalized.map(x=>+x.toFixed(3));
 const key=region.join(',');
 const old=cache.get(key);
 if(old?.expires>now()&&old.result)return {...old.result,cacheHit:true};
 if(old?.pending)return old.pending;
 if(pending>=3)return {features:[],source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,stale:true,error:'Fonte ocupada'};
 pending++;
 const work=queued.then(async()=>{
   if(Date.now()-quotaWindow>=86400000){quotaWindow=Date.now();quotaUsed=0;}
   if(quotaUsed>=2400)throw Error('Limite diário de consultas públicas atingido');
   quotaUsed++;
   const gap=Date.now()-lastUpstream;if(gap<1500)await pause(1500-gap);
   lastUpstream=Date.now();
   const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({data:overpassQuery(region)}),signal:AbortSignal.timeout(12500)});
   if(!response.ok)throw Error('Overpass '+response.status);
   const data=await response.json();
   if(!Array.isArray(data?.elements))throw Error('Resposta Overpass inválida');
   return {features:normalizeOsmElements(data.elements),source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,
     licenseUrl:'https://www.openstreetmap.org/copyright',fetchedAt:new Date(now()).toISOString(),coverage:'mapeada',stale:false};
 });
 queued=work.catch(()=>{});
 const pendingResult=work.then(result=>{
   cache.set(key,{expires:now()+ttlMs,result});sweep(now());return result;
 }).catch(error=>{
   if(old?.result){cache.set(key,{expires:now()+60000,result:old.result});return {...old.result,stale:true,error:'Fonte temporariamente indisponível'};}
   cache.delete(key);
   return {features:[],source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,stale:true,error:'Fonte temporariamente indisponível'};
 }).finally(()=>{pending--});
 cache.set(key,{pending:pendingResult,expires:now()+ttlMs});
 return pendingResult;
}
export function filterVerifiedReports(reports=[],bbox=[],now=Date.now()){
 const [w,s,e,n]=bbox,age=14*86400000;
 if(![w,s,e,n].every(finite))return [];
 return reports.filter(r=>r?.status==='verificado'&&['transito','obra','acidente','risco','radar'].includes(r.type)
  &&Array.isArray(r.coords)&&r.coords.length>=2&&r.coords[0]>=w&&r.coords[0]<=e&&r.coords[1]>=s&&r.coords[1]<=n
  &&now-new Date(r.createdAt).getTime()<age).slice(-35).map(r=>({
    id:'report-'+r.id,type:'relato-'+r.type,coords:r.coords.map(x=>+Number(x).toFixed(3)),
    name:'Relato verificado',description:safeTag(r.description,100),priority:80,
    source:'Comunidade VANO',createdAt:r.createdAt,verified:true
  }));
}

/** Documented open sources. Only active sources are queried automatically. */
export const PUBLIC_MAP_SOURCES=Object.freeze([
 {id:'osm-overpass',name:'OpenStreetMap / Overpass',coverage:'mundial, incompleta',mode:'live-bounded',
   active:true,license:'ODbL 1.0',url:'https://www.openstreetmap.org/copyright'},
 {id:'overture-places',name:'Overture Maps Places',coverage:'mundial, variável',mode:'ETL de arquivos GeoParquet',
   active:false,license:'CDLA-Permissive / Apache',url:'https://docs.overturemaps.org/guides/places/'},
 {id:'overture-transport',name:'Overture Maps Transportation',coverage:'mundial, variável',mode:'ETL de arquivos GeoParquet',
   active:false,license:'CDLA-Permissive / ODbL conforme origem',url:'https://docs.overturemaps.org/guides/transportation/'}
]);
