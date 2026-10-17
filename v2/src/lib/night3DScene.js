/** Optional visual-only 3D night scenery. No routing, GPS or traffic inputs are modified.
 * Decorative trees are estimated inside MAPPED landuse polygons (not surveyed tree locations).
 * Each refresh is capped, viewport-bound and throttled so phones can keep navigating.
 */
import {night3dEnabled} from './night3DBuildings.js';

export const NIGHT_GREEN_ID='vano-night-greenery';
export const NIGHT_ROAD_ID='vano-night-road-depth';
export const NIGHT_TREES_SOURCE='vano-night-trees';
export const NIGHT_TREE_TRUNK='vano-night-tree-trunks';
export const NIGHT_TREE_CANOPY='vano-night-tree-canopies';
export const NIGHT_TREE_ZOOM=15.7;
const empty=()=>({type:'FeatureCollection',features:[]});
const greenery=['park','wood','forest','grass','garden','scrub','nature_reserve'];
const isGreen=properties=>greenery.includes(String(properties?.class||properties?.type||'').toLowerCase());
const bounded=(v,min,max)=>Math.max(min,Math.min(max,v));
const insideRing=(p,ring)=>{
 let inside=false;
 for(let a=0,b=ring.length-1;a<ring.length;b=a++){
  const x=ring[a]?.[0],y=ring[a]?.[1],u=ring[b]?.[0],v=ring[b]?.[1];
  if(![x,y,u,v].every(Number.isFinite))continue;
  if((y>p[1])!==(v>p[1])&&p[0]<(u-x)*(p[1]-y)/(v-y)+x)inside=!inside;
 }
 return inside;
};
const insidePolygon=(point,rings)=>Array.isArray(rings)&&rings.length>0&&
 insideRing(point,rings[0])&&!rings.slice(1).some(r=>insideRing(point,r));
const hash=(a,b)=>Math.abs((Math.imul(a,73856093)^Math.imul(b,19349663))|0);
function disk(lon,lat,radius){
 const dy=radius/111320,dx=dy/Math.max(.25,Math.cos(lat*Math.PI/180));
 const ring=Array.from({length:9},(_,i)=>[lon+Math.cos(i*Math.PI/4)*dx,lat+Math.sin(i*Math.PI/4)*dy]);
 return {type:'Polygon',coordinates:[ring]};
}
/** Derive stable low-poly tree models from real mapped park/wood/green polygons only.
 * Positions are illustrative and must never be used as precise tree inventory.
 */
export function decorativeTreeCollection(features,bounds,{limit=56}={}){
 const result=empty(),seen=new Set();
 if(!Array.isArray(features)||!bounds||limit<1)return result;
 const west=Number(bounds.west),east=Number(bounds.east),south=Number(bounds.south),north=Number(bounds.north);
 if(![west,east,south,north].every(Number.isFinite)||west>=east||south>=north||east-west>.18||north-south>.18)return result;
 const latStep=.00029,lonStep=latStep/Math.max(.3,Math.cos((north+south)*Math.PI/360));
 let work=0;
 for(const feature of features.slice(0,140)){
  if(!isGreen(feature?.properties))continue;
  const geom=feature?.geometry;
  const polygons=geom?.type==='Polygon'?[geom.coordinates]:geom?.type==='MultiPolygon'?geom.coordinates:[];
  for(const rings of polygons){
   const outer=rings?.[0];if(!Array.isArray(outer)||outer.length<4)continue;
   const xs=outer.map(x=>x?.[0]).filter(Number.isFinite),ys=outer.map(x=>x?.[1]).filter(Number.isFinite);
   if(!xs.length||!ys.length)continue;
   const i0=Math.ceil(Math.max(west,xs.reduce((v,x)=>Math.min(v,x),Infinity))/lonStep),i1=Math.floor(Math.min(east,xs.reduce((v,x)=>Math.max(v,x),-Infinity))/lonStep);
   const j0=Math.ceil(Math.max(south,ys.reduce((v,y)=>Math.min(v,y),Infinity))/latStep),j1=Math.floor(Math.min(north,ys.reduce((v,y)=>Math.max(v,y),-Infinity))/latStep);
   for(let i=i0;i<=i1&&result.features.length<limit*2;i++){
    for(let j=j0;j<=j1&&result.features.length<limit*2;j++){
     if(++work>6500)return result;
     if(hash(i,j)%7===0)continue;
     const key=i+':'+j;if(seen.has(key))continue;
     const p=[i*lonStep,j*latStep];
     if(!insidePolygon(p,rings))continue;
     seen.add(key);
     const variation=hash(i+7,j+11)%4;
     const height=5.7+variation*.55;
     const properties={kind:'trunk',base:0,height:3.4,tone:variation};
     result.features.push({type:'Feature',properties,geometry:disk(p[0],p[1],.42)});
     result.features.push({type:'Feature',properties:{kind:'canopy',base:2.9,height,tone:variation},geometry:disk(p[0],p[1],2.1+variation*.3)});
    }
   }
  }
  if(result.features.length>=limit*2)break;
 }
 return result;
}
export function nightSceneTreeBudget({memory,cores,saveData=false}={}){
 if(saveData||(Number.isFinite(memory)&&memory<4)||(Number.isFinite(cores)&&cores<4))return 0;
 return Number.isFinite(memory)&&memory>=8?72:36;
}
function labelBefore(map){
 return map.getStyle?.()?.layers?.find(x=>x.type==='symbol'&&x.layout?.['text-field'])?.id;
}
function dropLayer(map,id){if(map.getLayer?.(id))map.removeLayer?.(id);}
function clearTrees(map){
 for(const id of [NIGHT_TREE_CANOPY,NIGHT_TREE_TRUNK])dropLayer(map,id);
 if(map.getSource?.(NIGHT_TREES_SOURCE))map.removeSource?.(NIGHT_TREES_SOURCE);
 delete map._vanoNightTreeStamp;
}
function updateAtmosphere(map,enabled){
 if(typeof map.setFog!=='function')return;
 const newState=enabled?'dark':'off';
 if(map._vanoNightFogApplied===newState)return;
 map.setFog(enabled?{
  color:'rgba(9,15,24,0.95)', 'high-color':'rgba(24,36,51,0.75)',
  'space-color':'#050912','horizon-blend':.08,'star-intensity':.12
 }:null);
 map._vanoNightFogApplied=newState;
}
function syncGround(map,enabled){
 if(!enabled){
  dropLayer(map,NIGHT_GREEN_ID);dropLayer(map,NIGHT_ROAD_ID);return;
 }
 if(!map.getSource?.('composite'))return;
 const before=labelBefore(map);
 if(!map.getLayer?.(NIGHT_GREEN_ID))map.addLayer({
  id:NIGHT_GREEN_ID,type:'fill',source:'composite','source-layer':'landuse',minzoom:12,
  filter:['in',['get','class'],['literal',greenery]],
  paint:{'fill-color':'#183729','fill-opacity':['interpolate',['linear'],['zoom'],12,.18,16,.32,19,.38]}
 },before);
 if(!map.getLayer?.(NIGHT_ROAD_ID))map.addLayer({
  id:NIGHT_ROAD_ID,type:'line',source:'composite','source-layer':'road',minzoom:13.5,
  filter:['in',['get','class'],['literal',['motorway','trunk','primary','secondary','tertiary']]],
  paint:{'line-color':'#98afc0','line-opacity':.15,'line-width':['interpolate',['linear'],['zoom'],14,.5,18,3.2]}
 },before);
}
function viewBounds(map){
 const b=map.getBounds?.();
 return b?{west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()}:null;
}
/** Idempotent and safe to call after style.load, idle and moveend. */
export function syncNight3DScene(map,{appearance='light',layer='streets',navigation=false,
 memory=null,cores=null,saveData=false,now=Date.now()}={}){
 if(!map?.getLayer||!map?.getSource)return false;
 const enabled=night3dEnabled(appearance,layer);
 try{updateAtmosphere(map,enabled);}catch{/* unsupported Mapbox style: retain existing fog */}
 syncGround(map,enabled);
 const budget=nightSceneTreeBudget({memory,cores,saveData});
 const treesOn=enabled&&navigation&&budget>0&&(map.getZoom?.()??0)>=NIGHT_TREE_ZOOM&&!!map.getSource('composite');
 if(!treesOn){clearTrees(map);return enabled;}
 if(!map.getSource(NIGHT_TREES_SOURCE))map.addSource(NIGHT_TREES_SOURCE,{type:'geojson',data:empty()});
 const before=labelBefore(map);
 if(!map.getLayer(NIGHT_TREE_TRUNK))map.addLayer({
  id:NIGHT_TREE_TRUNK,type:'fill-extrusion',source:NIGHT_TREES_SOURCE,minzoom:NIGHT_TREE_ZOOM,
  filter:['==',['get','kind'],'trunk'],
  paint:{'fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base'],
   'fill-extrusion-color':'#344736','fill-extrusion-opacity':.86}
 },before);
 if(!map.getLayer(NIGHT_TREE_CANOPY))map.addLayer({
  id:NIGHT_TREE_CANOPY,type:'fill-extrusion',source:NIGHT_TREES_SOURCE,minzoom:NIGHT_TREE_ZOOM,
  filter:['==',['get','kind'],'canopy'],
  paint:{'fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base'],
   'fill-extrusion-color':['match',['get','tone'],0,'#254e37',1,'#2d6042',2,'#335e40','#3a6b49'],
   'fill-extrusion-vertical-gradient':true,'fill-extrusion-opacity':.9}
 },before);
 const source=map.getSource(NIGHT_TREES_SOURCE);
 if(now-(map._vanoNightTreeStamp||0)<2200)return true;
 let features=[];
 try{features=map.querySourceFeatures?.('composite',{sourceLayer:'landuse'})||[];}catch{/* tiles not yet loaded */}
 if(features.length){
  map._vanoNightTreeStamp=now;
  source?.setData?.(decorativeTreeCollection(features,viewBounds(map),{limit:budget}));
 }
 return true;
}
