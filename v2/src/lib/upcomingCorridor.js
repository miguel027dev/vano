import {buildRouteTimeline, sampleRoute, distanceOnRoute} from './routeAnimation.js';
import {validPoint} from './navigationMotion.js';

/** Cache only a short look-ahead corridor; never gate map, GPS, or route start. */
export function upcomingCorridor(geometry, position, aheadMeters=2800){
  if(!validPoint(position))return {points:[],section:-1};
  const timeline=buildRouteTimeline(geometry);
  if(!timeline?.total)return {points:[],section:-1};
  const along=Math.max(0,Math.min(timeline.total,distanceOnRoute(timeline,position)));
  const start=Math.max(0,along-100),end=Math.min(timeline.total,along+aheadMeters);
  const points=[];
  for(let d=start;d<end;d+=230)points.push(sampleRoute(timeline,d).point);
  points.push(sampleRoute(timeline,end).point);
  return {points,section:Math.floor(along/350)};
}
