/** Prefer the user's configured Mapbox style over a replacement basemap.
 * Network stalls and optional source errors are not proof that WebGL failed.
 * Retry the SAME style once; Leaflet remains a last resort if nothing loads.
 */
export const MAPBOX_VECTOR_PROBE_MS=40000;
export const MAPBOX_VECTOR_MAX_WAIT_MS=120000;
export const WEBGL_CONTEXT_RESTORE_MS=30000;

export function vectorStartupDecision({
  elapsedMs=0,loaded=false,usingCustomStyle=false,retriedOriginalStyle=false
}={}){
  if(loaded)return 'ready';
  if(elapsedMs<MAPBOX_VECTOR_PROBE_MS)return 'wait';
  if(usingCustomStyle&&!retriedOriginalStyle)return 'retry-original-vector';
  return elapsedMs>=MAPBOX_VECTOR_MAX_WAIT_MS?'raster':'wait';
}
