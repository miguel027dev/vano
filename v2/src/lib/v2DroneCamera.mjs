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
    !position.slice(0,2).every(Number.isFinite))return {density:0,sideBias:0,left:0,right:0,count:0};
  const rad=(Number.isFinite(heading)?heading:0)*Math.PI/180;
  const cosLat=Math.max(.2,Math.cos(position[1]*Math.PI/180));
  const seen=new Set();
  let left=0,right=0,count=0,anonymous=0;
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
  }
  return {
    density:clamp(count/18,0,1),
    sideBias:clamp((left-right)/Math.max(5,left+right),-.85,.85),
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
