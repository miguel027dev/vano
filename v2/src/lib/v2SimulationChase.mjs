/** Screenshot-inspired chase composition ONLY for the administrator V2 SIM.
 * The value 0.73 describes the unobstructed map area, not the full phone screen.
 * Never modify geolocation, route guidance, or the active production camera.
 */
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export const V2_SIM_REFERENCE=Object.freeze({
  zoom:17.25,
  pitch:56,
  markerFraction:0.73,
});

/** A padded Mapbox center is projected halfway between its top/bottom padding.
 * Move that projected center to the lower 73% of the pre-existing safe viewport.
 * Keeping the geographic target at the actual puck lets its screen position
 * stay steady even while Mapbox changes zoom and pitch.
 *
 * Uses already measured viewport metrics: NEVER query layout inside RAF.
 */
export function v2SimulationChasePadding(viewport){
  const original=viewport?.padding;
  if(!original)return null;
  const top=Number(original.top),bottom=Number(original.bottom);
  const free=Number(viewport.visibleHeight);
  const guard=Number(viewport.markerRadius)||42;
  if(!Number.isFinite(top)||!Number.isFinite(bottom)||
     !Number.isFinite(free)||free<105)return original;
  // On tiny displays preserve the pointer/next-turn UI instead of forcing 73%.
  const lowerBound=Math.min(free*.5,guard+6);
  const upperBound=Math.max(lowerBound,free-guard-6);
  const desired=clamp(free*V2_SIM_REFERENCE.markerFraction,lowerBound,upperBound);
  const shift=clamp(2*(desired-free*.5),0,Math.max(0,free-96));
  return {...original,top:Math.round(top+shift)};
}

/** Closer, more diagonal V2 simulation framing (approx. 0.2 zoom nearer).\n * Restrict only the V2 SIM zoom/pitch envelope; remaining adjustments for
 * confirmed entrances and structural occlusion stay in its scenario planner. */
export function v2SimulationCameraLimits(zoom,pitch,{reducedMotion=false}={}){
  return {
    zoom:clamp(Number.isFinite(zoom)?zoom:V2_SIM_REFERENCE.zoom,16.90,17.65),
    pitch:reducedMotion?0:clamp(Number.isFinite(pitch)?pitch:V2_SIM_REFERENCE.pitch,30,61)
  };
}
