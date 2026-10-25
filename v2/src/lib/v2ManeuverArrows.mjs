import {buildRouteTimeline,distanceOnRoute,sampleRoute} from './routeAnimation.js';
import {validPoint} from './navigationMotion.js';

const empty=()=>({type:'FeatureCollection',features:[]});
const line=(coordinates,index,part)=>({
  type:'Feature',properties:{maneuver:index,part},
  geometry:{type:'LineString',coordinates}
});
const maneuverType=step=>String(step?.type||'').toLowerCase();
const isTurn=step=>{
  const type=maneuverType(step),modifier=String(step?.modifier||'').toLowerCase();
  return /turn|fork|merge|ramp|roundabout|rotary|exit/.test(type) ||
    /right|left|u.turn/.test(modifier);
};
const isRoundabout=step=>/roundabout|rotary/.test(maneuverType(step));

/** White, geometry-following turn cues for /v2 only.
 * Only provider maneuvers with locations are drawn: road bends alone never
 * create instructions. Returned geometry is static for a selected route.
 */
export function buildV2ManeuverArrows(route){
  const steps=Array.isArray(route?.steps)?route.steps:[];
  const timeline=buildRouteTimeline(route?.geometry);
  if(timeline.total<30||!steps.length)return empty();
  const features=[];
  const positioned=steps.map((step,index)=>({
    step,index,at:validPoint(step?.location)?distanceOnRoute(timeline,step.location):null
  }));
  let previousAt=-Infinity;
  for(let i=0;i<positioned.length;i++){
    const {step,index,at}=positioned[i];
    if(!Number.isFinite(at)||!isTurn(step)||at<12||at>timeline.total-9)continue;
    if(at-previousAt<29)continue; // Avoid a visually merged pair of arrows.
    const roundabout=isRoundabout(step);
    const following=positioned.slice(i+1).find(item=>Number.isFinite(item.at)&&
      item.at>at+8&&/exit.*(roundabout|rotary)|(roundabout|rotary).*exit/.test(maneuverType(item.step)));
    const end=roundabout&&following&&following.at-at<=130
      ?Math.min(timeline.total-3,following.at+8)
      :Math.min(timeline.total-3,at+(roundabout?27:16));
    const start=Math.max(3,at-(roundabout?19:24));
    if(end-start<20)continue;
    const shaft=[];
    for(let distance=start;distance<end;distance+=5){
      const point=sampleRoute(timeline,distance)?.point;
      if(point)shaft.push(point);
    }
    const tip=sampleRoute(timeline,end)?.point;
    const behind=sampleRoute(timeline,end-6)?.point;
    if(!tip||!behind)continue;
    const metersPerLatitude=111320;
    const metersPerLongitude=Math.max(1000,metersPerLatitude*Math.cos(tip[1]*Math.PI/180));
    const dx=(tip[0]-behind[0])*metersPerLongitude;
    const dy=(tip[1]-behind[1])*metersPerLatitude;
    const length=Math.hypot(dx,dy);
    if(length<0.5)continue;
    const ux=dx/length,uy=dy/length;
    const wing=side=>[
      tip[0]+(-ux*5.5-uy*side)/metersPerLongitude,
      tip[1]+(-uy*5.5+ux*side)/metersPerLatitude
    ];
    shaft.push(tip);
    features.push(line(shaft,index,'shaft'));
    features.push(line([wing(3),tip],index,'wing-left'));
    features.push(line([wing(-3),tip],index,'wing-right'));
    previousAt=at;
    if(features.length>=90)break;
  }
  return {type:'FeatureCollection',features};
}
