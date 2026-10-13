/** Port of the V1 Mapbox-only ETA candidate policy.
 * Geometry is always returned by the routing provider; no straight-line shortcuts.
 * Source: V1 vano/services/routing.py, traffic and dense micro-route pool (V88).
 */
import {createHash} from 'node:crypto';
import {pointOK} from './routing.mjs';
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const good=r=>r?.geometry?.type==='LineString'&&Array.isArray(r.geometry.coordinates)&&r.geometry.coordinates.length>=2&&r.geometry.coordinates.every(pointOK)&&Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.distance)&&r.distance>0;
const rad=Math.PI/180;
export function meters(a,b){
  const dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad;
  const t=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(t)));
}
export function signature(route){
  const coords=route?.geometry?.coordinates||[];
  if(!coords.length)return '';
  const stride=Math.max(1,Math.floor(coords.length/18));
  const seed=coords.filter((_,i)=>i%stride===0).slice(0,20).map(p=>p.map(x=>Number(x).toFixed(4)).join(',')).join('|');
  return createHash('sha256').update(seed).digest('hex').slice(0,18);
}
export function uniqueCandidates(routes,max=18){
  const exact=new Map();
  for(const r of routes||[]){
    if(!good(r))continue;
    const id=signature(r);
    const previous=exact.get(id);
    if(!previous||r.duration<previous.duration)exact.set(id,r);
  }
  return [...exact.values()].sort((a,b)=>a.duration-b.duration).slice(0,max);
}
export function overlap(a,b){
  const cells=r=>{
    const coords=r?.geometry?.coordinates||[];
    if(!coords.length)return new Set();
    const lat=coords.reduce((s,p)=>s+p[1],0)/coords.length;
    const dy=Math.max(.00012,72/110540),dx=Math.max(.00012,72/(111320*Math.max(.22,Math.cos(lat*rad))));
    const stride=Math.max(1,Math.floor(coords.length/700));
    const key=p=>Math.round(p[1]/dy)+':'+Math.round(p[0]/dx);
    return new Set([...coords.filter((_,i)=>i%stride===0),coords.at(-1)].map(key));
  };
  const x=cells(a),y=cells(b);
  if(!x.size||!y.size)return signature(a)===signature(b)?1:0;
  let intersection=0;for(const c of x)if(y.has(c))intersection++;
  return intersection/Math.max(1,Math.min(x.size,y.size));
}
const congestionWeights={unknown:15,low:15,moderate:48,heavy:76,severe:94};
export function traffic(route){
  const samples=[];
  for(const leg of route?.legs||[]){
    const ann=leg.annotation||{},d=ann.distance||[],cn=ann.congestion_numeric||[],c=ann.congestion||[];
    let start=samples.length?samples.at(-1).end:0;
    for(let i=0;i<Math.max(d.length,cn.length,c.length);i++){
      const dist=Math.max(.2,n(d[i])||1),label=String(c[i]||'unknown').toLowerCase();
      const score=Number.isFinite(cn[i])?Math.max(0,Math.min(100,cn[i])):(congestionWeights[label]??20);
      samples.push({start,end:start+dist,distance:dist,score,label});start+=dist;
    }
  }
  if(!samples.length)return {score:0,severe:0,clusters:[],hasTraffic:false};
  const total=samples.reduce((s,x)=>s+x.distance,0);
  const score=samples.reduce((s,x)=>s+x.score*x.distance,0)/Math.max(total,1);
  const heavy=samples.filter(x=>x.score>=65||['heavy','severe'].includes(x.label));
  const merged=[];
  for(const edge of heavy){
    if(merged.length&&edge.start-merged.at(-1).end<=140){
      const last=merged.at(-1);last.end=edge.end;last.score=Math.max(last.score,edge.score);
    }else merged.push({start:edge.start,end:edge.end,score:edge.score});
  }
  const coords=route?.geometry?.coordinates||[];
  const cumulative=[0];for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+meters(coords[i-1],coords[i]));
  const length=cumulative.at(-1)||1;
  function pointAt(providerMeters){
    const target=Math.max(0,Math.min(length,providerMeters/Math.max(total,1)*length));
    let left=1,right=cumulative.length-1;
    while(left<right){const mid=(left+right)>>1;if(cumulative[mid]<target)left=mid+1;else right=mid;}
    return coords[Math.max(0,Math.min(coords.length-1,left))];
  }
  const clusters=merged.map(x=>{
    const point=pointAt((x.start+x.end)/2);
    return {point,score:x.score,start:x.start,end:x.end,priority:x.score*Math.min(2.2,.75+(x.end-x.start)/550)};
  }).filter(x=>pointOK(x.point)).sort((a,b)=>b.priority-a.priority).slice(0,6);
  return {score,severe:heavy.length,clusters,hasTraffic:true};
}
export function denseSpecs(routes,limit=8){
  const ranked=uniqueCandidates(routes),base=ranked[0];
  if(!base||base.duration<300)return [];
  const t=traffic(base);
  if(t.score<34&&t.severe===0)return [];
  const dyn=t.score>=82||t.severe>=5?6:t.score>=68||t.severe>=3?5:t.score>=52||t.severe>=2?4:2;
  const budget=Math.min(Math.max(2,Math.min(12,limit)),dyn);
  const seeds=[];for(const r of ranked){if(seeds.every(x=>overlap(x,r)<.965))seeds.push(r);if(seeds.length>=2)break;}
  const all=[],seen=new Set();
  function add(points,kind){
    const clean=[];
    for(const p of points){if(pointOK(p)&&clean.every(q=>meters(p,q)>55))clean.push(p);}
    if(!clean.length)return;
    const key=clean.map(p=>p.map(x=>x.toFixed(4)).join(',')).join('|');
    if(seen.has(key))return;seen.add(key);all.push({points:clean.slice(0,4),kind});
  }
  for(const [si,r] of seeds.entries()){
    const c=traffic(r).clusters;
    for(const p of c.slice(0,4))add([p.point],'block');
    for(let i=0;i<Math.min(3,c.length-1);i++)add([c[i].point,c[i+1].point],'adjacent-blocks');
    for(let i=0;i<Math.min(2,c.length-2);i++)add(c.slice(i,i+3).map(x=>x.point),'short-corridor');
    for(let i=0;i<Math.min(2,c.length-2);i++)add([c[i].point,c[i+2].point],'parallel-blocks');
    if(si===0&&t.score>=58&&c.length>=4)add([c[0].point,c[2].point,c[3].point],'corridor-escape');
  }
  return all.slice(0,budget);
}
export function adaptiveSpecs(routes,budget=2){
  const ranked=uniqueCandidates(routes),base=ranked[0];if(!base||base.duration<420)return [];
  const t=traffic(base);
  if(t.score<42&&t.severe===0)return [];
  const diverse=[];for(const r of ranked){if(diverse.every(x=>overlap(x,r)<.91))diverse.push(r);}
  if(diverse.length>=3)return [];
  const coords=base.geometry.coordinates;
  if(coords.length<10)return [];
  const fractions=[.24,.40,.56,.72,.84];
  return fractions.slice(0,Math.max(1,Math.min(2,budget))).map(f=>({points:[coords[Math.floor((coords.length-1)*f)]],kind:'adaptive'}));
}
