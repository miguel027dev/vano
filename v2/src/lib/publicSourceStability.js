/** Bounded, nonpersistent cache for real public-map observations.
 * A pan, partial Overpass response, or empty Mapbox tile frame is NOT evidence
 * that a previously mapped feature no longer exists.
 * Live reports and radar observations expire sooner than ordinary mapped POIs.
 */
export const PUBLIC_SOURCE_CACHE_MAX=1200;
const VALID_TYPES=new Set(['node','way','relation']);
const finite=Number.isFinite;
export function isValidMapPoint(item){
 return typeof item?.id==='string'&&item.id.length>0&&item.id.length<=160&&
  typeof item?.type==='string'&&Array.isArray(item.coords)&&item.coords.length===2&&
  item.coords.every(finite)&&Math.abs(item.coords[0])<=180&&Math.abs(item.coords[1])<=85;
}
const ttlFor=item=>item.verified||item.type?.startsWith('relato-')?5*60_000:
 item.type==='radar'?15*60_000:45*60_000;
/** Insertion order is LRU. Retain the first accepted coordinate to stop pin jumps. */
export function rememberPublicFeatures(cache,features=[],now=Date.now(),max=PUBLIC_SOURCE_CACHE_MAX){
 if(!(cache instanceof Map)||!Array.isArray(features))return 0;
 let added=0;
 for(const item of features){
  if(!isValidMapPoint(item))continue;
  const old=cache.get(item.id);
  if(old&&old.expires>now){
   cache.delete(item.id);
   cache.set(item.id,{feature:{...item,coords:old.feature.coords},expires:now+ttlFor(item)});
  }else{
   cache.delete(item.id);
   cache.set(item.id,{feature:item,expires:now+ttlFor(item)});
   added++;
  }
 }
 for(const [key,entry] of cache)if(entry.expires<=now)cache.delete(key);
 const limit=Math.max(1,Math.min(2400,Math.floor(max)||PUBLIC_SOURCE_CACHE_MAX));
 while(cache.size>limit)cache.delete(cache.keys().next().value);
 return added;
}
/** Only return points currently near the viewport. No user position stored. */
export function nearbyPublicFeatures(cache,bounds,now=Date.now(),padding=.015){
 if(!(cache instanceof Map)||!bounds||bounds.length!==4||!bounds.every(finite))return [];
 const [west,south,east,north]=bounds;
 const p=Math.max(0,Math.min(.05,padding)),shown=[];
 for(const [key,entry] of cache){
  if(entry.expires<=now){cache.delete(key);continue;}
  const [lon,lat]=entry.feature.coords;
  if(lon>=west-p&&lon<=east+p&&lat>=south-p&&lat<=north+p)shown.push(entry.feature);
 }
 return shown;
}
