/** VANO Global Map Features. Overpass is a small-area source, not planet-scale hosting.
 * For large production demand, import OSM extracts into a managed spatial store.
 * OSM data must remain attributed: https://www.openstreetmap.org/copyright
 */
import {radarDisplayAllowed} from '../src/lib/radarPolicy.js';
export const OSM_ATTRIBUTION='© OpenStreetMap contributors (ODbL)';
export const MAX_FEATURES=180;
const ENDPOINT='https://overpass-api.de/api/interpreter';
const ttlMs=5*60*1000,maxCache=100,cache=new Map();
let lastUpstream=0,queued=Promise.resolve(),pending=0,quotaWindow=Date.now(),quotaUsed=0;
const finite=Number.isFinite;
export function parseBBox(raw,maxLongitudeSpan=.065,maxLatitudeSpan=.055){
 if(typeof raw!=='string'||raw.length>100)return null;
 const b=raw.split(',').map(Number);
 if(b.length!==4||!b.every(finite))return null;
 const [w,s,e,n]=b;
 if(w< -180||e>180||s< -85||n>85||w>=e||s>=n||e-w>maxLongitudeSpan||n-s>maxLatitudeSpan)return null;
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
 const amenities={
  hospital:['hospital',58,'Hospital'],clinic:['saude',45,'Unidade de saúde'],
  fire_station:['bombeiros',56,'Bombeiros'],police:['policia-base',50,'Base policial'],
  fuel:['combustivel',37,'Posto de combustível'],parking:['estacionamento',22,'Estacionamento'],
  bank:['banco',26,'Banco'],charging_station:['estacao-recarga',34,'Estação de recarga'],
  charging_point:['carregador-eletrico',32,'Carregador elétrico'],
  pharmacy:['farmacia',43,'Farmácia'],school:['escola',38,'Escola'],
  restaurant:['restaurante',20,'Restaurante'],fast_food:['fastfood',19,'Fast-food'],
  cafe:['cafeteria',18,'Cafeteria'],post_office:['correios',23,'Correios'],
  car_wash:['lavarapido',20,'Lava-rápido'],bus_station:['terminal-onibus',27,'Terminal de ônibus']
 };
 if(amenities[t.amenity])return amenities[t.amenity];
 const shops={supermarket:['supermercado',27,'Supermercado'],convenience:['mercado',23,'Mercado'],
   mall:['shopping',29,'Shopping'],pet:['petshop',20,'Pet shop']};
 if(shops[t.shop])return shops[t.shop];
 if(t.leisure==='fitness_centre')return ['academia',25,'Academia'];
 if(t.leisure==='park')return ['parque',21,'Parque'];
 if(t.tourism==='hotel')return ['hotel',24,'Hotel'];
 if(t.aeroway==='aerodrome')return ['aeroporto',32,'Aeroporto'];
 if(t.railway==='station')return t.station==='subway'||t.subway==='yes'
  ?['estacao-trem',29,'Estação de trem']:['estacao-ferroviaria',29,'Estação ferroviária'];
 if(t.public_transport==='station'&&t.bus==='yes')return ['terminal-onibus',27,'Terminal de ônibus'];
 return null;
}
export function normalizeOsmElements(elements=[],limit=MAX_FEATURES){
 const items=[],seen=new Set();
 for(const el of Array.isArray(elements)?elements:[]){
  if(!el||!['node','way','relation'].includes(el.type)||!Number.isSafeInteger(el.id))continue;
  const kind=classifyOsm(el.tags||{});if(!kind)continue;
  const lon=Number(el.lon??el.center?.lon),lat=Number(el.lat??el.center?.lat);
  if(!finite(lon)||!finite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)continue;
  if(kind[0]==='radar'&&!radarDisplayAllowed([lon,lat]))continue;
  const id='osm-'+el.type+'-'+el.id;if(seen.has(id))continue;seen.add(id);
  const tags=el.tags||{};
  items.push({id,type:kind[0],coords:[lon,lat],priority:kind[1],
   name:kind[0]==='obra'?'Obra na via':safeTag(tags.name)||kind[2],
   description:kind[0]==='obra'
    ?safeTag((tags.name?tags.name+' · ':'')+'Obra cadastrada no mapa; situação atual não confirmada.',100)
    :safeTag(tags.maxspeed?'Limite informado: '+tags.maxspeed:tags.operator||'',90),
   source:'OpenStreetMap',sourceId:el.type+'/'+el.id,verified:false});
 }
 items.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 // Dense cities may have thousands of signals/stops. Reserve slots for
 // hospitals and other services instead of allowing one tag to occupy all 180.
 const quota={radar:70,semaforo:35,lombada:25,pare:12,preferencia:10,placa:8,travessia:12,
  ferrovia:10,obra:15,hospital:22,saude:14,bombeiros:10,'policia-base':12,
  combustivel:14,estacionamento:9,banco:12,eletroposto:12,
  farmacia:7,escola:8,mercado:8,supermercado:7,shopping:5,
  'estacao-recarga':8,'carregador-eletrico':6,
  restaurante:8,fastfood:7,cafeteria:7,hotel:6,academia:7,parque:8,
  petshop:5,correios:6,lavarapido:5,'terminal-onibus':5,
  'estacao-trem':6,'estacao-ferroviaria':6,aeroporto:5};
 const selected=[],counts=new Map(),cap=Math.max(1,Math.min(MAX_FEATURES,limit));
 for(const item of items){
  if(selected.length>=cap)break;
  if((counts.get(item.type)||0)>=(quota[item.type]||10))continue;
  selected.push(item);counts.set(item.type,(counts.get(item.type)||0)+1);
 }
 return selected;
}
export function overpassQuery(bbox){
 if(!Array.isArray(bbox)||bbox.length!==4)throw Error('bbox required');
 const [w,s,e,n]=bbox,area=[s,w,n,e].map(v=>Number(v).toFixed(5)).join(',');
 // Guarantee that sparse radars are included BEFORE hundreds of stoplights,
 // amenities and ordinary signs fill the bounded query response.
 return '[out:json][timeout:12];'+
 '(node["highway"="speed_camera"]('+area+');node["enforcement"="maxspeed"]('+area+'););out body 150;'+
 '(node["amenity"~"^(hospital|clinic|fire_station|police|fuel|parking|bank|charging_station)$"]('+area+');'+
 'node["traffic_calming"~"^(bump|hump|table|dynamic_bump)$"]('+area+');'+
 'node["highway"~"^(traffic_signals|stop|give_way|crossing|construction)$"]('+area+');'+
 'node["traffic_sign"]('+area+');'+
 'node["railway"="level_crossing"]('+area+'););out body 1250;'+
 // Works are frequently mapped as OSM ways rather than isolated nodes.
 // Query only confirmed highway=construction geometry, bounded to the same viewport.
 '(way["highway"="construction"]('+area+'););out center 80;'+
 '(nwr["shop"~"^(supermarket|convenience|mall|pet)$"]('+area+');'+
 'nwr["amenity"~"^(restaurant|fast_food|cafe|school|pharmacy|post_office|car_wash|bus_station|charging_point)$"]('+area+');'+
 'nwr["leisure"~"^(fitness_centre|park)$"]('+area+');'+
 'nwr["tourism"="hotel"]('+area+');'+
 'nwr["railway"="station"]('+area+');'+
 'nwr["aeroway"="aerodrome"]('+area+');'+
 'nwr["public_transport"="station"]["bus"="yes"]('+area+'););out center 700;';
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function sweep(now){
 for(const [key,value] of cache)if(value.expires<now-60000)cache.delete(key);
 while(cache.size>maxCache)cache.delete(cache.keys().next().value);
}
/** Fallback only when the primary OSM host fails.
 * A custom injected endpoint never falls through to a real network source.
 */
export async function queryPublicMap(bbox,{fetcher=fetch,now=()=>Date.now(),url=ENDPOINT}={}){
 const normalized=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox);
 if(!normalized)throw new RangeError('Área inválida ou maior que o limite permitido.');
 const region=[Math.floor(normalized[0]*1000)/1000,Math.floor(normalized[1]*1000)/1000,
   Math.ceil(normalized[2]*1000)/1000,Math.ceil(normalized[3]*1000)/1000];
 const key=region.map(x=>x.toFixed(3)).join(',');
 const old=cache.get(key);
 if(old?.expires>now()&&old.result)return {...old.result,cacheHit:true};
 if(old?.pending)return old.pending;
 if(pending>=3)return {features:[],source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,stale:true,error:'Fonte ocupada'};
 pending++;
 const endpoints=url===ENDPOINT?[ENDPOINT,'https://overpass.private.coffee/api/interpreter']:[url];
 const work=queued.then(async()=>{
   if(Date.now()-quotaWindow>=86400000){quotaWindow=Date.now();quotaUsed=0;}
   const query=new URLSearchParams({data:overpassQuery(region)});
   let lastError=null;
   for(const [index,endpoint] of endpoints.entries()){
     if(quotaUsed>=2400)throw Error('Limite diário de consultas públicas atingido');
     quotaUsed++;
     const gap=Date.now()-lastUpstream;if(gap<900)await pause(900-gap);
     lastUpstream=Date.now();
     try{
       const response=await fetcher(endpoint,{method:'POST',headers:{
         'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json',
         'User-Agent':'VANO Maps public road-safety map (https://vanomaps.online)'
       },body:query,signal:AbortSignal.timeout(index?8500:7500)});
       if(!response.ok)throw Error('Overpass status '+response.status);
       const data=await response.json();
       if(!Array.isArray(data?.elements))throw Error('Resposta Overpass inválida');
       return {features:normalizeOsmElements(data.elements),source:'OpenStreetMap',
         attribution:OSM_ATTRIBUTION,licenseUrl:'https://www.openstreetmap.org/copyright',
         fetchedAt:new Date(now()).toISOString(),coverage:'mapeada',stale:false};
     }catch(error){
       lastError=error;
       console.warn('VANO public map upstream',index+1,':',error?.message||String(error));
     }
   }
   throw lastError||new Error('Overpass indisponível');
 });
 queued=work.catch(()=>{});
 const pendingResult=work.then(result=>{
   cache.set(key,{expires:now()+ttlMs,result});sweep(now());return result;
 }).catch(error=>{
   if(old?.result){cache.set(key,{expires:now()+60000,result:old.result});return {...old.result,stale:true,error:'Fonte temporariamente indisponível'};}
   cache.delete(key);
   return {features:[],source:'OpenStreetMap',attribution:OSM_ATTRIBUTION,
     stale:true,error:'Fonte temporariamente indisponível'};
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
