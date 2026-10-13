/** Vanu V2 camera planner. Pure geometry + provider maneuvers: never simulates GPS. */
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const text=v=>typeof v==='string'?v.trim().toLowerCase().replace(/[_-]+/g,' '):'';

export function maneuverCategory(step={}) {
  const type=text(step.kind||step.type),modifier=text(step.modifier);
  if(/roundabout|rotary|rotat[oó]ria/.test(type))return 'roundabout';
  if(/arrive|arrival|destination|chegada/.test(type))return 'arrival';
  if(/off ramp|on ramp|ramp|exit|sa[ií]da|entrada/.test(type))return 'ramp';
  if(/merge|fork|bifurca|end of road/.test(type))return 'junction';
  if(/u turn|uturn|retorno|meia volta/.test(modifier+' '+type))return 'uturn';
  if(/turn|virar|curva|convers[aã]o/.test(type)&&/right|left|direita|esquerda/.test(modifier))return 'turn';
  return 'continue';
}

export function planManeuverCamera({navigation=false,maneuver=null,route=null,speed=0,accuracy=null,reducedMotion=false}={}) {
  const quiet={phase:'follow',category:'continue',strength:0,zoomOut:0,pitchDrop:0,lookAheadScale:1,unstable:false};
  if(!navigation||!maneuver||!Number.isFinite(maneuver.distance))return quiet;
  const step=Array.isArray(route?.steps)&&Number.isInteger(maneuver.stepIndex)
    ?route.steps[maneuver.stepIndex]:null;
  const category=maneuverCategory({...step,kind:maneuver.kind||step?.type,modifier:maneuver.modifier||step?.modifier});
  if(category==='continue')return quiet;
  const distance=Math.max(0,maneuver.distance);
  const velocity=Number.isFinite(speed)?clamp(speed,0,45):0;
  const configs={
    turn:{seconds:10,min:95,max:420,zoom:0.62,pitch:12},
    ramp:{seconds:16,min:145,max:700,zoom:1.15,pitch:20},
    junction:{seconds:12,min:110,max:540,zoom:0.92,pitch:16},
    roundabout:{seconds:14,min:125,max:590,zoom:1.03,pitch:20},
    uturn:{seconds:12,min:110,max:480,zoom:0.9,pitch:18},
    arrival:{seconds:8,min:65,max:230,zoom:0.52,pitch:22}
  };
  const cfg=configs[category];
  const threshold=clamp(velocity*cfg.seconds+30,cfg.min,cfg.max);
  if(distance>threshold)return {...quiet,category,threshold};
  // Smoothstep avoids jumpy thresholds and repeats. The existing motion RAF
  // handles the return to normal framing after the maneuver changes.
  const t=clamp((threshold-distance)/Math.max(1,threshold),0,1);
  let strength=t*t*(3-2*t);
  const poorGps=Number.isFinite(accuracy)&&accuracy>60;
  if(poorGps)strength*=accuracy>120?0:0.35;
  const next=route?.steps?.[maneuver.stepIndex+1];
  const consecutive=Number.isFinite(next?.distance)&&next.distance>=0&&next.distance<125
    &&maneuverCategory(next)!=='continue';
  if(consecutive)strength=Math.max(strength,0.3*t);
  return {
    phase:strength<.1?'follow':distance<Math.max(20,velocity*1.6)?'executing':'approaching',
    category,threshold,strength,unstable:poorGps,
    zoomOut:reducedMotion?0:cfg.zoom*strength,
    pitchDrop:reducedMotion?0:cfg.pitch*strength,
    lookAheadScale:1-(category==='ramp' ? 0.38 : 0.30)*strength
  };
}
