/** VANO Motion 3.5 — light trails without moving or rebuilding the route geometry.
 * Mapbox line-dasharray values are measured in units of the line's width.
 * Advance the highlighted segment in the direction of GeoJSON coordinates.
 */
export const FLOW_FRAME_MS=90;
export const FLOW_DASH_FRAMES=Object.freeze(Array.from({length:14},(_,index)=>{
  const phase=index*.5;
  const dashes=phase<=3
    ? [phase,4,3-phase]
    : [0,phase-3,3,7-phase];
  return Object.freeze(dashes);
}));
export function flowFrameAt(timestamp,stepMs=FLOW_FRAME_MS){
  if(!Number.isFinite(timestamp)||!Number.isFinite(stepMs)||stepMs<=0)return 0;
  return Math.floor(Math.max(0,timestamp)/stepMs)%FLOW_DASH_FRAMES.length;
}
