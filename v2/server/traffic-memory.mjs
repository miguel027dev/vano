/** VANO V2 Traffic Memory — direction-aware, bounded historical route evidence.
 * No user locations are stored. No remote calls on the routing hot path.
 * Historical snapshots are opt-in and must contain legitimately reusable speed observations.
 * CET 2001-2018 and GeoSampa infrastructure do NOT count as current speed samples.
 */
import {readFile, stat} from 'node:fs/promises';

const SP={west:-46.84,east:-46.36,south:-23.84,north:-23.34};
const RAD=Math.PI/180, CELL=.001, MAX_RECORDS=20000, MAX_BYTES=5*1024*1024;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite)&&p[0]>=SP.west&&p[0]<=SP.east&&p[1]>=SP.south&&p[1]<=SP.north;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const meters=(a,b)=>Math.hypot((b[0]-a[0])*111320*Math.cos((a[1]+b[1])*.5*RAD),(b[1]-a[1])*110540);
const key=(x,y)=>Math.floor(x/CELL)+':'+Math.floor(y/CELL);
function angle(a,b){return Math.abs(((a-b+540)%360)-180);}
function bearing(a,b){return Math.atan2((b[0]-a[0])*Math.cos((a[1]+b[1])*.5*RAD),(b[1]-a[1]))/RAD;}
function pointToLine(p,a,b){
 const sx=111320*Math.cos(p[1]*RAD),sy=110540;
 const vx=(b[0]-a[0])*sx,vy=(b[1]-a[1])*sy,len2=vx*vx+vy*vy;
 const u=len2>0?clamp((((p[0]-a[0])*sx)*vx+((p[1]-a[1])*sy)*vy)/len2,0,1):0;
 return Math.hypot((p[0]-a[0])*sx-u*vx,(p[1]-a[1])*sy-u*vy);
}
function slotFor(ms){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday);
 return {day,slot:Math.floor((Number(p.hour)*60+Number(p.minute))/15)};
}
function normalize(item,now){
 const c=item?.coordinates;
 if(!Array.isArray(c)||c.length!==2||!c.every(point)||meters(c[0],c[1])<20||
  meters(c[0],c[1])>2200)return null;
 if(!Number.isInteger(item.weekday)||item.weekday<0||item.weekday>6||
  !Number.isInteger(item.quarter)||item.quarter<0||item.quarter>95)return null;
 if(!finite(item.speedKmh)||item.speedKmh<=1||item.speedKmh>130||
  !finite(item.freeFlowKmh)||item.freeFlowKmh<8||item.freeFlowKmh>150||
  item.speedKmh>=item.freeFlowKmh*.9)return null;
 const date=Date.parse(item.lastObservedAt);
 if(!Number.isFinite(date)||date>now+60000||now-date>60*86400000)return null;
 if(!Number.isInteger(item.samples)||item.samples<12||item.samples>1000000||
  item.licenseVerified!==true||typeof item.source!=='string'||!item.source.trim()||
  !/^[a-z0-9:._-]{4,70}$/i.test(item.id||''))return null;
 // Third-party data may be stored only if its own terms explicitly permit this.
 return {id:item.id,coords:c,day:item.weekday,quarter:item.quarter,
  speed:item.speedKmh,freeFlow:item.freeFlowKmh,samples:item.samples,
  timestamp:date,source:item.source.slice(0,70),length:meters(c[0],c[1]),
  bearing:bearing(c[0],c[1])};
}
export function buildTrafficMemory(snapshot,{now=Date.now()}={}){
 const rows=Array.isArray(snapshot?.records)?snapshot.records:[];
 if(rows.length>MAX_RECORDS)throw Error('traffic-memory-snapshot-too-large');
 const groups=new Map(),ids=new Set();
 for(const row of rows){
  const v=normalize(row,now);if(!v||ids.has(v.id+':'+v.day+':'+v.quarter))continue;
  ids.add(v.id+':'+v.day+':'+v.quarter);
  const group=v.day+':'+v.quarter;
  let table=groups.get(group);if(!table){table=new Map();groups.set(group,table);}
  const [[ax,ay],[bx,by]]=v.coords,buffer=.00045;
  for(let x=Math.floor((Math.min(ax,bx)-buffer)/CELL);x<=Math.floor((Math.max(ax,bx)+buffer)/CELL);x++){
   for(let y=Math.floor((Math.min(ay,by)-buffer)/CELL);y<=Math.floor((Math.max(ay,by)+buffer)/CELL);y++){
    const k=x+':'+y;
    if(!table.has(k))table.set(k,[]);
    table.get(k).push(v);
   }
  }
 }
 return {groups,recordCount:ids.size,sourceCount:new Set(rows.map(r=>r.source).filter(Boolean)).size};
}
function estimate(route,memory,departMs,now){
 const coords=route?.geometry?.coordinates;
 if(!Array.isArray(coords)||coords.length<2||coords.length>20000||!coords.every(point))return null;
 const duration=finite(route.durationSeconds)?route.durationSeconds:route.duration*60;
 if(!finite(duration)||duration<30||duration>86400)return null;
 let total=0;
 for(let i=1;i<coords.length;i++)total+=meters(coords[i-1],coords[i]);
 if(total<100||total>150000)return null;
 const live=route.trafficDataStatus==='traffic-aware',seen=new Set();
 let along=0,seconds=0,matched=0;
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i],len=meters(a,b);
  if(len<2){continue;}
  const n=Math.min(35,Math.max(1,Math.ceil(len/110)));
  for(let k=0;k<n;k++){
   const f=(k+.5)/n,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
   const arrival=departMs+((along+len*f)/total)*duration*1000;
   const {day,slot}=slotFor(arrival);
   const cells=memory.groups.get(day+':'+slot);
   if(!cells)continue;
   const neighbors=cells.get(key(p[0],p[1]))||[];
   let best=null,bestDistance=35;
   const heading=bearing(a,b);
   for(const r of neighbors){
    if(seen.has(r.id)||angle(heading,r.bearing)>32)continue;
    const distance=pointToLine(p,r.coords[0],r.coords[1]);
    if(distance<bestDistance){best=r;bestDistance=distance;}
   }
   if(!best)continue;
   seen.add(best.id);
   const ageDays=(now-best.timestamp)/86400000;
   const confidence=(best.samples/(best.samples+30))*Math.exp(-ageDays/90);
   const usedMeters=Math.min(best.length,Math.max(30,len/n));
   const delay=(usedMeters/1000)*(3600/best.speed-3600/best.freeFlow);
   // Mapbox driving-traffic already includes near-term congestion. Only a
   // conservative future-arrival correction is permissible (no double count).
   const minutesAhead=(arrival-now)/60000;
   const strength=live?(minutesAhead>=15?.25:0):1;
   seconds+=Math.max(0,delay)*confidence*strength;
   matched++;
  }
  along+=len;
 }
 return {seconds:Math.min(seconds,duration*.18),matched,providerSeconds:duration};
}
export function assessTrafficMemory(result,memory,{departAt=Date.now(),now=Date.now(),mode='shadow'}={}){
 if(!result||result.source!=='mapbox-v1-candidates'||!['shadow','on'].includes(mode)||
  !memory?.recordCount)return result;
 const routes=Array.isArray(result.routes)?result.routes:[];
 const safe=routes.find(x=>x.id==='safe'),fast=routes.find(x=>x.id==='fast');
 if(!safe||!fast)return result;
 const start=Number.isFinite(departAt)?departAt:Date.parse(departAt);
 const departure=Number.isFinite(start)&&start>=now-60000&&start<=now+7*86400000?start:now;
 const pool=[safe,fast,...(result.safeCandidatePool||[]).slice(0,10)].filter(r=>r?.geometry);
 const scored=pool.map(route=>({route,evidence:estimate(route,memory,departure,now)}))
  .filter(x=>x.evidence);
 if(scored.length<2)return result;
 const maxSeconds=(fast.durationSeconds||fast.duration*60)*1.12;
 const eligible=scored.filter(x=>x.evidence.providerSeconds<=maxSeconds);
 eligible.sort((a,b)=>a.evidence.providerSeconds+a.evidence.seconds-(b.evidence.providerSeconds+b.evidence.seconds));
 const baseline=scored.find(x=>x.route===safe),best=eligible[0];
 const baselineCost=baseline?.evidence.providerSeconds+baseline?.evidence.seconds;
 const bestCost=best?.evidence.providerSeconds+best?.evidence.seconds;
 const switchable=mode==='on'&&best&&best.route!==safe&&best.route!==fast&&
  best.evidence.matched>=1&&baseline?.evidence?.matched>=1&&
  baselineCost-bestCost>=45&&best.evidence.providerSeconds<=maxSeconds;
 const next=routes.map(r=>r.id==='safe'&&switchable?{
  ...best.route,id:'safe',label:'Alternativa',verifiedSafety:false,
  trafficMemorySelected:true
 }:r);
 return {...result,routes:next,trafficMemory:{
  mode,matchedCandidates:scored.filter(x=>x.evidence.matched>0).length,
  observationsAvailable:memory.recordCount,selectedAlternative:Boolean(switchable),
  // Data quality is not a live-traffic assertion; does not modify fast ETA.
  note:'Padrões históricos direcionais, com amostras recentes e verificação de licença. ETA oficial permanece inalterado.'
 }};
}
export function createTrafficMemoryReader(path,{clock=Date.now}={}){
 let current={groups:new Map(),recordCount:0},lastCheck=0,inFlight=null;
 return {get(){const now=clock();
  if(typeof path==='string'&&path&&now-lastCheck>=60000&&!inFlight){
   lastCheck=now;
   inFlight=(async()=>{
    const info=await stat(path);
    if(info.size>MAX_BYTES)throw Error('traffic-memory-file-too-large');
    const data=JSON.parse(await readFile(path,'utf8'));
    current=buildTrafficMemory(data,{now:clock()});
   })().catch(()=>{/* unavailable snapshot must never interrupt navigation */})
    .finally(()=>{inFlight=null;});
  }
  return current;
 }};
}
