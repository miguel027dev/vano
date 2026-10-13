/** In-memory viewport exploration cache.
 * Mapbox querySourceFeatures only exposes LOADED tiles. Those tiles vary as
 * camera pans/tilts/zooms, so a snapshot cannot be treated as authoritative.
 * Keep encountered real features by stable geographic ID; bound RAM by LRU.
 * No synthetic points, no network requests, no personal location persisted.
 */
export const MAP_FEATURE_CACHE_LIMIT=1600;

export function rememberMapFeatures(cache,observed=[],max=MAP_FEATURE_CACHE_LIMIT,now=Date.now()){
 if(!(cache instanceof Map)||!Array.isArray(observed))return false;
 let changed=false;
 for(const feature of observed){
  if(!feature||typeof feature.id!=='string'||!Array.isArray(feature.coords)
    ||feature.coords.length!==2||!feature.coords.every(Number.isFinite))continue;
  const old=cache.get(feature.id);
  if(!old){
   changed=true;
   cache.set(feature.id,{feature,lastSeen:now});
  }else{
   // Newer vector tile labels may improve the same point's name; coordinates
   // must be immutably anchored by the first observation to avoid marker jumps.
   const next=old.feature;
   const renamed=next.name==='Ponto de interesse no mapa'&&feature.name!==next.name;
   if(renamed){old.feature={...next,name:feature.name};changed=true;}
   old.lastSeen=now;
   cache.delete(feature.id);cache.set(feature.id,old);
  }
 }
 while(cache.size>Math.max(1,max)){
  cache.delete(cache.keys().next().value);
  changed=true;
 }
 return changed;
}

export function cachedMapFeatures(cache){
 return cache instanceof Map?[...cache.values()].map(entry=>entry.feature):[];
}
