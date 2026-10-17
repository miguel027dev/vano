/** V2 Sim is an admin-only presentation policy. It never modifies route,
 * GPS coordinates, telemetry, navigation instructions or trip persistence. */
import {maneuverCategory} from './navigationCameraPlanner.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const V2_DRONE_PLAYBACK_RATE=2.5;

export function planV2DroneCamera({
  enabled=false,vehicle='carro',maneuver=null,route=null,
  speed=0,urbanDensity=0,compactViewport=false,reducedMotion=false,
  accuracy=null
}={}){
  if(!enabled||!['carro','moto'].includes(vehicle))
    return {enabled:false,open:0,category:'continue'};
  const urban=clamp(Number(urbanDensity)||0,0,1);
  const velocity=clamp(Number(speed)||0,0,45);
  const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
  const category=maneuverCategory({
    ...step,
    kind:maneuver?.kind||step?.type,
    modifier:maneuver?.modifier||step?.modifier
  });
  const distance=Number.isFinite(maneuver?.distance)?Math.max(0,maneuver.distance):Infinity;
  const type=category;
  const isJunction=['roundabout','ramp','junction','turn','uturn','arrival'].includes(type);
  const threshold=clamp(105+velocity*(type==='ramp'?10:8),115,type==='ramp'?290:235);
  let open=0;
  if(isJunction&&distance<threshold){
    // Smoothstep: continuous pullback, including just before the entry.
    const x=clamp((threshold-distance)/Math.max(50,threshold),0,1);
    open=x*x*(3-2*x);
  }
  if(Number.isFinite(accuracy)&&accuracy>75)open=Math.min(open,.38);
  const zoomBase=(compactViewport?18.67:19.00)-Math.min(.28,velocity*.012)-urban*.43;
  const zoomOut=type==='roundabout'?1.57:type==='ramp'?1.48:type==='junction'?1.32:type==='uturn'?1.29:1.13;
  const pitchBase=(compactViewport?63:69)-urban*13;
  const pitchDrop=type==='roundabout'?23:type==='ramp'?20:type==='junction'?18:15;
  const zoom=clamp(zoomBase-open*zoomOut,16.7,19.1);
  const pitch=clamp(pitchBase-open*pitchDrop,37,73);
  return {
    enabled:true,open,category,threshold,
    zoom:reducedMotion?Math.min(zoom,17.5):zoom,
    pitch:reducedMotion?0:pitch,
    // Preserve the puck anchor and only reveal more forward route near turns.
    centerBlend:clamp(.18+open*.31+urban*.08,.18,.57),
    halfLife:open>.16?260:urban>.4?470:420,
    bearingHalfLife:open>.16?350:490
  };
}
