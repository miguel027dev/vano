/** Private /v2 regular Play adopts the already validated V2 SIM chase policy.
 * This is presentation-only. Physical GPS, routing, MAVI, and the separate V2
 * drone simulation retain their own behavior. The controller is the only
 * writer of Mapbox camera state; this function provides targets only.
 */
import {planV2RampApproach,planV2RearChase} from './v2DroneCamera.mjs';
import {v2SimulationChasePadding} from './v2SimulationChase.mjs';
import {validPoint} from './navigationMotion.js';

export function planStandardSimulationCamera({
  enabled=false,base=null,position=null,heading=null,maneuver=null,route=null,
  vehicle='carro',compactViewport=false,reducedMotion=false,speed=0,
  accuracy=null,markerBearing=null,viewport=null,
  urbanDensity=0,obstruction=0,straightAheadMeters=0,bendDegrees=0
}={}){
  if(!enabled||!base||!validPoint(position)||!['carro','moto'].includes(vehicle)||
      reducedMotion)return base;
  // The synthetic Play fix is reliable, but honor bad telemetry if supplied.
  const reliable=accuracy===null||(Number.isFinite(accuracy)&&accuracy<=65);
  const ramp=planV2RampApproach({
    enabled:true,vehicle,maneuver,route,compactViewport,reducedMotion
  });
  const chase=planV2RearChase({
    enabled:true,vehicle,maneuver,route,speed,
    urbanDensity,obstruction,
    straightAheadMeters:reliable?straightAheadMeters:0,
    bendDegrees,accuracy,
    rampStrength:reliable?ramp.strength:0,
    compactViewport,reducedMotion
  });
  if(!chase.enabled)return base;
  // Use the actual animated vehicle heading, never the future turn's route
  // bearing. Unknown heading leaves the camera's current bearing unchanged.
  const physicalHeading=Number.isFinite(markerBearing)?markerBearing:heading;
  const bearing=Number.isFinite(physicalHeading)?
    ((physicalHeading%360)+360)%360:null;
  return {...base,
    // Camera padding, not a fictitious position meters ahead, puts the
    // physical vehicle at ~73% of the unoccluded map viewport.
    center:position.slice(0,2),
    zoom:chase.zoom,pitch:chase.pitch,bearing,
    cameraFollowMarker:true,
    cameraPadding:v2SimulationChasePadding(viewport),
    droneCamera:{
      halfLife:chase.halfLife,
      pointHalfLife:chase.pointHalfLife,
      bearingHalfLife:chase.bearingHalfLife
    }
  };
}
