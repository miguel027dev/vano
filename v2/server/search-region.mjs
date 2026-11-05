import {pointOK} from './routing.mjs';
/** Empty/missing coordinates are not zero. The real [0,0] point is valid. */
export function searchProximity(params){
 const raw=[params.get('lng'),params.get('lat')];
 if(raw.some(value=>value===null||!value.trim()))return null;
 const point=raw.map(Number);
 return pointOK(point)?point:null;
}
const distanceKm=(a,b)=>{
 const r=Math.PI/180,lat=(b[1]-a[1])*r,lon=(b[0]-a[0])*r;
 const h=Math.sin(lat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(lon/2)**2;
 return 12742*Math.asin(Math.sqrt(Math.min(1,h)));
};
/** Nearby suggestions require an explicitly supplied area. Unlike typed search,
 * this list must not suggest an unrelated country when a provider is sparse. */
export function createNearbySuggestions(search,{clock=Date.now}={}){
 const cache=new Map();
 return async(proximity,language='pt-BR')=>{
  if(!pointOK(proximity))return [];
  const key=language+'|'+proximity.map(value=>value.toFixed(2)).join(',');
  const old=cache.get(key);
  if(old&&clock()-old.at<45000)return old.items;
  const term=language.startsWith('en')?'cafe':language.startsWith('de')?'Café':'café';
  const items=(await search(term,language,proximity)).filter(item=>pointOK(item.coords)&&distanceKm(proximity,item.coords)<=50).slice(0,5);
  if(cache.size>=32)cache.delete(cache.keys().next().value);
  cache.set(key,{items,at:clock()});
  return items;
 };
}
