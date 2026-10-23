/** VANO selected-route legibility for /mapa and /v2. Paint-only: NEVER animate the
 * camera, replace route geometry, or modify route traffic evidence.
 * Widths are CSS pixels; Mapbox interpolates them on the GPU by zoom.
 */
export const V2_ROUTE_CORE_STOPS=Object.freeze([
  [14,5],[15,6],[16,8],[17,10],[18,12],[19,13]
]);
export const V2_ROUTE_CASING_STOPS=Object.freeze([
  [14,9],[15,10],[16,12],[17,14],[18,16],[19,17]
]);
export const V2_ROUTE_CASING_COLOR='#192837';
/** The public map opts into exactly the existing V2 route stroke.
 * Keep this switch independent of private V2 permissions, traffic providers
 * and camera/simulation flags. */
export function shouldHighlightSelectedRoute(data){
  return Boolean(data?.v2Experience||data?.readableRouteStroke);
}

const asMapboxWidth=stops=>['interpolate',['linear'],['zoom'],
  ...stops.flatMap(([zoom,width])=>[zoom,width])];

export function v2RouteStrokePaint(enabled=false){
  return enabled?{
    halo:{'line-color':V2_ROUTE_CASING_COLOR,
      'line-opacity':.91,'line-width':asMapboxWidth(V2_ROUTE_CASING_STOPS)},
    line:{'line-width':asMapboxWidth(V2_ROUTE_CORE_STOPS)}
  }:{
    halo:{'line-color':'#ffffff','line-opacity':.94,'line-width':13},
    line:{'line-width':8}
  };
}

/** Match the Mapbox stops for Leaflet's raster fallback.
 * Calculated on zoomend instead of per frame to preserve existing animation.
 */
export function v2RouteStrokePixels(zoom,enabled=false){
  if(!enabled)return {core:8,halo:13};
  const sample=(stops)=>{
    const z=Number.isFinite(zoom)?zoom:17;
    if(z<=stops[0][0])return stops[0][1];
    for(let i=1;i<stops.length;i++){
      const [nextZoom,nextWidth]=stops[i];
      if(z<=nextZoom){
        const [lastZoom,lastWidth]=stops[i-1];
        return lastWidth+(nextWidth-lastWidth)*
          (z-lastZoom)/(nextZoom-lastZoom);
      }
    }
    return stops.at(-1)[1];
  };
  return {core:sample(V2_ROUTE_CORE_STOPS),
    halo:sample(V2_ROUTE_CASING_STOPS)};
}
