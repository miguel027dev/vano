/** V2-only transparency for existing Mapbox building extrusions.
 * Never mutate route, terrain, tree, landmark, bridge, label or GPS layers.
 * Original paint definitions are captured and restored on exit. */
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number.isFinite(v)?v:lo));
export function isV2BuildingLayer(layer={}){
  if(layer.type!=='fill-extrusion')return false;
  const id=String(layer.id||'').toLowerCase();
  const sourceLayer=String(layer['source-layer']||'').toLowerCase();
  // Explicit building geometries only, not bridges, roads or 3D vegetation.
  if(/tree|vegetation|bridge|road|terrain|tunnel|canopy|trunk/.test(id))return false;
  return sourceLayer==='building'||/building|buildings/.test(id);
}
export function targetV2BuildingOpacity(density=0){
  // Open areas retain some visible city form; dense corridors become see-through.
  return Math.round((.69-.22*clamp(density,0,1))*100)/100;
}
export function syncV2BuildingVisibility(map,{enabled=false,density=0}={}){
  if(!map||typeof map.getStyle!=='function'||typeof map.setPaintProperty!=='function')return 0;
  const cache=map._vanoV2OriginalBuildings;
  if(!enabled){
    if(!(cache instanceof Map))return 0;
    let restored=0;
    for(const [id,original] of cache.entries()){
      if(!map.getLayer?.(id))continue;
      try{
        map.setPaintProperty(id,'fill-extrusion-opacity',original===undefined?null:original);
        restored++;
      }catch{/* A provider style may be reloading. */}
    }
    delete map._vanoV2OriginalBuildings;
    delete map._vanoV2BuildingOpacity;
    return restored;
  }
  const layers=map.getStyle()?.layers;
  if(!Array.isArray(layers))return 0;
  const original=cache instanceof Map?cache:new Map();
  map._vanoV2OriginalBuildings=original;
  const desired=targetV2BuildingOpacity(density);
  if(map._vanoV2BuildingOpacity===desired&&original.size>0&&
     layers.filter(isV2BuildingLayer).every(x=>original.has(x.id)))return 0;
  let updated=0;
  for(const layer of layers){
    if(!isV2BuildingLayer(layer)||!map.getLayer?.(layer.id))continue;
    if(!original.has(layer.id))
      original.set(layer.id,map.getPaintProperty?.(layer.id,'fill-extrusion-opacity'));
    const originalValue=original.get(layer.id);
    const opacity=typeof originalValue==='number'?Math.min(desired,originalValue):desired;
    try{
      const current=map.getPaintProperty?.(layer.id,'fill-extrusion-opacity');
      if(current===opacity)continue;
      map.setPaintProperty(layer.id,'fill-extrusion-opacity',opacity);
      updated++;
    }catch{/* 3D is optional. Unsupported layers must not break the map. */}
  }
  map._vanoV2BuildingOpacity=desired;
  return updated;
}
/** Called immediately BEFORE replacing the Mapbox style. Old layers no longer
 * exist afterward, so only discard the cache; never reapply old expressions. */
export function discardV2BuildingVisibility(map){
  if(!map)return;
  delete map._vanoV2OriginalBuildings;
  delete map._vanoV2BuildingOpacity;
}
