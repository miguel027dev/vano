/** V2-only immersive camera trim. The existing Mapbox motion controller
 * remains the sole camera writer and retains real GPS/route-follow semantics.
 * Extra closeness is reduced around near turns and at high speeds so the
 * driver never loses the look-ahead established by the chase planner.
 */
export function planV2FocusCamera({
  enabled=false,base=null,vehicle='carro',speed=0,maneuver=null,reducedMotion=false
}={}){
  if(!enabled||!base||!['carro','moto'].includes(vehicle)||
    !Number.isFinite(base.zoom))return base;
  const meters=Number.isFinite(maneuver?.distance)?maneuver.distance:Infinity;
  const nearTurn=meters>=0&&meters<130;
  const fast=Number.isFinite(speed)&&speed>23;
  const moving=Number.isFinite(speed)&&speed>14;
  const bonus=nearTurn?.12:fast?.19:moving?.29:.42;
  const zoom=Math.max(base.zoom,Math.min(19.25,base.zoom+(reducedMotion?Math.min(bonus,.20):bonus)));
  // Pitch, real-world position, physical bearing, safe padding and easing
  // remain EXACTLY those of the currently selected V2 camera.
  return {...base,zoom};
}
