/** Adaptive V2 Sim camera. Presentation only: never mutates GPS, routing or trips. */
import {maneuverCategory} from './navigationCameraPlanner.js';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:min));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const angle180=a=>((a+540)%360)-180;
export const V2_DRONE_PLAYBACK_RATE=2.5;

/** Observe nearby 3D buildings without using screen orientation as road direction.
 * Samples are limited and only collected by the Mapbox controller ~once per second.
 * Side bias is negative when the left side is more open, positive for the right. */
export function observeV2DroneScene(features=[],position=null,heading=0){
  if(!Array.isArray(features)||!Array.isArray(position)||position.length<2||
    !position.slice(0,2).every(Number.isFinite))return {density:0,sideBias:0,left:0,right:0,count:0,obstruction:0};
  const rad=(Number.isFinite(heading)?heading:0)*Math.PI/180;
  const cosLat=Math.max(.2,Math.cos(position[1]*Math.PI/180));
  const seen=new Set();
  let left=0,right=0,count=0,anonymous=0,blocked=0;
  for(const f of features){
    if(count>=48)break;
    const layer=f?.layer||{},props=f?.properties||{};
    const building=layer.type==='fill-extrusion'||
      /building|3d[-_ ]?object|structure|extrusion/i.test(String(layer.id||'')+' '+String(props.class||props.type||''));
    if(!building)continue;
    const geom=f?.geometry;
    if(geom?.type!=='Polygon'&&geom?.type!=='MultiPolygon')continue;
    const key=f.id??props.id??props.osm_id;
    const unique=key!=null?String(key):'anonymous-'+anonymous++;
    if(seen.has(unique))continue;
    seen.add(unique);
    count++;
    const ring=geom.type==='Polygon'?geom.coordinates?.[0]:geom.coordinates?.[0]?.[0];
    if(!Array.isArray(ring)||ring.length<3)continue;
    let lon=0,lat=0,n=0;
    // A few polygon vertices are sufficient for choosing the street's open side.
    for(const p of ring.slice(0,8)){
      if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
      lon+=p[0];lat+=p[1];n++;
    }
    if(!n)continue;
    const east=(lon/n-position[0])*cosLat, north=lat/n-position[1];
    const rightComponent=east*Math.cos(rad)-north*Math.sin(rad);
    if(rightComponent>0.000015)right++;
    else if(rightComponent<-.000015)left++;
    // Buildings behind the vehicle or beside the chase-camera line of sight
    // can hide the puck at high Mapbox pitch. Use local meters for this probe,
    // never the snapped route or camera map center.
    const forward=(east*Math.sin(rad)+north*Math.cos(rad))*111320;
    const lateral=rightComponent*111320;
    const height=Number(props.height??props.render_height??props['building:height']);
    if(forward>=-65&&forward<=16&&Math.abs(lateral)<=31 &&
      (!Number.isFinite(height)||height>=7))blocked++;
  }
  return {
    density:clamp(count/18,0,1),
    sideBias:clamp((left-right)/Math.max(5,left+right),-.85,.85),
    obstruction:clamp(blocked/3,0,1),
    left,right,count
  };
}

export function planV2DroneCamera({
  enabled=false,vehicle='carro',maneuver=null,route=null,speed=0,
  urbanDensity=0,sideBias=0,bendDegrees=0,
  compactViewport=false,reducedMotion=false,accuracy=null
}={}){
  if(!enabled||!['carro','moto'].includes(vehicle))
    return {enabled:false,open:0,category:'continue'};
  const urban=clamp(urbanDensity,0,1);
  const velocity=clamp(speed,0,45);
  const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
  const modifier=String(maneuver?.modifier||step?.modifier||'').toLowerCase();
  const category=maneuverCategory({
    ...step,kind:maneuver?.kind||step?.type,modifier
  });
  const distance=Number.isFinite(maneuver?.distance)?Math.max(0,maneuver.distance):Infinity;
  const turning=['roundabout','ramp','junction','turn','uturn','arrival'].includes(category);
  // Open early enough for a 2.5x replay, but only as much as a real choice requires.
  const threshold=clamp(135+velocity*(category==='ramp'?11:9),145,category==='ramp'?330:270);
  let maneuverOpen=0;
  if(turning&&distance<threshold)maneuverOpen=smooth((threshold-distance)/threshold);
  if(Number.isFinite(accuracy)&&accuracy>75)maneuverOpen=Math.min(maneuverOpen,.38);
  // Even unlabeled tight bends should not force a blind, vehicle-close camera.
  const curve=Number.isFinite(bendDegrees)?angle180(bendDegrees):0;
  const curveOpen=smooth((Math.abs(curve)-17)/53)*.42;
  const open=Math.max(maneuverOpen,curveOpen);
  const zoomBase=(compactViewport?18.70:19.03)-Math.min(.26,velocity*.012)-urban*.48;
  const zoomOut=category==='roundabout'?1.55:
    category==='ramp'?1.40:category==='junction'?1.25:category==='uturn'?1.28:1.06;
  const zoom=clamp(zoomBase-open*zoomOut-urban*.12*open,16.7,19.1);
  const pitchBase=(compactViewport?63:69)-urban*14;
  const pitch=clamp(pitchBase-open*(category==='roundabout'?22:category==='ramp'?20:17),37,73);
  // Look gently into the upcoming side road, not sideways away from the car.
  let side=0;
  if(/left|esquerda/.test(modifier))side=-1;
  else if(/right|direita/.test(modifier))side=1;
  if(category==='uturn')side=side||-1;
  if(!turning||category==='arrival')side=0;
  const curveSide=clamp(curve/58,-1,1)*curveOpen;
  const sightSide=clamp(side*maneuverOpen*.8+curveSide*.65+
    clamp(sideBias,-1,1)*urban*.28,-.88,.88);
  const yawDegrees=reducedMotion?0:sightSide*10;
  const sideMeters=reducedMotion?0:sightSide*9;
  return {
    enabled:true,open,category,threshold,urban,
    zoom:reducedMotion?Math.min(zoom,17.5):zoom,
    pitch:reducedMotion?0:pitch,
    yawDegrees,sideMeters,
    centerBlend:clamp(.21+open*.28+urban*.08,.21,.63),
    // Fast but damped follow; wider frames deliberately ease a little longer.
    halfLife:reducedMotion?90:open>.45?300:urban>.45?280:215,
    pointHalfLife:reducedMotion?90:open>.45?315:255,
    bearingHalfLife:reducedMotion?90:open>.4?320:urban>.45?315:245
  };
}

/** A small lateral center shift reveals the side street, preserving the puck.
 * Geographic conversion uses local meters and intentionally caps camera drift. */
export function shiftDroneView(center,bearing,sideMeters=0){
  if(!Array.isArray(center)||center.length<2||!center.slice(0,2).every(Number.isFinite))return center;
  const meters=clamp(sideMeters,-8,8);
  if(Math.abs(meters)<.02)return center;
  const rad=(Number.isFinite(bearing)?bearing:0)*Math.PI/180;
  const east=Math.cos(rad)*meters,north=-Math.sin(rad)*meters;
  return [
    center[0]+east/(111320*Math.max(.25,Math.cos(center[1]*Math.PI/180))),
    center[1]+north/111320
  ];
}

/** Hysteresis: avoid switching V1/V2 on every group of buildings. Only
 * observed building density decides the urban camera; no synthetic places. */
export function chooseV2UrbanCamera({enabled=false,density=0,mode='v1',
  lastSwitchAt=0,nowMs=0,holdMs=1700}={}){
  if(!enabled)return {mode:'v1',changed:false};
  const current=mode==='v2'?'v2':'v1';
  const value=clamp(density,0,1);
  const canSwitch=Number.isFinite(nowMs)&&nowMs-lastSwitchAt>=holdMs;
  const target=current==='v1'?(value>=.46?'v2':'v1'):(value<=.23?'v1':'v2');
  return {mode:canSwitch?target:current,changed:canSwitch&&target!==current};
}

/** A route-provider entrance/exit within ~100 m deserves a close camera
 * centered around the actual user puck (not the line's snapped projection).
 * Start gently at 180 m, be mostly close at 100 m, and ease back automatically
 * when the provider advances to its next maneuver. */
export function planV2RampApproach({
  enabled=false,vehicle='carro',maneuver=null,route=null,
  compactViewport=false,reducedMotion=false
}={}){
  const off={active:false,strength:0,category:'continue'};
  if(!enabled||!['carro','moto'].includes(vehicle))return off;
  const step=Number.isInteger(maneuver?.stepIndex)?route?.steps?.[maneuver.stepIndex]:null;
  const category=maneuverCategory({
    ...step,kind:maneuver?.kind||step?.type,modifier:maneuver?.modifier||step?.modifier
  });
  const distance=Number.isFinite(maneuver?.distance)?maneuver.distance:Infinity;
  if(category!=='ramp'||distance<0||distance>=180)return {...off,category};
  const strength=smooth((180-distance)/105);
  return {
    active:strength>.001,category,strength,
    // ~100 m out: clear view of the ramp while keeping the user icon large.
    zoom:reducedMotion?17.0:compactViewport?17.72:18.03,
    pitch:reducedMotion?0:compactViewport?45:52,
    lookAheadMeters:compactViewport?14:23,
    halfLife:reducedMotion?85:235,
    pointHalfLife:reducedMotion?85:240,
    bearingHalfLife:reducedMotion?85:270
  };
}
/** Position the close-up near the marker, never the route geometry.
 * Heading comes from the actual vehicle marker; missing heading keeps the
 * icon centered instead of inventing a route bearing. */
export function v2UserCenteredRampView(userPuck,heading,lookAheadMeters=0){
  if(!Array.isArray(userPuck)||userPuck.length<2||
    !userPuck.slice(0,2).every(Number.isFinite))return null;
  if(!Number.isFinite(heading))return userPuck.slice(0,2);
  const meters=clamp(lookAheadMeters,0,26);
  const rad=heading*Math.PI/180;
  return [
    userPuck[0]+Math.sin(rad)*meters/(111320*Math.max(.25,Math.cos(userPuck[1]*Math.PI/180))),
    userPuck[1]+Math.cos(rad)*meters/111320
  ];
}

/** Perspective camera always follows BEHIND the simulated puck.
 * The ground target is only a few metres AHEAD of the puck, so Mapbox's
 * tilted virtual camera sits behind it; never aim at snapped route points.
 * Tall nearby structures lower the viewing angle to prevent wall clipping. */
export function planV2RearChase({
  enabled=false,vehicle='carro',urbanDensity=0,obstruction=0,
  rampStrength=0,compactViewport=false,reducedMotion=false,speed=0
}={}){
  if(!enabled||!['carro','moto'].includes(vehicle))return {enabled:false};
  const urban=clamp(urbanDensity,0,1),walls=clamp(obstruction,0,1),
    entrance=clamp(rampStrength,0,1),velocity=clamp(speed,0,45);
  // Consistent third-person distance; zoom ramps in but never reaches the
  // road-level building camera that was obscuring the vehicle.
  const zoom=clamp((compactViewport?17.61:17.79)+urban*.23+
    entrance*.27-Math.min(.15,velocity*.005)-walls*.07,17.35,18.18);
  const pitch=reducedMotion?0:clamp((compactViewport?46:55)-
    urban*9-walls*10-entrance*2,30,58);
  return {
    enabled:true,zoom:reducedMotion?Math.min(zoom,17.45):zoom,pitch,
    // The marker remains close to camera's lower third. Do not use the road line.
    lookAheadMeters:reducedMotion?0:clamp((compactViewport?8:12)+
      Math.min(5,velocity*.24)-urban*2-entrance*3-walls*2,5,18),
    halfLife:reducedMotion?85:240,
    pointHalfLife:reducedMotion?85:245,
    bearingHalfLife:reducedMotion?85:285
  };
}
