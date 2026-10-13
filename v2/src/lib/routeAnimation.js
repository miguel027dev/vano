/** Route traversal for an explicitly labelled, non-GPS preview. Geometry is never treated as a GPS reading. */
import { bearingBetween, clamp, metersBetween, nearestOnRoute, validPoint } from './navigationMotion.js';

export function buildRouteTimeline(geometry) {
  const raw = geometry?.type === 'LineString' ? geometry.coordinates : geometry?.coordinates;
  const points = Array.isArray(raw) ? raw.filter(validPoint) : [];
  const cumulative = [0];
  for (let i=1;i<points.length;i++) cumulative.push(cumulative[i-1]+metersBetween(points[i-1],points[i]));
  return {points,cumulative,total:cumulative.at(-1)||0};
}

export function sampleRoute(timeline,meters) {
  const {points=[],cumulative=[],total=0}=timeline||{};
  if (!points.length) return null;
  if (points.length===1 || total===0) return {point:points[0],bearing:0,progress:0,remaining:0};
  const progress=clamp(Number.isFinite(meters)?meters:0,0,total);
  let low=0,high=cumulative.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(cumulative[mid]<progress)low=mid+1;else high=mid;}
  const end=clamp(low,1,points.length-1),start=end-1;
  const length=cumulative[end]-cumulative[start];
  const fraction=length>0?clamp((progress-cumulative[start])/length,0,1):1;
  const a=points[start],b=points[end];
  const point=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
  const look=samplePoint(timeline,Math.min(total,progress+Math.min(65,Math.max(8,total*.008))));
  const backward=samplePoint(timeline,Math.max(0,progress-10));
  return {point,bearing:bearingBetween(backward,look||b),progress,remaining:Math.max(0,total-progress),fraction:total>0?progress/total:1};
}

function samplePoint(timeline,meters){
 const {points,cumulative,total}=timeline;
 if(!points.length)return null;
 const n=clamp(meters,0,total);
 let low=0,high=cumulative.length-1;
 while(low<high){const mid=(low+high)>>1;if(cumulative[mid]<n)low=mid+1;else high=mid;}
 const i=Math.max(1,low),a=points[i-1],b=points[i];if(!b)return points[0];
 const d=cumulative[i]-cumulative[i-1],t=d?clamp((n-cumulative[i-1])/d,0,1):1;
 return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}

export function distanceOnRoute(timeline,position){
 if(!timeline?.points?.length||!validPoint(position))return 0;
 const near=nearestOnRoute(position,{coordinates:timeline.points});
 const at=timeline.cumulative[near.index]||0;
 return clamp(at+metersBetween(timeline.points[near.index],near.point),0,timeline.total);
}

export function previewMetersPerSecond(total,routeMinutes){
 // Demo finishes between 30 and 105 seconds for ordinary trips, independent of the actual ETA.
 const seconds=clamp((Number(routeMinutes)||5)*2.8,30,105);
 return total>0?total/seconds:0;
}

export function nextManeuver(route,timeline,progress){
 const steps=route?.steps||[];
 const items=steps.filter(x=>validPoint(x.location)).map((step,i)=>({...step,at:distanceOnRoute(timeline,step.location),originalIndex:i})).sort((a,b)=>a.at-b.at);
 if(!items.length)return {instruction:'Continue pela rota',distance:0,modifier:'straight',lanes:[]};
 let next=items.find(x=>x.at>=progress+10);
 // Some providers only have a destination instruction, or duplicate beginning coordinates.
 if(!next)next=items.at(-1);
 const distance=Math.max(0,next.at-progress);
 return {instruction:next.instruction||'Continue pela rota',distance,modifier:next.modifier||'straight',lanes:Array.isArray(next.lanes)?next.lanes.slice(0,8):[],street:next.street||'',kind:next.type||'',stepIndex:next.originalIndex};
}
