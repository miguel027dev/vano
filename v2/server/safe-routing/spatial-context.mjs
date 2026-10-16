/** Public infrastructure geometry operations; historical hazards are context only. */
import {routeLineJson} from './lighting-postgis.mjs';
export function geometryBounds(geometry){
 const box=[Infinity,Infinity,-Infinity,-Infinity];let vertices=0;
 function walk(c){if(!Array.isArray(c)||!c.length)throw Error('Geometria vazia');
  if(typeof c[0]==='number'){
   if(!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<-46.98||c[0]>-46.2||c[1]<-24.11||c[1]>-23.23)throw Error('Geometria fora de SP');
   if(++vertices>500000)throw Error('Geometria excessiva');
   box[0]=Math.min(box[0],c[0]);box[1]=Math.min(box[1],c[1]);box[2]=Math.max(box[2],c[0]);box[3]=Math.max(box[3],c[1]);
  }else c.forEach(walk);
 }
 walk(geometry?.coordinates);return box;
}
export function geometryTiles(geometry){
 const b=geometryBounds(geometry),keys=[];
 for(let x=Math.floor(b[0]*50);x<=Math.floor(b[2]*50);x++)for(let y=Math.floor(b[1]*50);y<=Math.floor(b[3]*50);y++){
  if(keys.length>=500)throw Error('Geometria cobre áreas demais');keys.push(`${x}_${y}`);
 }
 return keys;
}
export const meters=(a,b)=>Math.hypot((a[0]-b[0])*102000,(a[1]-b[1])*111320);
function segmentDistance(p,a,b){
 const ax=(a[0]-p[0])*102000,ay=(a[1]-p[1])*111320,bx=(b[0]-p[0])*102000,by=(b[1]-p[1])*111320;
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(ax+t*dx,ay+t*dy);
}
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
function inPolygon(p,rings){return rings.length&&inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r));}
export function pointGeometryDistance(p,g){
 if(g.type==='Point')return meters(p,g.coordinates);
 if(g.type==='MultiPoint'){let best=Infinity;for(const c of g.coordinates)best=Math.min(best,meters(p,c));return best;}
 if(g.type==='Polygon'&&inPolygon(p,g.coordinates))return 0;
 if(g.type==='MultiPolygon'&&g.coordinates.some(r=>inPolygon(p,r)))return 0;
 const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'||g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
 let best=Infinity;for(const line of lines)for(let i=1;i<line.length;i++)best=Math.min(best,segmentDistance(p,line[i-1],line[i]));
 return best;
}
export function sampleRoute(route){
 const coordinates=JSON.parse(routeLineJson(route)).coordinates,samples=[];let total=0,next=0;
 for(let i=1;i<coordinates.length;i++){
  const a=coordinates[i-1],b=coordinates[i],length=meters(a,b);
  if(length>10000)throw Error('Segmento excessivo');
  while(next<=total+length&&samples.length<401){const t=length?Math.max(0,(next-total)/length):0;
   samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);next+=50;}
  total+=length;
 }
 if(total>20000||!samples.length)throw Error('Extensão excessiva');return {samples,lengthMeters:Math.round(total)};
}
export function inspectLayer(route,features,{radius=25,key}={}){
 if(!Array.isArray(features)||features.length>150000||!Number.isFinite(radius)||radius<0||radius>100)throw Error('Consulta excessiva');
 const {samples,lengthMeters}=sampleRoute(route),hits=new Map();let covered=0;
 const deadline=Date.now()+1500;
 // 0.002° local cells bound candidates for every 50m sample.
 const cells=new Map();let references=0,comparisons=0;
 for(const f of features){const b=f.bbox||geometryBounds(f.geometry);
  if(Date.now()>deadline)throw Error('Tempo de análise espacial excedido');
  const minX=Math.floor(b[0]*500),maxX=Math.floor(b[2]*500),minY=Math.floor(b[1]*500),maxY=Math.floor(b[3]*500);
  if((maxX-minX+1)*(maxY-minY+1)>10000)throw Error('Feição excessiva');
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(++references>1000000)throw Error('Índice local excessivo');const id=`${x}_${y}`;if(!cells.has(id))cells.set(id,[]);cells.get(id).push(f);}
 }
 for(const p of samples){const x=Math.floor(p[0]*500),y=Math.floor(p[1]*500);let near=false;const visited=new Set();
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const f of cells.get(`${x+dx}_${y+dy}`)||[]){
   if(visited.has(f.id))continue;visited.add(f.id);
   if(++comparisons>2000000)throw Error('Consulta excessiva');
   if(comparisons%128===0&&Date.now()>deadline)throw Error('Tempo de análise espacial excedido');
   if(pointGeometryDistance(p,f.geometry)<=radius){near=true;hits.set(f.id,f);}
  }
  if(near)covered++;
 }
 const matched=[...hits.values()],details=matched.slice(0,12).map(f=>({id:f.id,...f.properties}));
 return {key,matchedFeatures:matched.length,assessedSamples:samples.length,nearSamples:covered,
  proximityFraction:+(covered/samples.length).toFixed(4),assessedMeters:lengthMeters,radiusMeters:radius,details,
  ...(key==='floodHistory'||key==='hydrologicalRisk'?{currentFloodConfirmed:false,usedForRanking:false}:{associationConfirmed:false})};
}
