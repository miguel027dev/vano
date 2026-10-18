/** Camera presentation policy shared by V2 Sim and real guided navigation.
 * Pure output: never changes the route, GPS coordinates, guidance or user icon.
 * Long straights need verified route geometry, movement and safe distance to
 * the next provider maneuver; decision zones beat straight-road cruising. */
import {maneuverCategory} from './navigationCameraPlanner.js';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
const idle={scenario:'idle',straightStrength:0,decisionStrength:0,zoomDelta:0,microZoom:0};
export function planAdaptiveRoadDistance({
  enabled=false,vehicle='carro',maneuver=null,route=null,
  straightMeters=0,bendDegrees=0,speed=0,accuracy=null,
  simulation=false,reducedMotion=false
}={}){
  if(!enabled||!['carro','moto'].includes(vehicle))return idle;
  const step=Number.isInteger(maneuver?.stepIndex)?
    route?.steps?.[maneuver.stepIndex]:null;
  const category=maneuverCategory({
    ...step,kind:maneuver?.kind||step?.type,
    modifier:maneuver?.modifier||step?.modifier
  });
  const distance=Number.isFinite(maneuver?.distance)&&maneuver.distance>=0?
    maneuver.distance:Infinity;
  const velocity=clamp(speed,0,45);
  const uncertain=Number.isFinite(accuracy)?accuracy>65:!simulation;
  const angle=Number.isFinite(bendDegrees)?
    Math.abs(((bendDegrees+540)%360)-180):0;
  // Real guidance must be present and sufficiently accurate to expand view.
  // Simulation has explicit route progress and can use a missing provider step.
  const confirmed=simulation||
    (maneuver&&Number.isFinite(maneuver.distance)&&maneuver.distance>=0);
  const clearToCruise=Boolean(confirmed)&&!uncertain&&velocity>=3.5&&
    angle<16&&(category==='continue'||distance>520);
  const straightStrength=clearToCruise?
    smooth((clamp(straightMeters,0,650)-255)/360):0;
  // The final few hundred metres get a tiny, gradual zoom correction.
  // Not an oscillating "breathing" animation: only geometry changes this.
  const microZoom=straightStrength*.065*
    smooth((clamp(straightMeters,0,650)-480)/170);
  const decision=category==='ramp'&&distance<=180?'entrance':
    category==='turn'&&distance<=185?'turn':
    category==='junction'&&distance<=230?'junction':
    category==='uturn'&&distance<=185?'uturn':
    category==='roundabout'&&distance<=230?'roundabout':
    category==='arrival'&&distance<=90?'arrival':
    straightStrength>.02?'straight':'cruise';
  const decisionStrength=decision==='entrance'?smooth((180-distance)/105):
    decision==='turn'||decision==='uturn'?smooth((185-distance)/145):
    decision==='junction'||decision==='roundabout'?smooth((230-distance)/175):
    decision==='arrival'?smooth((90-distance)/80):0;
  if(simulation)return {
    scenario:decision,straightStrength,decisionStrength,
    // Drone's own maneuver/urban planner handles the main zoom.
    zoomDelta:0,microZoom
  };
  // User map: conservative changes to existing GPS camera and maneuver
  // planner; a roundabout should show exits rather than crop them.
  const zoomDelta=uncertain||reducedMotion?0:
    decision==='straight'?-(.30*straightStrength+microZoom):
    decision==='entrance'?.23*decisionStrength:
    decision==='turn'||decision==='uturn'?.17*decisionStrength:
    decision==='junction'?.12*decisionStrength:
    decision==='arrival'?.10*decisionStrength:
    decision==='roundabout'?-.08*decisionStrength:0;
  return {scenario:decision,straightStrength,decisionStrength,
    zoomDelta:Math.round(clamp(zoomDelta,-.39,.24)*1000)/1000,microZoom};
}
