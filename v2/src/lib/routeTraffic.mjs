/** Route traffic evidence and paint plan shared by the API and both renderers.
 * Mercator chainage matches Mapbox line-progress; meters remain ground distance.
 * Never changes geometry, routing, speed limits or ETA.
 */
// Orange is the brand's default route, not a claim of measured free flow.
export const TRAFFIC_COLORS=Object.freeze({unknown:'#ff7900',flowing:'#ff7900',slow:'#ff7900',heavy:'#e85c4b',stopped:'#b83240'});
export const TRAFFIC_MAX_AGE=180000;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const trafficPoint=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const xy=p=>[p[0]*Math.PI/180,Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))];
export function trafficRouteIndex(geometry){
 const points=geometry?.type==='LineString'?geometry.coordinates:null;
 if(!Array.isArray(points)||points.length<2||points.length>30000||!points.every(trafficPoint))return null;
 const projected=points.map(xy),units=[0],meters=[0];
 for(let i=1;i<points.length;i++){
  const d=Math.hypot(projected[i][0]-projected[i-1][0],projected[i][1]-projected[i-1][1]);
  units.push(units.at(-1)+d);meters.push(meters.at(-1)+d*6371000*Math.cos((points[i][1]+points[i-1][1])*Math.PI/360));
 }
 if(units.at(-1)<=0||meters.at(-1)>250000)return null;
 return {points,projected,units,meters,total:meters.at(-1),totalUnits:units.at(-1)};
}
export function projectTrafficPoint(index,p){
 if(!index||!trafficPoint(p))return null;
 const q=xy(p);let best=null;
 for(let i=1;i<index.points.length;i++){
  const a=index.projected[i-1],b=index.projected[i],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
  if(!d)continue;
  const t=clamp(((q[0]-a[0])*dx+(q[1]-a[1])*dy)/d,0,1);
  const distance=Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy)*6371000*Math.cos(p[1]*Math.PI/180);
  if(!best||distance<best.distance){
   best={distance,at:index.meters[i-1]+t*(index.meters[i]-index.meters[i-1]),
    progress:(index.units[i-1]+t*Math.sqrt(d))/index.totalUnits,
    point:[index.points[i-1][0]+t*(index.points[i][0]-index.points[i-1][0]),index.points[i-1][1]+t*(index.points[i][1]-index.points[i-1][1])],
    direction:[dx/Math.sqrt(d),dy/Math.sqrt(d)]};
  }
 }
 return best;
}
export function trafficPointAt(index,meters){
 const at=clamp(meters,0,index.total);let i=1;
 while(i<index.meters.length-1&&index.meters[i]<at)i++;
 const t=(at-index.meters[i-1])/Math.max(.0001,index.meters[i]-index.meters[i-1]);
 return index.points[i-1].map((n,k)=>n+t*(index.points[i][k]-n));
}
export function trafficSeverity(ratio){
 return !Number.isFinite(ratio)||ratio<0?'unknown':ratio>=.8?'flowing':ratio>=.5?'slow':ratio>=.22?'heavy':'stopped';
}
/** Conservative LINE match: the complete sampled polyline, its direction and
 * chainage must agree. A point, reverse line or nearby parallel road is not proof.
 */
export function matchTrafficLine(index,geometry){
 const line=geometry?.type==='LineString'?geometry.coordinates:null;
 if(!index||!Array.isArray(line)||line.length<2||line.length>1300||!line.every(trafficPoint))return null;
 const lineIndex=trafficRouteIndex(geometry);if(!lineIndex||lineIndex.total<30)return null;
 const count=Math.min(32,Math.max(3,Math.ceil(lineIndex.total/65)));
 const hits=[];
 for(let i=0;i<=count;i++){
  const at=lineIndex.total*i/count,p=trafficPointAt(lineIndex,at),near=projectTrafficPoint(index,p);
  if(!near||near.distance>8)return null;
  const a=xy(trafficPointAt(lineIndex,Math.max(0,at-8))),b=xy(trafficPointAt(lineIndex,Math.min(lineIndex.total,at+8)));
  const dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy);
  if(norm&&((dx*near.direction[0]+dy*near.direction[1])/norm)<.82)return null;
  if(hits.length&&near.at<hits.at(-1).at-8)return null;
  hits.push(near);
 }
 const first=hits[0],last=hits.at(-1),length=last.at-first.at;
 if(length<30||Math.abs(length-lineIndex.total)>Math.max(25,lineIndex.total*.15))return null;
 // Reject shapes that leave this carriageway between matching endpoints.
 return {start:first.progress,end:last.progress,startMeters:first.at,endMeters:last.at,
  coords:first.point,lengthMeters:Math.round(length)};
}
export function simplifyTrafficGeometry(index,max=650){
 if(!index)return null;
 const stride=Math.max(1,Math.ceil((index.points.length-1)/(max-1)));
 const coordinates=index.points.filter((_,i)=>i%stride===0||i===index.points.length-1)
  .map(p=>p.slice(0,2).map(n=>+n.toFixed(6)));
 return {type:'LineString',coordinates};
}
const ranks={unknown:0,flowing:1,slow:2,heavy:3,stopped:4};
const fresh=(value,now)=>Number.isFinite(value)&&value<=now+30000&&now-value<TRAFFIC_MAX_AGE;
export function routeTrafficEvidence(index,payload,now=Date.now()){
 const segments=[],events=[],incidentIds=[];
 if(!index||!fresh(payload?.sampledAt,now))return {segments,events,incidentIds};
 for(const reading of (payload.flow||[]).slice(0,12)){
  if(!fresh(reading.observedAt,now)||!(reading.confidence>=.65&&reading.confidence<=1)||
   !Number.isFinite(reading.currentKmh)||reading.currentKmh<0||!Number.isFinite(reading.freeFlowKmh)||reading.freeFlowKmh<=0)continue;
  const match=matchTrafficLine(index,reading.geometry);if(!match)continue;
  const severity=reading.roadClosure?'stopped':trafficSeverity(reading.currentKmh/reading.freeFlowKmh);
  segments.push({...match,severity});
  if(ranks[severity]>=2)events.push({...match,id:'flow-'+Math.round(match.startMeters/30),category:reading.roadClosure?'roadclosed':'jam',
   name:reading.roadClosure?'Via interditada':severity==='slow'?'Trânsito lento':'Trânsito intenso',source:'TomTom Traffic Flow',severity,
   currentKmh:reading.currentKmh,freeFlowKmh:reading.freeFlowKmh,delaySeconds:null});
 }
 for(const incident of (payload.incidents||[]).slice(0,120)){
  if(incident.endsAt&&Date.parse(incident.endsAt)<now)continue;
  const match=matchTrafficLine(index,incident.roadGeometry);if(!match)continue;
  incidentIds.push(incident.id);
  const category=incident.incidentCategory;
  const event={...match,id:incident.id,category,name:incident.name,description:incident.description,
   source:'TomTom Traffic',severity:category==='roadclosed'?'stopped':'heavy',
   delaySeconds:incident.delaySeconds>0?incident.delaySeconds:null};
  // The incident describes the cause. Replace overlapping generic jam bubbles.
  for(let i=events.length-1;i>=0;i--)if(events[i].category==='jam'&&events[i].end>match.start&&events[i].start<match.end)events.splice(i,1);
  events.push(event);
 }
 events.sort((a,b)=>a.startMeters-b.startMeters);
 const grouped=[];
 for(const event of events){
  const previous=grouped.at(-1);
  if(previous?.category===event.category&&event.startMeters<=previous.endMeters+100){
   previous.endMeters=Math.max(previous.endMeters,event.endMeters);previous.end=Math.max(previous.end,event.end);
   previous.lengthMeters=Math.round(previous.endMeters-previous.startMeters);
   // Never sum overlapping provider delays.
   previous.delaySeconds=Math.max(previous.delaySeconds||0,event.delaySeconds||0)||null;
  }else grouped.push({...event});
 }
 return {segments,events:grouped,incidentIds};
}
function stateAt(segments,t){
 let state='unknown';for(const s of segments)if(t>=s.start&&t<=s.end&&ranks[s.severity]>ranks[state])state=s.severity;
 return state;
}
/** Short blend bands at evidence boundaries; not a start-to-finish gradient.
 * Stops use projected progress, including curved and north/south routes.
 */
export function routeTrafficStops(index,segments=[]){
 if(!index)return [[0,TRAFFIC_COLORS.unknown],[1,TRAFFIC_COLORS.unknown]];
 const edges=[0,1,...segments.flatMap(s=>[s.start,s.end])].filter(n=>Number.isFinite(n)&&n>=0&&n<=1).sort((a,b)=>a-b);
 const unique=[...new Set(edges)],stops=[[0,TRAFFIC_COLORS[stateAt(segments,0)]]];
 for(let i=1;i<unique.length-1;i++){
  const edge=unique[i],left=stateAt(segments,(unique[i-1]+edge)/2),right=stateAt(segments,(edge+unique[i+1])/2);
  if(left===right)continue;
  const width=Math.min(18/index.total,(edge-unique[i-1])*.22,(unique[i+1]-edge)*.22);
  stops.push([edge-width,TRAFFIC_COLORS[left]],[edge,blendColor(TRAFFIC_COLORS[left],TRAFFIC_COLORS[right],.5)],[edge+width,TRAFFIC_COLORS[right]]);
 }
 stops.push([1,TRAFFIC_COLORS[stateAt(segments,1)]]);
 return stops;
}
export const routeTrafficGradient=stops=>['interpolate',['linear'],['line-progress'],...stops.flatMap(([at,color])=>[at,color])];
export function blendColor(a,b,t){
 const rgb=color=>color.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));const aa=rgb(a),bb=rgb(b);
 return '#'+aa.map((n,i)=>Math.round(n+(bb[i]-n)*t).toString(16).padStart(2,'0')).join('');
}
export function trafficColorAt(stops,t){
 let i=0;while(i<stops.length-2&&stops[i+1][0]<t)i++;
 const [a,ca]=stops[i],[b,cb]=stops[i+1];return blendColor(ca,cb,clamp((t-a)/Math.max(.000001,b-a),0,1));
}
export function upcomingTrafficEvents(events,meters=0,{zoom=16,limit=3}={}){
 const ahead=events.filter(e=>e.endMeters>meters+15),chosen=[];
 const spacing=zoom<14?650:zoom<16?260:90;
 // Closures have priority where bubbles would collide; order remains along-route.
 const priority=e=>e.category==='roadclosed'?5:e.category==='accident'?4:e.category==='jam'?2:3;
 for(const event of ahead){
  const near=chosen.findIndex(e=>Math.abs(e.startMeters-event.startMeters)<spacing);
  if(near>=0){if(priority(event)>priority(chosen[near]))chosen[near]=event;continue;}
  if(chosen.length<limit)chosen.push(event);
 }
 return chosen.sort((a,b)=>a.startMeters-b.startMeters);
}
