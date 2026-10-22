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
  enabled=false,base=null,position=null,heading=null,maneuver=null,route=null,
  vehicle='carro',compactViewport=false,reducedMotion=false,speed=0,
  accuracy=null,markerBearing=null,viewportClearancePx=null
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
  // This camera must NEVER aim at the upcoming road bearing. Follow only
  // the current animated user marker, after it actually starts to turn.
  const cruiseZoom=compactViewport?16.65:16.82;
  const targetZoom=clamp(cruiseZoom+(config?.zoom||0)*strength,
    compactViewport?16.35:16.5,compactViewport?17.05:17.45);
  const pitchCruise=compactViewport?44:48;
  const pitchAtDecision=compactViewport?
    Math.max(38,(config?.pitch??pitchCruise)-3):(config?.pitch??pitchCruise);
  const targetPitch=clamp(pitchCruise+(pitchAtDecision-pitchCruise)*strength,36,50);
  const rawHeading=Number.isFinite(markerBearing)?markerBearing:heading;
  const headingCurrent=Number.isFinite(rawHeading)?((rawHeading%360)+360)%360:null;
  const lookMeters=(17+velocity*.6)*(1-.25*strength);
  const metersPerPixel=156543.03392*
    Math.max(.1,Math.cos(position[1]*Math.PI/180))/Math.pow(2,targetZoom);
  const safeAhead=Number.isFinite(viewportClearancePx)?
    Math.max(0,viewportClearancePx)*metersPerPixel*.65:Infinity;
  const forward=headingCurrent===null?0:Math.min(lookMeters,safeAhead);
  const rad=(headingCurrent??0)*Math.PI/180;
  const center=[
    position[0]+Math.sin(rad)*forward/(111320*Math.max(.25,Math.cos(position[1]*Math.PI/180))),
    position[1]+Math.cos(rad)*forward/111320
  ];
  return {...base,center,zoom:targetZoom,pitch:targetPitch,
    bearing:headingCurrent??base.bearing,
    // Camera rotation and zoom glide slowly; follow-center stays near the car.
    cameraFollowMarker:true,
    droneCamera:{halfLife:720,pointHalfLife:380,bearingHalfLife:520}
  };
}
