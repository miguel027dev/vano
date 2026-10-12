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
const fetchJson=async(url,fetcher)=>{
  const response=await fetcher(url,{signal:AbortSignal.timeout(4800),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('provider-http-'+response.status);
  return response.json();
};
const boxUrl=(endpoint,text,token,language,proximity)=>{
  const u=new URL(endpoint);
  u.searchParams.set('q',text);
  u.searchParams.set('access_token',token);
  u.searchParams.set('limit','8');
  u.searchParams.set('language',(language||'pt-BR').split('-')[0]);
  if(Array.isArray(proximity)&&pointOK(proximity))
    u.searchParams.set('proximity',proximity.join(','));
  if(endpoint.includes('searchbox'))u.searchParams.set('auto_complete','true');
  return u.toString();
};
export async function queryPlaces(query,{token,language='pt-BR',proximity=null,fetcher=fetch}={}){
  const text=String(query||'').trim();
  if(text.length<2||!token)return {results:[],providerOk:false};
  const viaCep=isBrazilianCep(text);
  const precise=viaCep?postalDigits(text):'';
  let canonical=null;
  if(viaCep){
    try{
      const postal=await fetchJson('https://viacep.com.br/ws/'+precise+'/json/',fetcher);
      canonical=cepToSearchAddress(postal);
    }catch{ /* Geocoding can resolve CEP even if ViaCEP is temporarily offline. */ }
  }
  const searchTerm=canonical?.query||text;
  // For exact CEPs geocode an address first. POIs need Search Box first.
  const endpoints=viaCep?
    ['https://api.mapbox.com/search/geocode/v6/forward','https://api.mapbox.com/search/searchbox/v1/forward']:
    ['https://api.mapbox.com/search/searchbox/v1/forward','https://api.mapbox.com/search/geocode/v6/forward'];
  let providerOk=false,providerErrors=0,found=[];
  for(const endpoint of endpoints){
    try{
      const payload=await fetchJson(boxUrl(endpoint,searchTerm,token,language,proximity),fetcher);
      providerOk=true;
      const next=normalizedPlaces(payload,endpoint.includes('searchbox')?'place':'address');
      if(next.length){
        // For CEP never suggest that we found a precise house: it locates the street/area.
        if(viaCep&&canonical&&endpoint.includes('geocode')&&found.length===0){
          const first=next[0];
          found=[{...first,id:'cep:'+precise,name:'CEP '+precise.slice(0,5)+'-'+precise.slice(5),
            address:canonical.label+' · Posição aproximada do CEP'},...next];
        }else found.push(...next);
      }
      // A named place should prefer POI hits; complete CEPs prefer geocoding.
      if(found.length>=5 || (!viaCep&&endpoint.includes('searchbox')&&found.length>=2))break;
    }catch{providerErrors++;}
  }
  return {results:rankSearchResults(found,viaCep&&canonical?'CEP '+precise:text),providerOk,providerErrors};
}
