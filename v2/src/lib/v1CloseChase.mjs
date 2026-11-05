/** Public navigation composition: retain physical GPS anchoring and measured
 * safe-area padding while giving highways more room ahead. */
import {planStandardSimulationCamera} from './standardSimulationCamera.mjs';
import {maneuverCategory} from './navigationCameraPlanner.js';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function planV1CloseChase(options={}){
  const {enabled=false,base=null,accuracy=null,speed=0,maneuver=null,route=null,cameraV3=true}=options;
  if(!enabled||!base||!Number.isFinite(accuracy)||accuracy>50)return base;
  const planned=planStandardSimulationCamera({...options,enabled:true});
  if(!planned||planned===base||!planned.cameraFollowMarker)return base;
  if(cameraV3){
    // Interpolate continuously as speed rises. Mapbox zoom is logarithmic:
    // 15.8 shows roughly twice the ground width of zoom 16.8.
    const travel=clamp((Number.isFinite(speed)?speed:0)/27,0,1);
    const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
    const category=maneuverCategory({...step,kind:maneuver?.kind||step?.type,modifier:maneuver?.modifier||step?.modifier});
    const distance=Number(maneuver?.distance);
    const approaching=(category==='ramp'||category==='junction')&&Number.isFinite(distance)?clamp((700-distance)/700,0,1):0;
    return {...planned,zoom:clamp(16.9-.95*travel-.18*approaching,15.6,17),
      pitch:clamp(42+5*travel-3*approaching,38,48)};
  }
  // Rollback switch keeps the preceding close-follow camera available.
  const bonus=Number.isFinite(speed)&&speed>27?.2:
    Number.isFinite(speed)&&speed>19?.35:.68;
  return {...planned,zoom:clamp(planned.zoom+bonus,17.4,18.9)};
}
