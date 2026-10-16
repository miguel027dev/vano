/**
 * V2 MAVI point-of-interest navigation. Mapbox Search Box category API only;
 * never trust a free-form search term to identify a POI's type.
 */
import {pointOK} from './routing.mjs';

export const MAVI_POI_CATEGORIES=Object.freeze({
 grocery:{id:'grocery',label:'mercado'},
 pharmacy:{id:'pharmacy',label:'farmácia'},
 hospital:{id:'hospital',label:'hospital'},
 restaurant:{id:'restaurant',label:'restaurante'},
 cafe:{id:'coffee',label:'cafeteria'},
 parking:{id:'parking',label:'estacionamento'}
});
const RAD=Math.PI/180;
export function metersBetween(a,b){
 const dlat=(b[1]-a[1])*RAD,dlon=(b[0]-a[0])*RAD;
 const q=Math.sin(dlat/2)**2+Math.cos(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(q)));
}
function flatten(p,center){
 const cos=Math.cos(center[1]*RAD);
 return [(p[0]-center[0])*111320*cos,(p[1]-center[1])*110540];
}
/** Minimum cross-track distance in meters; global along-route progress in meters. */
export function positionOnRoute(point,points){
 if(!pointOK(point)||!Array.isArray(points)||points.length<2)return null;
 let distance=Infinity,at=0,travelled=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  if(!pointOK(a)||!pointOK(b))return null;
  const [bx,by]=flatten(b,a),[px,py]=flatten(point,a);
  const len=bx*bx+by*by;
  const t=len>0?Math.max(0,Math.min(1,(px*bx+py*by)/len)):0;
  const d=Math.hypot(px-bx*t,py-by*t);
  if(d<distance){distance=d;at=travelled+Math.sqrt(len)*t;}
  travelled+=Math.sqrt(len);
 }
 return {distance,at,total:travelled};
}
export function encodePolyline(points,precision=6){
 const factor=10**precision;
 let prevLat=0,prevLon=0,result='';
 const encode=n=>{
  let v=n<0?~(n<<1):n<<1;
  do{let c=v&31;v>>>=5;if(v>0)c|=32;result+=String.fromCharCode(c+63);}while(v>0);
 };
 for(const [lon,lat] of points){
  const a=Math.round(lat*factor),b=Math.round(lon*factor);
  encode(a-prevLat);encode(b-prevLon);prevLat=a;prevLon=b;
 }
 return result;
}
export function validatePoiRoute(points,origin,destination){
 if(!pointOK(origin)||!pointOK(destination)||!Array.isArray(points)||points.length<2||points.length>160||
   !points.every(pointOK))return false;
 if(metersBetween(points[0],origin)>25000||metersBetween(points.at(-1),destination)>1500)return false;
 let total=0;
 for(let i=1;i<points.length;i++){
  const segment=metersBetween(points[i-1],points[i]);
  if(segment>17000)return false;
  total+=segment;
 }
 return total<=180000;
}
function normalizeFeatures(data,category){
 return (Array.isArray(data?.features)?data.features:[]).filter(f=>{
  const p=f.properties||{};
  return pointOK(f.geometry?.coordinates)&&p.feature_type==='poi'&&
   p.operational_status!=='closed';
 }).map(f=>{
  const p=f.properties||{};
  return {id:'mavi-poi:'+String(p.mapbox_id||'').slice(0,120),
   name:String(p.name_preferred||p.name||'').trim().slice(0,100),
   address:String(p.full_address||p.place_formatted||'').trim().slice(0,160),
   coords:f.geometry.coordinates,category};
 }).filter(p=>p.name&&p.id.length>9);
}
export function rankMaviPlaces(items,{scope,origin,route}){
 const progress=scope==='route'?positionOnRoute(origin,route):null;
 const ranked=[];
 for(const item of items){
  if(!pointOK(item.coords))continue;
  const direct=metersBetween(origin,item.coords);
  const projected=progress?positionOnRoute(item.coords,route):null;
  if(scope==='route'){
   if(!projected||projected.distance>1400||projected.at<progress.at-250)continue;
   if(direct>35000)continue;
  }else if(direct>16000)continue;
  const score=scope==='route'
   ?projected.distance*2.2+Math.max(0,projected.at-progress.at)*.12
   :direct;
  ranked.push({...item,distanceMeters:Math.round(direct),
    corridorMeters:projected?Math.round(projected.distance):null,
    score});
 }
 return ranked.sort((a,b)=>a.score-b.score||a.distanceMeters-b.distanceMeters).slice(0,8)
  .map(({score,...item})=>item);
}
export async function findMaviPlaces({category,scope,origin,route,token,fetcher=fetch}){
 if(!Object.hasOwn(MAVI_POI_CATEGORIES,category)||!pointOK(origin)||!token)
  throw Error('invalid_poi_request');
 if(scope==='route'&&(!Array.isArray(route)||route.length<2))throw Error('invalid_poi_route');
 const id=MAVI_POI_CATEGORIES[category].id;
 const base=new URL('https://api.mapbox.com/search/searchbox/v1/category/'+encodeURIComponent(id));
 base.searchParams.set('access_token',token);base.searchParams.set('language','pt');
 base.searchParams.set('proximity',origin.join(','));base.searchParams.set('limit','25');
 base.searchParams.set('exclude_fields','photos,reviews');
 if(scope==='route'){
  base.searchParams.set('sar_type','isochrone');
  base.searchParams.set('route',encodePolyline(route,6));
  base.searchParams.set('route_geometry','polyline6');
  base.searchParams.set('time_deviation','7');
 }
 let response;
 try{response=await fetcher(base.toString(),{signal:AbortSignal.timeout(7500),headers:{Accept:'application/json'}});}
 catch{throw Error('poi_provider_unavailable');}
 if(!response.ok)throw Error('poi_provider_http_'+response.status);
 const data=await response.json();
 return rankMaviPlaces(normalizeFeatures(data,category),{scope,origin,route});
}
