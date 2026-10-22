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
  accuracy=null
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
  const targetZoom=clamp(Math.max(base.zoom,cruiseZoom)+
    (config?.zoom||0)*strength,compactViewport?16.35:16.5,compactViewport?17.05:17.45);
  const pitchCruise=compactViewport?44:48;
  const pitchAtDecision=compactViewport?
    Math.max(38,(config?.pitch??pitchCruise)-3):(config?.pitch??pitchCruise);
  const targetPitch=clamp(pitchCruise+(pitchAtDecision-pitchCruise)*strength,36,50);
  // Anchor the animated puck below the look-ahead point, not on the junction.
  // Interpolate *toward* the puck from an already screen-safe base target.
  const lookFactor=.56-.13*strength;
  const center=validPoint(base.center)?[
    position[0]+(base.center[0]-position[0])*lookFactor,
    position[1]+(base.center[1]-position[1])*lookFactor
  ]:position;
  return {...base,center,zoom:targetZoom,pitch:targetPitch};
}
