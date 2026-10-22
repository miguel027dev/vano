/** Conservative Mapbox startup recovery: a slow vector/style load is NOT
 * evidence that GPU rendering is unavailable. Keep the vector map alive
 * through ordinary network stalls; use raster only after a bounded deadline.
 */
export const MAPBOX_VECTOR_PROBE_MS=20000;
export const MAPBOX_VECTOR_MAX_WAIT_MS=55000;
export const WEBGL_CONTEXT_RESTORE_MS=12000;

export function vectorStartupDecision({elapsedMs=0,loaded=false,usingCustomStyle=false,retriedDefaultStyle=false}={}){
 if(loaded)return 'ready';
 if(elapsedMs<MAPBOX_VECTOR_PROBE_MS)return 'wait';
 if(usingCustomStyle&&!retriedDefaultStyle)return 'retry-default-vector';
 return elapsedMs>=MAPBOX_VECTOR_MAX_WAIT_MS?'raster':'wait';
}
