/** Visible street name cards for the actual vector roads in the viewport.
 * This is a visual map annotation, NOT a route graph or historical data source.
 * Never stores Mapbox feature geometries or GPS, never invents a street name.
 */
import {metersBetween,validPoint} from './navigationMotion.js';

const ROAD_TOKEN=/(?:^|[-_])(road|street|highway|motorway|transportation)(?:[-_]|$)/i;
const UNKNOWN=/^(?:unnamed(?: road)?|unknown|road|route|street|sem nome|rua sem nome|via sem nome|desconhecid[ao]|—|-)$/i;
const MAX_FEATURES=1100, MAX_POINTS=180;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export function safeStreetName(properties={}){
 const raw=['name_pt','name:pt','name_pt-BR','name','name_local','name_en']
  .map(key=>properties?.[key]).find(v=>typeof v==='string'&&v.trim());
 if(typeof raw!=='string')return '';
 const name=raw.replace(/\s+/g,' ').trim();
 return name.length>=3&&name.length<=86&&!UNKNOWN.test(name)&&
   !/[<>\u0000-\u001f\u007f]/.test(name)?name:'';
}
const avenue=name=>/^(?:av\.?\s|avenida\s)/i.test(name);
const keyOf=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/\s+/g,' ').trim();
export function isNamedRoadFeature(f){
 const layer=f?.layer||{},sourceLayer=String(f?.sourceLayer||layer['source-layer']||'');
 if(!['line','symbol'].includes(layer.type)||!ROAD_TOKEN.test(layer.id||'')&&!ROAD_TOKEN.test(sourceLayer))return false;
 if(String(layer.id||'').startsWith('vano-'))return false;
 const kind=f?.geometry?.type;
 if(!['LineString','MultiLineString'].includes(kind)&&
    !(layer.type==='symbol'&&kind==='Point'))return false;
 return Boolean(safeStreetName(f.properties));
}
function linesOf(f){
 if(f?.geometry?.type==='LineString')return [f.geometry.coordinates];
 if(f?.geometry?.type==='MultiLineString')return f.geometry.coordinates;
 // Some Mapbox styles expose streets only through road-label symbol points.
 if(f?.layer?.type==='symbol'&&f?.geometry?.type==='Point')return [[f.geometry.coordinates]];
 return [];
}
function getAnchor(coords,fraction){
 if(!Array.isArray(coords)||coords.length<1)return null;
 const sampled=coords.length>MAX_POINTS
  ?[...coords.filter((_,i)=>i%Math.ceil(coords.length/MAX_POINTS)===0),coords.at(-1)]
  :coords;
 if(!sampled.every(validPoint))return null;
 coords=sampled;
 if(coords.length===1)return {point:coords[0],meters:0};
 const cumulative=[0];
 for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+metersBetween(coords[i-1],coords[i]));
 const total=cumulative.at(-1);
 if(!Number.isFinite(total)||total<=0||total>80000)return null;
 const target=total*fraction;
 for(let i=1;i<cumulative.length;i++){
  if(cumulative[i]<target)continue;
  const span=cumulative[i]-cumulative[i-1];
  const t=clamp((target-cumulative[i-1])/Math.max(span,1e-6),0,1);
  return {point:[coords[i-1][0]+(coords[i][0]-coords[i-1][0])*t,
                 coords[i-1][1]+(coords[i][1]-coords[i-1][1])*t],meters:total};
 }
 return {point:coords.at(-1),meters:total};
}
function screenPoint(project,point){
 try{const p=project(point);return Number.isFinite(p?.x)&&Number.isFinite(p?.y)?{x:p.x,y:p.y}:null;}
 catch{return null;}
}
export function streetCardBudget({zoom,width,navigation=false,lowMemory=false}={}){
 if(!Number.isFinite(zoom)||zoom<14||!Number.isFinite(width)||width<200)return 0;
 const base=width<440?(zoom>=17?20:zoom>=15.5?16:10)
  :width<800?(zoom>=17?30:zoom>=15.5?23:15)
  :(zoom>=17?46:zoom>=15.5?34:21);
 return Math.max(4,Math.floor(base*(navigation?0.52:1)*(lowMemory?0.72:1)));
}
/** Pure selector. Maximum one card per street name, bounded DOM and collision
 * boxes. Fraction .25 favors the beginning of long avenues; short streets use
 * the middle. A sticky position is reused only near the still-visible road.
 */
export function visibleStreetCardCandidates(features,{
 project,width,height,zoom,navigation=false,lowMemory=false,
 stickyLocations=new Map(),reserved=[]
}={}){
 const max=streetCardBudget({zoom,width,navigation,lowMemory});
 if(!max||typeof project!=='function'||!Number.isFinite(height)||height<250)return [];
 const top=navigation?Math.max(100,height*.19):105,bottom=navigation?Math.max(130,height*.27):120;
 const inside=p=>p&&p.x>=62&&p.x<=width-62&&p.y>=top&&p.y<=height-bottom;
 const pool=new Map();
 for(const f of (Array.isArray(features)?features:[]).slice(0,MAX_FEATURES)){
  if(!isNamedRoadFeature(f))continue;
  const name=safeStreetName(f.properties),id=keyOf(name),isAvenue=avenue(name);
  for(const coords of linesOf(f).slice(0,5)){
   const start=getAnchor(coords,.5);if(!start)continue;
   const useStart=(start.meters>=250&&(isAvenue||start.meters>=440));
   const a=getAnchor(coords,useStart?0.26:0.5);
   if(!a)continue;
   // Fallback midpoint for clipped tile edges, not a fabricated position.
   const p=screenPoint(project,a.point),mid=screenPoint(project,start.point);
   const chosen=inside(p)?{...a,screen:p}:inside(mid)?{...start,screen:mid}:null;
   if(!chosen)continue;
   const sticky=stickyLocations.get(id);
   const old=validPoint(sticky)?screenPoint(project,sticky):null;
   if(inside(old)&&Math.hypot(old.x-chosen.screen.x,old.y-chosen.screen.y)<150&&
      metersBetween(sticky,chosen.point)<220){
    chosen.point=sticky;chosen.screen=old;
   }
   const layerBoost=f.layer?.type==='line'?55:0;
   const lenScore=Math.min(65,chosen.meters/20);
   const score=(isAvenue?75:0)+layerBoost+lenScore-
    Math.hypot(chosen.screen.x-width/2,chosen.screen.y-height/2)*.065;
   const candidate={id,name,avenue:isAvenue,coords:chosen.point,
    x:chosen.screen.x,y:chosen.screen.y,score,
    width:clamp(name.length*6.4+24,80,isAvenue?190:172)};
   const prev=pool.get(id);
   if(!prev||candidate.score>prev.score)pool.set(id,candidate);
  }
 }
 const cards=[],boxes=reserved.map(p=>screenPoint(project,p)).filter(Boolean)
  .map(p=>({x:p.x,y:p.y,width:158,height:66}));
 for(const item of [...pool.values()].sort((a,b)=>b.score-a.score)){
  if(cards.length>=max)break;
  if(navigation&&Math.abs(item.x-width*.5)<88&&Math.abs(item.y-height*.62)<110)continue;
  const hit=boxes.some(box=>Math.abs(box.x-item.x)<(box.width+item.width)/2+13&&
   Math.abs(box.y-item.y)<(box.height+34)/2+11);
  if(hit)continue;
  cards.push(item);boxes.push({x:item.x,y:item.y,width:item.width,height:34});
 }
 return cards;
}

export function syncVisibleStreetCards(map,mapboxgl,data={}){
 if(!map||!mapboxgl)return;
 const cache=map._vanoVisibleStreetCards??={markers:new Map()};
 if(data.active!==true||data.roadCards!==true||typeof map.queryRenderedFeatures!=='function'||
  typeof map.getZoom!=='function'||map.getZoom()<14){
  clearVisibleStreetCards(map);return;
 }
 const canvas=map.getCanvas?.(),width=canvas?.clientWidth||canvas?.width||0,
  height=canvas?.clientHeight||canvas?.height||0;
 if(!width||!height)return;
 let features=[];
 try{
  const style=map.getStyle?.();
  const ids=(style?.layers||[]).filter(layer=>
    ['line','symbol'].includes(layer.type)&&
    (ROAD_TOKEN.test(layer.id||'')||ROAD_TOKEN.test(layer['source-layer']||''))&&
    !String(layer.id||'').startsWith('vano-')).map(layer=>layer.id);
  features=ids.length?map.queryRenderedFeatures({layers:ids}):map.queryRenderedFeatures();
 }catch{return;} // Do not break the map when a vector style is reloading.
 const sticky=new Map([...cache.markers].map(([key,value])=>[key,value.coords]));
 const turnMarkers=map._vanoPrivateRoadSigns?.markers||[];
 const reserved=turnMarkers.map(m=>m.getLngLat?.()).filter(Boolean)
  .map(p=>[p.lng,p.lat]).filter(validPoint);
 const cards=visibleStreetCardCandidates(features,{
  project:p=>map.project(p),width,height,zoom:map.getZoom(),
  navigation:data.navigation===true,
  lowMemory:typeof navigator!=='undefined'&&
   (navigator.deviceMemory&&navigator.deviceMemory<=3||navigator.connection?.saveData===true),
  stickyLocations:sticky,reserved
 });
 const next=new Set(cards.map(x=>x.id));
 for(const [id,old] of cache.markers)if(!next.has(id)){old.marker.remove();cache.markers.delete(id);}
 for(const card of cards){
  const existing=cache.markers.get(card.id);
  if(existing){
   existing.el.dataset.theme=data.appearance==='dark'?'dark':'light';
   if(existing.name!==card.name){existing.label.textContent=card.name;existing.name=card.name;}
   if(metersBetween(existing.coords,card.coords)>1){
    existing.marker.setLngLat(card.coords);existing.coords=card.coords;
   }
   continue;
  }
  const el=document.createElement('div');el.className='vano-street-card'+(card.avenue?' is-avenue':'');
  el.dataset.theme=data.appearance==='dark'?'dark':'light';
  el.setAttribute('aria-hidden','true');el.setAttribute('role','presentation');
  const label=document.createElement('span');label.className='vano-street-card-label';
  label.textContent=card.name; // Provider strings never become HTML.
  el.appendChild(label);
  const marker=new mapboxgl.Marker({element:el,anchor:'bottom',offset:[0,-3],
   rotationAlignment:'viewport',pitchAlignment:'viewport'})
   .setLngLat(card.coords).addTo(map);
  cache.markers.set(card.id,{marker,el,label,name:card.name,coords:card.coords});
 }
}
export function clearVisibleStreetCards(map){
 const cache=map?._vanoVisibleStreetCards;
 if(!cache)return;
 for(const {marker} of cache.markers.values())marker.remove();
 cache.markers.clear();delete map._vanoVisibleStreetCards;
}
