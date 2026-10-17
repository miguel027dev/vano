/**
 * Optional Overture regional POI extracts, delivered from bounded GeoJSON.
 * Official source ships GeoParquet, NOT an instant per-bbox API.
 * The offline extractor produces a small file for B2/R2/CDN hosting.
 */
import {parseBBox} from './map-public-data.mjs';
const MAX_BYTES=2_800_000,TTL=12*60*60_000,STALE=48*60*60_000;
const category=new Map(Object.entries({
 restaurant:'restaurante',fast_food_restaurant:'fastfood',fast_food:'fastfood',cafe:'cafeteria',
 coffee_shop:'cafeteria',pharmacy:'farmacia',hospital:'hospital',
 parking:'estacionamento',supermarket:'supermercado',grocery_store:'mercado',
 hotel:'hotel',gym:'academia',fitness_center:'academia',
 pet_store:'petshop',shopping_mall:'shopping',electric_vehicle_charging_station:'estacao-recarga'
}));
const clean=(value,max=100)=>String(value??'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
const inside=(p,b)=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&
 p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
export function normalizeOverturePlaces(geo,bbox){
 const rows=Array.isArray(geo?.features)?geo.features:[];
 const features=[],seen=new Set();
 for(const f of rows.slice(0,20000)){
  if(f?.type!=='Feature'||f.geometry?.type!=='Point'||!inside(f.geometry.coordinates,bbox))continue;
  const props=f.properties||{};
  const name=clean(props.name||props.names?.primary,100),cat=clean(props.category||props.categories?.primary,80).toLowerCase();
  const type=category.get(cat),id=clean(f.id||props.id,90);
  if(!name||!id||!type||seen.has(id))continue;
  seen.add(id);
  features.push({id:'overture-'+id,type,coords:f.geometry.coordinates.slice(0,2),name,
   description:'Cadastro cartográfico público · confirme as informações',
   source:'Overture Maps',poi:true,priority:45,verified:false});
  if(features.length===90)break;
 }
 return features;
}
export function overtureExtractUrl(raw){
 if(!raw)return null;
 try{const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
  const h=u.hostname.toLowerCase();
  if(h==='vanomaps.online'||h.endsWith('.vanomaps.online')||
   h.endsWith('.r2.dev')||h.endsWith('.backblazeb2.com'))return u.toString();
 }catch{/* not configured */}
 return null;
}
export function createOvertureGateway({fetcher=fetch,clock=Date.now}={}){
 let cached=null,pending=null,nextAttempt=0,source='';
 async function update(url){
  try{
   const result=await fetcher(url,{headers:{Accept:'application/geo+json, application/json'},
    signal:AbortSignal.timeout(4500)});
   if(!result.ok||Number(result.headers?.get?.('content-length')||0)>MAX_BYTES)throw Error('unavailable');
   const body=await result.text();
   if(body.length>MAX_BYTES)throw Error('too-large');
   const data=JSON.parse(body);
   if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('bad-extract');
   cached={data,at:clock()};
  }catch{/* Retain last validated extract during outages. */}
  finally{pending=null;}
 }
 function snapshot(bbox,urlRaw=''){
  const b=parseBBox(Array.isArray(bbox)?bbox.join(','):bbox,.12,.12);
  if(!b)throw RangeError('Invalid Overture viewport');
  const url=overtureExtractUrl(urlRaw);
  if(!url)return {enabled:false,status:'disabled',features:[],source:'Overture Maps'};
  if(url!==source){cached=null;pending=null;source=url;nextAttempt=0;}
  const age=cached?clock()-cached.at:Infinity;
  if(!pending&&age>TTL&&clock()>=nextAttempt){
   nextAttempt=clock()+120000;pending=Promise.resolve().then(()=>update(url));
  }
  const ok=!!cached&&age<=STALE;
  return {enabled:true,status:ok?(age<=TTL?'fresh':'stale'):pending?'loading':'unavailable',
   features:ok?normalizeOverturePlaces(cached.data,b):[],
   source:'Overture Maps',sourceAsOf:null,affectsRouting:false};
 }
 return {snapshot};
}
const gateway=createOvertureGateway();
export const overtureSnapshot=(bbox,url)=>gateway.snapshot(bbox,url);
