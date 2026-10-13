import {buildRouteTimeline,sampleRoute} from './routeAnimation.js';
/** Sample along the line, rather than its bounding box or a straight line to the destination. */
export function corridorPoints(geometry){const timeline=buildRouteTimeline(geometry);if(timeline.points.length<2)return [];const count=Math.max(1,Math.ceil(timeline.total/350));if(count>2000)throw Error('Trajeto muito longo para salvar o mapa completo neste aparelho.');const points=[];for(let i=0;i<=count;i++)points.push(sampleRoute(timeline,timeline.total*i/count).point);return points;}
