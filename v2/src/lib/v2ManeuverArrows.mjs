import {buildRouteTimeline,distanceOnRoute,sampleRoute} from './routeAnimation.js';
import {validPoint} from './navigationMotion.js';

const empty=()=>({type:'FeatureCollection',features:[]});
const line=(coordinates,index,part)=>({
  type:'Feature',properties:{maneuver:index,part},
  geometry:{type:'LineString',coordinates}
});
const arrowhead=(point,bearing,index)=>({
  type:'Feature',properties:{maneuver:index,part:'head',bearing},
  geometry:{type:'Point',coordinates:point}
});
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const maneuverType=step=>normalized(step?.type);
const isRoundabout=step=>/roundabout|rotary|rotatoria/.test(maneuverType(step));
const isExitOfRoundabout=step=>/exit.*(roundabout|rotary)|(roundabout|rotary).*exit|saida.*rotatoria/.test(maneuverType(step));
const isRampLike=step=>{
  const type=maneuverType(step),instruction=normalized(step?.instruction);
  return /ramp|fork|merge|exit|bifurcat/.test(type)||
    /alca|rampa|acesso|viaduto|ponte|elevad|bifurcac|saida|mantenha.se a/.test(instruction);
};
const isDirectionalManeuver=step=>{
  const type=maneuverType(step);
  const modifier=normalized(step?.modifier);
  const instruction=normalized(step?.instruction);
  return /turn|fork|merge|ramp|roundabout|rotary|exit|bifurcat/.test(type)||
    /left|right|u.turn|direita|esquerda/.test(modifier)||
    /(?:pegue|entre|acesse|suba|vire|converja|mantenha|utilize|saia|pegue a saida).{0,65}(?:ponte|viaduto|elevad|alca|rampa|acesso|bifurcac|saida)|(?:acesso|rampa|alca|saida).{0,35}(?:a direita|a esquerda)/.test(instruction);
};

/** Provider-confirmed, in-route white arrows for /mapa and /v2. A bridge or
 * overpass is never invented from the 2D road shape alone.
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
    if(!Number.isFinite(at)||!isDirectionalManeuver(step)||at<10||at>timeline.total-7)continue;
    if(isExitOfRoundabout(step)&&positioned.slice(0,i).some(previous=>
      isRoundabout(previous.step)&&Number.isFinite(previous.at)&&at-previous.at<=130))continue;
    if(at-previousAt<21)continue;
    const roundabout=isRoundabout(step);
    const ramp=isRampLike(step);
    const followingExit=roundabout&&positioned.slice(i+1).find(item=>
      Number.isFinite(item.at)&&item.at>at+8&&isExitOfRoundabout(item.step)&&item.at-at<=130);
    const nextTurn=positioned.slice(i+1).find(item=>
      Number.isFinite(item.at)&&item.at>at+8&&isDirectionalManeuver(item.step)&&
      !(roundabout&&isExitOfRoundabout(item.step)));
    let end=followingExit?followingExit.at+10:at+(roundabout?30:ramp?27:19);
    if(nextTurn)end=Math.min(end,nextTurn.at-5);
    end=Math.min(timeline.total-3,end);
    const start=Math.max(3,at-(roundabout?24:ramp?43:30),previousAt+11);
    if(end-start<18)continue;
    const shaft=[];
    for(let distance=start;distance<end;distance+=4){
      const point=sampleRoute(timeline,distance)?.point;
      if(point)shaft.push(point);
    }
    const tip=sampleRoute(timeline,end)?.point;
    const behind=sampleRoute(timeline,end-7)?.point;
    if(!tip||!behind)continue;
    // Keep the head centered on the route. Rendering systems scale its
    // pixel-sized triangle with the orange core instead of converting
    // geographic metres into oversized side wings.
    const metersPerLatitude=111320;
    const metersPerLongitude=Math.max(1000,metersPerLatitude*Math.cos(tip[1]*Math.PI/180));
    const dx=(tip[0]-behind[0])*metersPerLongitude;
    const dy=(tip[1]-behind[1])*metersPerLatitude;
    if(Math.hypot(dx,dy)<.5)continue;
    const bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
    shaft.push(tip);
    features.push(line(shaft,index,'shaft'));
    features.push(arrowhead(tip,bearing,index));
    previousAt=at;
    if(features.length>=80)break;
  }
  return {type:'FeatureCollection',features};
}
