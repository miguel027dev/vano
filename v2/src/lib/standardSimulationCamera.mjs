/** Private /v2 Play camera: presentation-only framing, never navigation GPS.
 * Do not reuse in live routing or the independent V2 drone simulator.
 * Mapbox pitch increases to reveal the road horizon; small zoom boosts on
 * provider-confirmed entrances replace the standard maneuver zoom-out.
 */
import {maneuverCategory} from './navigationCameraPlanner.js';
import {validPoint} from './navigationMotion.js';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export function planStandardSimulationCamera({
  enabled=false,base=null,position=null,maneuver=null,route=null,
  vehicle='carro',compactViewport=false,reducedMotion=false,speed=0,
  accuracy=null,markerBearing=null
}={}){
  if(!enabled||!base||!validPoint(position)||!['carro','moto'].includes(vehicle)||
     reducedMotion)return base;
  // The simulation uses its own known geometry; bad telemetry should not
  // produce aggressive movement even in a playback session.
  const reliable=accuracy===null||(Number.isFinite(accuracy)&&accuracy<=65);
  const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
  const category=maneuverCategory({
    ...step,kind:maneuver?.kind||step?.type,modifier:maneuver?.modifier||step?.modifier
  });
  const distance=Number.isFinite(maneuver?.distance)&&maneuver.distance>=0?
    maneuver.distance:Infinity;
  const velocity=Number.isFinite(speed)?clamp(speed,0,40):0;
  const decisions={
    ramp:{start:clamp(170+velocity*7,185,320),zoom:.27,pitch:46},
    turn:{start:clamp(130+velocity*6,140,240),zoom:.21,pitch:45},
    junction:{start:clamp(145+velocity*7,165,270),zoom:.16,pitch:45},
    uturn:{start:190,zoom:.13,pitch:43},
    roundabout:{start:clamp(160+velocity*6,175,270),zoom:-.10,pitch:42},
    arrival:{start:100,zoom:0,pitch:36}
  };
  const config=decisions[category];
  const strength=reliable&&config&&distance<config.start?
    smooth((config.start-distance)/config.start):0;
  // One stable chase view, with no yaw changes, angle jumps or zoom breathing.
  const cruiseZoom=compactViewport?16.65:16.82;
  // Stable Play baseline: the live camera's forward-looking turnFocus can
  // zoom out BEFORE a junction. Do not inherit that pre-turn zoom behavior.
  const targetZoom=clamp(cruiseZoom+(config?.zoom||0)*strength,
    compactViewport?16.35:16.5,compactViewport?17.05:17.45);
  const pitchCruise=compactViewport?44:48;
  const pitchAtDecision=compactViewport?
    Math.max(38,(config?.pitch??pitchCruise)-3):(config?.pitch??pitchCruise);
  const targetPitch=clamp(pitchCruise+(pitchAtDecision-pitchCruise)*strength,36,50);
  // Camera follows the *visible vehicle's current bearing*, not the route's
  // future bearing (cameraTarget looks 60-220m ahead and rotates too early).
  // Keep a stable rear chase: offset the map center forward along the vehicle,
  // NEVER along the upcoming turn. Rotation begins only as the car turns.
  const heading=Number.isFinite(markerBearing)?markerBearing:
    Number.isFinite(base.bearing)?base.bearing:0;
  const rad=heading*Math.PI/180;
  const availableAhead=config&&Number.isFinite(distance)?
    Math.max(9,distance*.7):Infinity;
  const lookAhead=Math.min((compactViewport?28:38)-(compactViewport?12:18)*strength,
    availableAhead);
  const center=[
    position[0]+Math.sin(rad)*lookAhead/(111320*Math.max(.25,Math.cos(position[1]*Math.PI/180))),
    position[1]+Math.cos(rad)*lookAhead/111320
  ];
  return {
    ...base,center,zoom:targetZoom,pitch:targetPitch,bearing:heading,
    // The car remains responsive; only the CAMERA has deliberate inertia.
    droneCamera:{
      ...base.droneCamera,
      halfLife:720,pointHalfLife:580,bearingHalfLife:540
    }
  };
}
