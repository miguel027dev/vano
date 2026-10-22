/** VANO V2 fast route: look for real, sufficiently evidenced traffic bottlenecks.
 * Each proposed exclusion is sent to Mapbox for a COMPLETE legal route.
 * Never stitch raw polylines, estimate an unobserved delay, or retain traffic data.
 */
import {meters,uniqueCandidates} from './v1-candidates.mjs';
import {pointOK} from './routing.mjs';

const RAD=Math.PI/180;
const LABEL_SCORE={heavy:82,severe:96};
function severity(numeric,label){
  if(typeof numeric==='number'&&Number.isFinite(numeric)&&numeric>=0&&numeric<=100)
    return numeric;
  return LABEL_SCORE[String(label||'').toLowerCase()]??null;
}
function pointAt(coords,cumulative,target){
  const length=cumulative.at(-1);
  if(!Number.isFinite(target)||!length)return null;
  const distance=Math.max(0,Math.min(length,target));
  let lo=1,hi=cumulative.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<distance)lo=mid+1;else hi=mid;}
  const d=cumulative[lo]-cumulative[lo-1],a=coords[lo-1],b=coords[lo];
  if(!a||!b)return null;
  const t=d>0?(distance-cumulative[lo-1])/d:0;
  const result=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  return pointOK(result)?result:null;
}
/** Returns a small number of upstream + hotspot exclusions, prioritized by
 * congestion severity and affected distance, not by arbitrary route fractions.
 * "upstream" is an exclusion probe, NOT a promised exit or maneuver.
 */
export function bottleneckDetourSpecs(routes,limit=4){
  const base=uniqueCandidates(routes,1)[0];
  const coords=base?.geometry?.coordinates;
  if(!base||base.duration<300||base.distance<1200||!Array.isArray(coords)||coords.length<3)return [];
  const cumulative=[0];
  for(let i=1;i<coords.length;i++)cumulative.push(cumulative.at(-1)+meters(coords[i-1],coords[i]));
  const geometryLength=cumulative.at(-1);
  if(!Number.isFinite(geometryLength)||geometryLength<1100)return [];

  const segments=[];let offset=0;
  for(const leg of base.legs||[]){
    const a=leg.annotation||{},dist=a.distance||[],numeric=a.congestion_numeric||[],labels=a.congestion||[];
    // Distance + traffic evidence must be aligned; an unknown reading is not congestion.
    if(!Array.isArray(dist))return [];
    for(let i=0;i<dist.length;i++){
      const d=dist[i],score=severity(numeric[i],labels[i]);
      if(typeof d!=='number'||!Number.isFinite(d)||d<=0)return [];
      segments.push({start:offset,end:offset+d,score});
      offset+=d;
    }
  }
  if(offset<1100||offset/geometryLength<.75||offset/geometryLength>1.35)return [];
  const hotspots=[];let current=null;
  for(const edge of segments){
    if(edge.score!==null&&edge.score>=70){
      if(current&&edge.start-current.end<=110){
        current.end=edge.end;current.peak=Math.max(current.peak,edge.score);
        current.weighted+=edge.score*(edge.end-edge.start);
        current.evidenceMeters+=edge.end-edge.start;
      }else{
        if(current)hotspots.push(current);
        current={start:edge.start,end:edge.end,peak:edge.score,
          weighted:edge.score*(edge.end-edge.start),evidenceMeters:edge.end-edge.start};
      }
    }else if(current&&edge.end-current.end>110){
      hotspots.push(current);current=null;
    }
  }
  if(current)hotspots.push(current);
  const strong=hotspots.filter(h=>h.end-h.start>=220&&h.evidenceMeters>=200&&
    h.weighted/h.evidenceMeters>=73&&h.start>=180&&h.end<=offset-70)
    .sort((a,b)=>((b.weighted/b.evidenceMeters)-65)*Math.sqrt(b.evidenceMeters)-
                  ((a.weighted/a.evidenceMeters)-65)*Math.sqrt(a.evidenceMeters))
    .slice(0,3);
  const result=[],seen=new Set(),budget=Math.max(0,Math.min(8,Math.trunc(limit)||0));
  const put=(positions,h,lead)=>{
    if(result.length>=budget)return;
    const points=positions.map(x=>pointAt(coords,cumulative,x/offset*geometryLength));
    if(points.some(x=>!x)||points.some((x,i)=>i&&meters(points[i-1],x)<90))return;
    const key=points.map(p=>p.map(n=>n.toFixed(4)).join(',')).join('|');
    if(seen.has(key))return;
    seen.add(key);
    result.push({points,kind:'bottleneck-early-escape',
      bottleneckStartMeters:Math.round(h.start),bottleneckEndMeters:Math.round(h.end),
      leadMeters:Math.round(lead)});
  };
  for(const h of strong){
    if(result.length>=budget)break;
    const length=h.end-h.start;
    const center=h.start+length*.5;
    // Alternative lead-in distances search departures ahead of the congestion.
    for(const requestedLead of [1000,500,300]){
      if(result.length>=budget)break;
      const lead=Math.min(requestedLead,h.start-90);
      if(lead<150)continue;
      put([h.start-lead,center],h,lead);
    }
    if(result.length<budget&&length>=650)
      put([h.start+length*.20,h.start+length*.78],h,0);
  }
  return result.slice(0,budget);
}
