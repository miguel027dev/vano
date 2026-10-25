/** Public /mapa follows the proven V2 Play camera, with closer framing.
 * Only active, accurate vehicle navigation may opt in. Coordinates, pitch,
 * physical bearing, safe viewport and motion easing are owned by the shared
 * simulation planner; this helper adjusts zoom alone.
 */
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function planV1CloseChase(options={}){
  const {enabled=false,base=null,position=null,accuracy=null,speed=0}=options;
  if(!enabled||!base||!Number.isFinite(accuracy)||accuracy>50)return base;
  const planned=planStandardSimulationCamera({...options,enabled:true});
  if(!planned||planned===base||!planned.cameraFollowMarker)return base;
  // On a fast highway keep more road ahead. Never change the V2 pitch,
  // marker position or its turn-follow animation.
  const bonus=Number.isFinite(speed)&&speed>27?.2:
    Number.isFinite(speed)&&speed>19?.35:.68;
  return {...planned,zoom:clamp(planned.zoom+bonus,17.4,18.9)};
}
