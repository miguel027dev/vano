/** VANO V2 fast corridor routing: provider-grounded congestion, never fabricated roads.
 * A congested section is guarded along the provider route 500 m BEFORE its
 * beginning and 500 m AFTER its end. Mapbox exclusions are hints, so every
 * returned alternative is independently checked against the entire corridor.
 */
import {meters,uniqueCandidates} from './v1-candidates.mjs';
import {pointOK} from './routing.mjs';

const LABEL_SCORE={heavy:82,severe:96};
const MARGIN_METERS=500;
const RAD=Math.PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function severity(value,label){
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100)return value;
  return LABEL_SCORE[String(label||'').toLowerCase()]??null;
}
function lineGeometry(route){
  const c=route?.geometry?.coordinates;
  if(!Array.isArray(c)||c.length<3||c.length>100000||!c.every(pointOK))return null;
  const cumulative=[0];
  for(let i=1;i<c.length;i++)cumulative.push(cumulative.at(-1)+meters(c[i-1],c[i]));
  return {coords:c,cumulative,total:cumulative.at(-1)};
}
function pointAt(geom,at){
  const {coords,cumulative,total}=geom;
  const distance=clamp(at,0,total);
  let lo=1,hi=cumulative.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<distance)lo=mid+1;else hi=mid;}
  const a=coords[lo-1],b=coords[lo],span=cumulative[lo]-cumulative[lo-1];
  const ratio=span>0?clamp((distance-cumulative[lo-1])/span,0,1):0;
  return [a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
}
function trafficSegments(route){
  const segments=[];let total=0;
  if(!Array.isArray(route?.legs)||!route.legs.length)return null;
  for(const leg of route.legs){
    const a=leg?.annotation||{},dist=a.distance,nums=a.congestion_numeric||[],labels=a.congestion||[];
    if(!Array.isArray(dist)||!dist.length)return null;
    for(let i=0;i<dist.length;i++){
      const d=dist[i],score=severity(nums[i],labels[i]);
      if(!Number.isFinite(d)||d<=0)return null;
      segments.push({start:total,end:total+d,score});total+=d;
    }
  }
  return {segments,total};
}
export function hasTrafficEvidence(route){
  const geo=lineGeometry(route),traffic=trafficSegments(route);
  if(!geo||!traffic||traffic.total<1100)return false;
  const ratio=traffic.total/geo.total;
  const knownMeters=traffic.segments.reduce((n,x)=>n+(x.score!==null?x.end-x.start:0),0);
  // Refuse to call a road traffic-free if most segments are unknown.
  return ratio>=.75&&ratio<=1.35&&knownMeters/traffic.total>=.8;
}
/** Strong contiguous jams only; unknown readings are NOT zero-congestion evidence. */
export function trafficCorridors(route,{marginMeters=MARGIN_METERS,maxHotspots=3}={}){
  const geo=lineGeometry(route),info=trafficSegments(route);
  if(!geo||!info||geo.total<1100||info.total<1100||
    info.total/geo.total<.75||info.total/geo.total>1.35)return [];
  const runs=[];let current=null;
  for(const s of info.segments){
    if(s.score!==null&&s.score>=70){
      if(current&&s.start-current.end<=110){
        current.end=s.end;current.peak=Math.max(current.peak,s.score);
        current.weight+=s.score*(s.end-s.start);current.evidence+=s.end-s.start;
      }else{
        if(current)runs.push(current);
        current={start:s.start,end:s.end,peak:s.score,weight:s.score*(s.end-s.start),evidence:s.end-s.start};
      }
    }else if(current&&s.end-current.end>110){runs.push(current);current=null;}
  }
  if(current)runs.push(current);
  const m=clamp(Number.isFinite(marginMeters)?marginMeters:MARGIN_METERS,0,1000);
  const ratio=geo.total/info.total;
  return runs.filter(x=>x.end-x.start>=220&&x.evidence>=200&&x.weight/x.evidence>=73&&
      // Never block the start or destination of a valid trip.
      x.start>=(m===0?0:m+70)&&info.total-x.end>=(m===0?0:m+70))
    .sort((a,b)=>((b.weight/b.evidence)-65)*Math.sqrt(b.evidence)-
                 ((a.weight/a.evidence)-65)*Math.sqrt(a.evidence))
    .slice(0,Math.max(0,Math.min(4,maxHotspots)))
    .map(h=>{
      const start=(h.start-m)*ratio,end=(h.end+m)*ratio;
      const number=Math.max(2,Math.ceil((end-start)/125));
      const guard=Array.from({length:number+1},(_,i)=>pointAt(geo,start+(end-start)*i/number));
      return {startMeters:Math.round(h.start),endMeters:Math.round(h.end),
        forbiddenStartMeters:Math.round(h.start-m),forbiddenEndMeters:Math.round(h.end+m),
        marginMeters:m,peak:h.peak,weighted:h.weight/h.evidence,
        guard,center:pointAt(geo,(h.start+h.end)*ratio/2),
        startPoint:pointAt(geo,start),endPoint:pointAt(geo,end)};
    });
}
function localMeters(p,lat){
  return [p[0]*111320*Math.max(.25,Math.cos(lat*RAD)),p[1]*111320];
}
function distanceToSegment(p,a,b){
  const tlat=p[1];const P=localMeters(p,tlat),A=localMeters(a,tlat),B=localMeters(b,tlat);
  const dx=B[0]-A[0],dy=B[1]-A[1];
  const t=clamp(((P[0]-A[0])*dx+(P[1]-A[1])*dy)/Math.max(1e-9,dx*dx+dy*dy),0,1);
  return Math.hypot(P[0]-(A[0]+t*dx),P[1]-(A[1]+t*dy));
}
/** Sample each *provider-returned* candidate segment, not only its vertices.
 * An alternative crossing this protected corridor cannot count as a detour.
 */
export function candidateUsesForbiddenCorridor(candidate,corridor,{clearanceMeters=45}={}){
  const coords=candidate?.geometry?.coordinates,guard=corridor?.guard;
  if(!Array.isArray(coords)||coords.length<2||!Array.isArray(guard)||guard.length<2)return true;
  const clearance=clamp(clearanceMeters,15,100);
  for(let i=1;i<coords.length;i++){
    if(!pointOK(coords[i-1])||!pointOK(coords[i]))return true;
    const a=coords[i-1],b=coords[i],n=Math.max(1,Math.ceil(meters(a,b)/35));
    for(let j=0;j<=n;j++){
      const f=j/n,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
      for(let k=1;k<guard.length;k++)
        if(distanceToSegment(p,guard[k-1],guard[k])<=clearance)return true;
    }
  }
  return false;
}
/** Alternative Mapbox requests use up to 14 provider-exclusion points spread
 * along the entire guarded corridor; independent post-validation is mandatory.
 * Each attempt shifts the sampling phase so a single ignored point won't win.
 */
export function bottleneckDetourSpecs(routes,limit=4){
  const ordered=uniqueCandidates(routes,5);
  const corridors=ordered.flatMap(route=>trafficCorridors(route).map(c=>({...c,route})));
  const budget=clamp(Math.trunc(limit)||0,0,8),specs=[],seen=new Set();
  for(const corridor of corridors){
    for(const phase of [0,.5,1]){
      if(specs.length>=budget)break;
      const guard=corridor.guard;
      const take=Math.min(14,Math.max(4,Math.ceil((corridor.forbiddenEndMeters-corridor.forbiddenStartMeters)/220)));
      const points=Array.from({length:take},(_,i)=>{
        const at=clamp((i+phase)/(take-1+phase),0,1)*(guard.length-1);
        return guard[Math.min(guard.length-1,Math.round(at))];
      }).filter((p,i,all)=>i===0||meters(p,all[i-1])>=35);
      const key=points.map(p=>p.map(n=>n.toFixed(5)).join(',')).join('|');
      if(points.length<3||seen.has(key))continue;
      seen.add(key);
      specs.push({kind:'bottleneck-corridor-500m',points,forbiddenCorridor:corridor,
        bottleneckStartMeters:corridor.startMeters,bottleneckEndMeters:corridor.endMeters,
        marginBeforeMeters:MARGIN_METERS,marginAfterMeters:MARGIN_METERS});
    }
    if(specs.length>=budget)break;
  }
  return specs.slice(0,budget);
}
