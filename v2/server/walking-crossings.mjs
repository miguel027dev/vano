/** OSM crossings for an already calculated, real Mapbox walking route.
 * An optional enrichment only: never invents a crossing, changes routes or
 * delays the primary directions request. The feature is queried separately.
 * OSM/Overpass are community data, not verified current street conditions.
 */
import {pointOK} from './routing.mjs';

const ENDPOINT='https://overpass.kumi.systems/api/interpreter';
const CACHE_MS=6*60*1000,MAX_CACHE=45,cache=new Map();
const RAD=Math.PI/180;
function meters(a,b){
 const dy=(b[1]-a[1])*111195,dx=(b[0]-a[0])*111195*Math.cos(a[1]*RAD);
 return Math.hypot(dx,dy);
}
function routeSegments(geometry){
 const c=geometry?.coordinates;if(!Array.isArray(c)||c.length<2||c.length>2500||!c.every(pointOK))return null;
 const segments=[];let length=0;
 for(let i=0;i<c.length-1;i++){
  const [a,b]=[c[i],c[i+1]],d=meters(a,b);
  if(d<0.2||!Number.isFinite(d))continue;
  segments.push({a,b,at:length,length:d});length+=d;
 }
 return length>=15&&length<=7000?{coords:c,segments,total:length}:null;
}
function routeBox(coords){
 let s=90,n=-90,w=180,e=-180;
 for(const [lng,lat] of coords){s=Math.min(s,lat);n=Math.max(n,lat);w=Math.min(w,lng);e=Math.max(e,lng);}
 // An urban walk only. Never issue a huge geographic query to community infrastructure.
 const pad=.00014;
 s-=pad;n+=pad;w-=pad;e+=pad;
 if((n-s)*(e-w)>0.006||n-s>0.09||e-w>0.09)return null;
 return [s,w,n,e];
}
function snap(point,route){
 let best=null,distance=Infinity;
 for(const s of route.segments){
  const scale=Math.max(.1,Math.cos(point[1]*RAD));
  const dx=(s.b[0]-s.a[0])*scale,dy=s.b[1]-s.a[1],q=dx*dx+dy*dy;
  if(q<=0)continue;
  const t=Math.max(0,Math.min(1,((point[0]-s.a[0])*scale*dx+(point[1]-s.a[1])*dy)/q));
  const projected=[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];
  const dist=meters(point,projected);
  if(dist<distance){distance=dist;best={meters:s.at+s.length*t,distance:dist};}
 }
 return best;
}
export function classifyOsmCrossing(tags={}){
 if(tags.highway!=='crossing'||tags['crossing:markings']==='no'||tags.crossing==='unmarked'||tags.crossing==='no')return null;
 const signals=tags.crossing==='traffic_signals'||tags['crossing:signals']==='yes';
 const marked=['yes','zebra','lines','dots','ladder','pictograms'].includes(tags['crossing:markings'])||
   ['marked','zebra','uncontrolled'].includes(tags.crossing)||tags.crossing_ref==='zebra';
 if(!signals&&!marked)return null;
 return {
  type:signals?'signals':'marked',
  label:signals?'Semáforo de pedestres mapeado':'Faixa de pedestres mapeada',
  note:signals?'Observe o sinal para pedestres e confira as condições da travessia.':
    'Confirme as marcações e o trânsito antes de atravessar.',
  source:'OpenStreetMap'
 };
}
export function walkingCrossingsFromOsm(geometry,elements){
 const route=routeSegments(geometry);if(!route||!Array.isArray(elements))return [];
 const matches=[];
 for(const item of elements.slice(0,400)){
  if(item?.type!=='node'||!Number.isInteger(item.id)||!Number.isFinite(item.lat)||!Number.isFinite(item.lon))continue;
  const feature=classifyOsmCrossing(item.tags);if(!feature)continue;
  const point=[item.lon,item.lat],near=snap(point,route);
  // A crossing 20m away may belong to a parallel road, not this walk.
  if(!near||near.distance>9||near.meters<8||near.meters>route.total-7)continue;
  matches.push({...feature,id:'osm-crossing-'+item.id,coords:point,routeMeters:Math.round(near.meters),distanceFromRouteMeters:Math.round(near.distance*10)/10});
 }
 matches.sort((a,b)=>a.routeMeters-b.routeMeters||a.distanceFromRouteMeters-b.distanceFromRouteMeters);
 const result=[];
 for(const item of matches){
  if(result.some(x=>Math.abs(x.routeMeters-item.routeMeters)<19))continue;
  result.push(item);
  if(result.length>=15)break;
 }
 return result;
}
export async function findWalkingCrossings(geometry,{enabled=true,fetcher=fetch,now=Date.now}={}){
 if(!enabled)return [];
 const route=routeSegments(geometry);
 if(!route)return [];
 const bbox=routeBox(route.coords);
 if(!bbox)return [];
 const key=bbox.map(x=>x.toFixed(4)).join(':');
 const old=cache.get(key);
 if(old&&old.until>now())return walkingCrossingsFromOsm(geometry,old.nodes);
 const query='[out:json][timeout:3];node["highway"="crossing"]('+bbox.map(x=>x.toFixed(6)).join(',')+');out body 300;';
 let response;
 try{
  response=await fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},
   body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(2700)});
  if(!response?.ok)return [];
  if(Number(response.headers?.get?.('content-length'))>1_200_000)return [];
  const raw=await response.text();
  if(raw.length>1_200_000)return [];
  const json=JSON.parse(raw);
  if(!Array.isArray(json.elements))return [];
  const nodes=json.elements.slice(0,400);
  cache.set(key,{nodes,until:now()+CACHE_MS});
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  return walkingCrossingsFromOsm(geometry,nodes);
 }catch{return [];} // Never make public routing depend on an OSM availability issue.
}
