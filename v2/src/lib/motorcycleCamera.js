/** Moto Focus: navigation camera policy independent of car routing.
 * Only consumes accepted real GPS telemetry and provider maneuver coordinates.
 * Never extrapolates the rider's location or infers physical motorcycle lean.
 */
import {clamp,validPoint} from './navigationMotion.js';
import {buildRouteTimeline,distanceOnRoute} from './routeAnimation.js';
import {maneuverCategory} from './navigationCameraPlanner.js';

const SETTINGS=Object.freeze({
  turn:{seconds:10,min:90,max:395,zoom:0.65,pitch:17},
  ramp:{seconds:16,min:150,max:720,zoom:1.15,pitch:24},
  junction:{seconds:13,min:115,max:540,zoom:0.90,pitch:20},
  roundabout:{seconds:14,min:125,max:580,zoom:1.04,pitch:25},
  uturn:{seconds:12,min:105,max:465,zoom:0.95,pitch:23},
  arrival:{seconds:8,min:65,max:240,zoom:0.48,pitch:16}
});
export const MOTO_CAMERA_PHASES=Object.freeze({
  FOLLOW:'MOTO_FOLLOW',APPROACH:'MOTO_APPROACH',FOCUS:'MOTO_FOCUS',
  HOLD:'MOTO_HOLD',RECOVER:'MOTO_RECOVER',GPS_GUARD:'MOTO_GPS_GUARD'
});
const smoothstep=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const memo=new WeakMap();

/** Calculate real along-route separation between provider maneuvers, cached by
 * immutable route identity. Straight-line distance is unsuitable for loops.
 */
export function motorcycleManeuverChain(route){
  if(!route||typeof route!=='object')return [];
  const cached=memo.get(route);
  if(cached&&cached.steps===route.steps&&cached.geometry===route.geometry)return cached.chain;
  const timeline=buildRouteTimeline(route.geometry);
  const chain=Array.isArray(route.steps)&&timeline.total>0
    ?route.steps.map((step,index)=>({
      index,category:maneuverCategory(step),
      at:validPoint(step?.location)?distanceOnRoute(timeline,step.location):null
    })).filter(s=>s.category!=='continue'&&Number.isFinite(s.at))
    :[];
  memo.set(route,{steps:route.steps,geometry:route.geometry,chain});
  return chain;
}

function closeFollowingTurn(route,index,limit=180){
  const chain=motorcycleManeuverChain(route);
  const current=chain.find(x=>x.index===index);
  if(!current)return null;
  const upcoming=chain.find(x=>x.index>index&&x.at>=current.at+5);
  return upcoming&&upcoming.at-current.at<=limit?upcoming:null;
}

function smoothStrength(value,previous,nowMs){
  if(!previous||!Number.isFinite(previous.updatedAt)||!Number.isFinite(nowMs)||nowMs<=previous.updatedAt)return value;
  // Rate limits avoid flutter at low speeds and rapid GPS accuracy changes.
  const dt=clamp(nowMs-previous.updatedAt,0,100);
  return clamp(value,Math.max(0,previous.strength-dt/550),Math.min(1,previous.strength+dt/330));
}

export function planMotorcycleCamera({
  navigation=false,route=null,maneuver=null,speed=0,accuracy=null,
  reducedMotion=false,previous=null,nowMs=null
}={}){
  const initial={phase:MOTO_CAMERA_PHASES.FOLLOW,category:'continue',strength:0,
    zoomOut:0,pitchDrop:0,lookAheadScale:0.78,threshold:0,
    stepIndex:-1,route,updatedAt:nowMs,unstable:false,holdNext:false,holdChainStep:-1};
  if(!navigation)return initial;
  const confidence=Number.isFinite(accuracy)?accuracy:null;
  const gpsGuard=confidence!==null&&confidence>75;
  const unusable=confidence!==null&&confidence>120;
  const stepIndex=Number.isInteger(maneuver?.stepIndex)?maneuver.stepIndex:-1;
  const step=stepIndex>=0?route?.steps?.[stepIndex]:null;
  const category=maneuverCategory({...step,kind:maneuver?.kind||step?.type,modifier:maneuver?.modifier||step?.modifier});
  const hasManeuver=category!=='continue'&&Number.isFinite(maneuver?.distance)&&maneuver.distance>=0
    &&SETTINGS[category]!==undefined;
  const sameRoute=previous?.route===route;
  const sameStep=sameRoute&&previous?.stepIndex===stepIndex;
  const velocity=Number.isFinite(speed)?clamp(speed,0,45):0;
  const cfg=SETTINGS[category];
  let threshold=cfg?clamp(velocity*cfg.seconds+30,cfg.min,cfg.max):0;
  let distance=hasManeuver?maneuver.distance:Infinity;
  // Retain the anticipation window briefly across speed changes.
  if(sameStep&&previous?.strength>0.06)threshold=Math.max(threshold,previous.threshold*.90);
  const t=hasManeuver?smoothstep((threshold-distance)/Math.max(threshold,1)):0;
  let strength=t;
  const nextManeuver=hasManeuver?closeFollowingTurn(route,stepIndex):null;
  const closeNext=Boolean(nextManeuver);
  // Persist the chain across the step-index change reported by the provider:
  // the view must not close between an exit and a second immediate turn.
  const carriedChain=sameRoute&&previous?.holdChainStep===stepIndex&&hasManeuver
    &&distance<=Math.max(185,threshold);
  const focusDistance=Math.max(25,velocity*2.3+(confidence!==null?Math.min(confidence,25):0));
  let phase=MOTO_CAMERA_PHASES.FOLLOW;
  if(hasManeuver&&distance<=threshold){
    phase=distance<=focusDistance?MOTO_CAMERA_PHASES.HOLD:
      t>=0.52?MOTO_CAMERA_PHASES.FOCUS:MOTO_CAMERA_PHASES.APPROACH;
    if(distance<=focusDistance)strength=Math.max(strength,.88);
    // Keep the full fork/roundabout framed through a confirmed, closely
    // following maneuver. Do not close and reopen between adjacent turns.
    if(closeNext&&distance<=Math.max(60,velocity*4.5)){
      strength=Math.max(strength,0.70);
      phase=MOTO_CAMERA_PHASES.HOLD;
    }
    if(carriedChain){
      strength=Math.max(strength,0.53);
      phase=MOTO_CAMERA_PHASES.HOLD;
    }
  }
  if(!sameStep&&sameRoute&&previous?.strength>0.04){
    if(hasManeuver&&distance<=185){
      strength=Math.max(strength,Math.min(.80,previous.strength*.92));
      phase=MOTO_CAMERA_PHASES.HOLD;
    }else if(phase===MOTO_CAMERA_PHASES.FOLLOW)phase=MOTO_CAMERA_PHASES.RECOVER;
  }
  if(!hasManeuver&&sameRoute&&previous?.strength>0.04)phase=MOTO_CAMERA_PHASES.RECOVER;
  // GPS reliability always has the LAST word, even after consecutive-turn holds.
  if(gpsGuard){
    strength*=unusable?0:0.28;
    phase=MOTO_CAMERA_PHASES.GPS_GUARD;
  }
  if(sameRoute&&!unusable)strength=smoothStrength(strength,previous,nowMs);
  strength=clamp(strength,0,1);
  if(strength<0.035&&!gpsGuard)phase=hasManeuver&&distance<=threshold
    ?MOTO_CAMERA_PHASES.APPROACH:MOTO_CAMERA_PHASES.FOLLOW;
  // The recovery is guided by the next provider step and the continuous
  // camera interpolation; never run a timer that guesses when a turn ended.
  if(!hasManeuver&&strength>0.035&&!gpsGuard)phase=MOTO_CAMERA_PHASES.RECOVER;
  return {
    ...initial,phase,category,strength,threshold,stepIndex,unstable:gpsGuard,
    holdNext:closeNext,
    holdChainStep:carriedChain?stepIndex:closeNext&&distance<=Math.max(60,velocity*4.5)?nextManeuver.index:-1,
    zoomOut:reducedMotion?0:(cfg?.zoom||0)*strength,
    pitchDrop:reducedMotion?0:(cfg?.pitch||0)*strength,
    lookAheadScale:0.78-(category==='ramp' ? 0.36 : 0.27)*strength
  };
}
