/** Provider adapters for real Brazilian CEP, streets, and named places.
 * No location is invented. ViaCEP supplies street metadata, Mapbox locates it.
 * Search Box forward is used for POIs; Geocoding v6 covers streets/address/postcodes.
 */
import {rankSearchResults,postalDigits} from './search-utils.mjs';
import {pointOK} from './routing.mjs';

export const isBrazilianCep=q=>/^\d{5}-?\d{3}$/.test(String(q||'').trim());
export function cepToSearchAddress(data){
  if(!data||data.erro||!data.localidade||!data.uf)return null;
  const parts=[data.logradouro,data.bairro,data.localidade,data.uf,'Brasil'].filter(Boolean);
  return {query:parts.join(', '),label:[data.logradouro,data.bairro].filter(Boolean).join(' · ')||[data.localidade,data.uf].join(' · ')};
}
export function normalizedPlaces(data,provider='mapbox'){
  return (Array.isArray(data?.features)?data.features:[]).map((f,i)=>{
    const p=f.properties||{},c=f.geometry?.coordinates;
    const fallback=p.coordinates;
    const coords=pointOK(c)?c:
      (Number.isFinite(fallback?.longitude)&&Number.isFinite(fallback?.latitude)
        ?[fallback.longitude,fallback.latitude]:null);
    if(!pointOK(coords))return null;
    return {id:provider+':'+String(p.mapbox_id||p.id||i)+':'+coords.join(','),
      name:String(p.name_preferred||p.name||p.full_address||f.text||'Localização'),
      address:String(p.full_address||p.place_formatted||p.context?.place?.name||''),
      coords,category:p.feature_type||p.type||'local'};
  }).filter(Boolean);
}
const nearbyCategoryIds=Object.freeze({hospital:'hospital',restaurant:'restaurant',commerce:'shopping'});
const radians=value=>value*Math.PI/180;
export function distanceMeters(from,to){
 if(!pointOK(from)||!pointOK(to))return Infinity;
 const dLat=radians(to[1]-from[1]),dLon=radians(to[0]-from[0]);
 const a=Math.sin(dLat/2)**2+Math.cos(radians(from[1]))*Math.cos(radians(to[1]))*Math.sin(dLon/2)**2;
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
/** Category shortcuts deliberately differ from ordinary typed search: a
 * nearby hospital/restaurant/commerce request must never surface the world. */
export async function queryNearbyCategory(category,proximity,{token,language='pt-BR',limit=5,radiusMeters=15000,fetcher=fetch}={}){
 const canonical=nearbyCategoryIds[category];
 if(!canonical||!pointOK(proximity)||!token)return {results:[],providerOk:false};
 const url=new URL('https://api.mapbox.com/search/searchbox/v1/category/'+canonical);
 url.searchParams.set('access_token',token);
 url.searchParams.set('language',(language||'pt-BR').split('-')[0]);
 url.searchParams.set('limit',String(Math.max(1,Math.min(10,limit))));
 url.searchParams.set('proximity',proximity.join(','));
 // Mapbox radius is expressed in degrees; the server performs the exact meter
 // check below before returning anything to the browser.
 url.searchParams.set('radius',String(Math.min(10,Math.max(.001,radiusMeters/111000))));
 try{
  const payload=await fetchJson(url.toString(),fetcher);
  const results=normalizedPlaces(payload,'nearby-'+category).map(item=>({
   ...item,distanceMeters:Math.round(distanceMeters(proximity,item.coords))
  })).filter(item=>Number.isFinite(item.distanceMeters)&&item.distanceMeters<=radiusMeters)
    .sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,Math.max(1,Math.min(10,limit)));
  return {results,providerOk:true};
 }catch{return {results:[],providerOk:false};}
}
const fetchJson=async(url,fetcher)=>{
  const response=await fetcher(url,{signal:AbortSignal.timeout(4800),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('provider-http-'+response.status);
  return response.json();
};
/** Mapbox country and bbox are HARD filters. Never set either automatically.
 * Proximity only changes ranking; searches must remain global.
 */
export function hasExplicitForeignLocation(query){
 const text=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // A qualified location (Paris, France / Genebra, Suíça) should never be
 // pulled toward the user's own country.
 return /[,;]\s*\S/.test(text)||
  /\b(france|franca|suisse|suica|schweiz|switzerland|brasil|brazil|portugal|italia|italy|germany|alemanha|deutschland|espana|espanha|spain|united kingdom|reino unido|united states|estados unidos|belgium|belgica|austria|canada|mexico|argentina|japan|japao|japon|netherlands|paises baixos)\b/.test(text);
}
export function providerUrl(endpoint,text,token,language,proximity){
 const u=new URL(endpoint);
 u.searchParams.set('q',text);
 u.searchParams.set('access_token',token);
 u.searchParams.set('limit','10');
 u.searchParams.set('language',(language||'en-US').split('-')[0]);
 if(Array.isArray(proximity)&&pointOK(proximity))u.searchParams.set('proximity',proximity.join(','));
 // No country= or bbox=: residents of Switzerland can still find France.
 // Geocoding v6 autocomplete=true for partial street or city queries.
 if(endpoint.includes('/geocode/'))u.searchParams.set('autocomplete','true');
 return u.toString();
}
function uniqueRealResults(items){
 const seen=new Set();
 return items.filter(item=>{
  if(!item||!pointOK(item.coords))return false;
  // Same map feature can arrive via both Search Box and Geocoding.
  // Two different places on the same point (shopping center vs shop)
  // are *not* duplicates and stay separate.
  const key=String(item.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().trim()+':'+item.coords.map(v=>v.toFixed(4)).join(',');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}
export async function queryPlaces(query,{token,language='pt-BR',proximity=null,fetcher=fetch}={}){
 const text=String(query||'').trim();
 if(text.length<2||!token)return {results:[],providerOk:false};
 const viaCep=isBrazilianCep(text),precise=viaCep?postalDigits(text):'';
 let canonical=null;
 if(viaCep){
  try{
   canonical=cepToSearchAddress(await fetchJson('https://viacep.com.br/ws/'+precise+'/json/',fetcher));
  }catch{/* Still resolve the CEP with global Mapbox geocoding. */}
 }
 const searchTerm=canonical?.query||text;
 const explicitLocation=hasExplicitForeignLocation(text);
 // CEP lookup remains Brazil-specific; all other queries are WORLDWIDE.
 // These two providers cover different feature types. Always run both
 // for international queries; never stop just because a shop was found.
 const endpoints=viaCep?[
  ['https://api.mapbox.com/search/geocode/v6/forward',null],
  ['https://api.mapbox.com/search/searchbox/v1/forward',null]
 ]:[
  ['https://api.mapbox.com/search/searchbox/v1/forward',explicitLocation?null:proximity],
  ['https://api.mapbox.com/search/geocode/v6/forward',explicitLocation?null:proximity]
 ];
 const outcomes=await Promise.allSettled(endpoints.map(async ([endpoint,bias])=>{
  const payload=await fetchJson(providerUrl(endpoint,searchTerm,token,language,bias),fetcher);
  return normalizedPlaces(payload,endpoint.includes('searchbox')?'place':'address');
 }));
 let providerOk=false,providerErrors=0,found=[];
 outcomes.forEach((r,index)=>{
  if(r.status==='fulfilled'){
   providerOk=true;
   const next=r.value;
   if(viaCep&&canonical&&index===0&&next.length){
    const first=next[0];
    found.push({...first,id:'cep:'+precise,name:'CEP '+precise.slice(0,5)+'-'+precise.slice(5),
     address:canonical.label+' · Posição aproximada do CEP'});
   }
   found.push(...next);
  }else providerErrors++;
 });
 // If proximity-biased providers produced no results, try an un-biased
 // worldwide geocoder once. Never silently limit by Brazil/France/etc.
 if(!found.length&&!viaCep&&Array.isArray(proximity)&&pointOK(proximity)&&!explicitLocation){
  try{
   const payload=await fetchJson(providerUrl('https://api.mapbox.com/search/geocode/v6/forward',
    text,token,language,null),fetcher);
   providerOk=true;
   found.push(...normalizedPlaces(payload,'address'));
  }catch{providerErrors++;}
 }
 return {results:rankSearchResults(uniqueRealResults(found),text,explicitLocation?null:proximity),
  providerOk,providerErrors};
}
