/** GPS-confirmed turn progression. Only accepted sensor fixes advance maneuver state.
 * Never infer an executed turn from a moving marker animation or an instruction timer.
 */
import {bearingBetween,metersBetween,nearestOnRoute,shortestAngle,validPoint} from './navigationMotion.js';
import {buildRouteTimeline,distanceOnRoute,sampleRoute,nextManeuver} from './routeAnimation.js';

const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));

export function createManeuverTracker(route){
 const timeline=buildRouteTimeline(route?.geometry);
 const items=(Array.isArray(route?.steps)?route.steps:[])
  .map((step,i)=>step&&validPoint(step.location)?{...step,at:distanceOnRoute(timeline,step.location),stepIndex:i}:null)
  .filter(Boolean).sort((a,b)=>a.at-b.at||a.stepIndex-b.stepIndex)
  .filter((step,i,all)=>!(i===0&&all.length>1&&step.at<=2&&
    (step.type==='depart'||step.type==='departure'||step.modifier==='straight'||step.type==='continue')));
 let index=0,lastProgress=null,lastFixAt=0,afterFixes=0,lastResult=null;
 function reset(){index=0;lastProgress=null;lastFixAt=0;afterFixes=0;lastResult=null;}
 function update(position,{accuracy=15,speed=0,heading=null,sourceAt=Date.now()}={}){
  if(!validPoint(position)||timeline.total<=0||!Number.isFinite(accuracy)||accuracy>50)return lastResult;
  const match=nearestOnRoute(position,route?.geometry);
  if(match.distance>Math.max(25,accuracy*1.6))return lastResult;
  if(Number.isFinite(sourceAt)&&lastFixAt&&sourceAt<=lastFixAt)return lastResult;
  let progress=distanceOnRoute(timeline,position);
  if(lastProgress!==null){
   const elapsed=clamp((sourceAt-lastFixAt)/1000,0,20);
   // Reject leaps to a later segment at tight crossings and on looping routes.
   const feasible=Math.max(45,(Number.isFinite(speed)?Math.max(0,speed):0)*elapsed*2.5+accuracy*2+15);
   progress=Math.min(progress,lastProgress+feasible);
   progress=Math.max(progress,lastProgress-6);
  }
  if(Number.isFinite(sourceAt))lastFixAt=sourceAt;
  lastProgress=progress;
  let cycles=0;
  while(index<items.length-1&&cycles++<3){
   const current=items[index],following=items[index+1];
   const gap=Math.max(0,following.at-current.at);
   const clearance=clamp(gap*.35,3,8);
   if(progress<current.at+clearance){afterFixes=0;break;}
   const forward=sampleRoute(timeline,Math.min(timeline.total,current.at+Math.min(14,Math.max(4,gap*.65))))?.point;
   const before=sampleRoute(timeline,Math.min(timeline.total,current.at+Math.min(3,Math.max(1,gap*.1))))?.point;
   const outgoing=validPoint(forward)&&validPoint(before)&&metersBetween(before,forward)>=2
    ?bearingBetween(before,forward):null;
   const goodHeading=Number.isFinite(heading)&&heading>=0&&Number.isFinite(speed)&&speed>=1.5&&accuracy<=30
    &&outgoing!==null&&Math.abs(shortestAngle(heading,outgoing))<=65;
   // Poor GPS/unknown heading needs two distinct fixes after the turn. For very
   // close turns, heading confirmation lets the next cue appear without a 30m delay.
   if(!goodHeading){
    afterFixes++;
    if(afterFixes<2||progress<current.at+clearance+2)break;
   }
   index++;afterFixes=0;
  }
  const step=items[index];
  if(!step){
   const fallback=nextManeuver(route,timeline,progress);
   lastResult={...fallback,progress:progress/timeline.total,routeMeters:progress,preview:false,finished:false};
   return lastResult;
  }
  const following=items[index+1]||null;
  const gap=following?following.at-step.at:null;
  const upcoming=following&&gap>0&&gap<=45&&following.type!=='arrive'&&following.type!=='destination'
   ?{instruction:following.instruction||'',stepIndex:following.stepIndex,gapMeters:gap}:null;
  lastResult={
   instruction:step.instruction||'Continue pela rota',
   distance:Math.max(0,step.at-progress),modifier:step.modifier||'straight',
   kind:step.type||'',street:step.street||'',
   lanes:Array.isArray(step.lanes)?step.lanes.slice(0,8):[],
   stepIndex:step.stepIndex,following:upcoming,
   progress:progress/timeline.total,routeMeters:progress,
   preview:false,finished:false
  };
  return lastResult;
 }
 return {update,reset,get currentStepIndex(){return items[index]?.stepIndex??null;}};
}
