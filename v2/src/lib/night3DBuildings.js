/** 3D urban detail for the VANO night street map only.
 * This layer uses actual Mapbox Streets building footprints and mapped heights.
 * It never changes GPS, routing or live traffic layers; missing vector data
 * falls back silently to the original 2D dark basemap.
 */
export const NIGHT_3D_BUILDING_ID='vano-night-3d-buildings';
export const night3dEnabled=(appearance,layer)=>
  appearance==='dark'&&layer!=='satellite';

const height=['max',0,['to-number',['get','height'],0]];
const base=['max',0,['to-number',['get','min_height'],0]];
const ramp=(value)=>['interpolate',['linear'],['zoom'],14,0,15.35,value];
export function syncNight3DBuildings(map,{appearance='light',layer='streets'}={}){
 if(!map||typeof map.getLayer!=='function')return false;
 const existing=map.getLayer(NIGHT_3D_BUILDING_ID);
 if(!night3dEnabled(appearance,layer)){
  if(existing&&typeof map.removeLayer==='function')map.removeLayer(NIGHT_3D_BUILDING_ID);
  return false;
 }
 if(existing)return true;
 // Standard already renders Mapbox's own detailed 3D buildings and trees.
 // Never stack VANO's old extrusions on top of provider-native 3D geometry.
 if(map._vanoStyle==='mapbox://styles/mapbox/standard')return true;
 if(!map.getSource?.('composite'))return false;
 const style=map.getStyle?.();
 const layers=Array.isArray(style?.layers)?style.layers:[];
 // Avoid double-rendering full building geometry when provider already has 3D.
 if(layers.some(x=>(x.type==='fill-extrusion'||x.type==='building')&&
  (x['source-layer']==='building'||x.type==='building')))return true;
 const label=layers.find(x=>x.type==='symbol'&&x.layout?.['text-field'])?.id;
 map.addLayer({
  id:NIGHT_3D_BUILDING_ID,type:'fill-extrusion',
  source:'composite','source-layer':'building',minzoom:14,
  filter:['==','extrude','true'],
  paint:{
   // Material contrast varies with mapped height, without glowing rooftops.
   'fill-extrusion-color':['interpolate',['linear'],height,
     0,'#263844',30,'#324a59',120,'#455f70',300,'#607e91'],
   'fill-extrusion-height':ramp(height),
   'fill-extrusion-base':ramp(base),
   'fill-extrusion-opacity':0.87,
   'fill-extrusion-vertical-gradient':true,
  }
 },label);
 return true;
}

/** Enable a useful 3D viewing angle without hijacking active navigation.
 * The shared camera controller already owns pitch when GPS following is active.
 * Restore a previous free-look angle on switching back to light.
 */
export function syncNight3DCamera(map,{appearance='light',layer='streets',
 navigation=false,following=false,reducedMotion=false}={}){
 if(!map||typeof map.getPitch!=='function'||typeof map.easeTo!=='function')return;
 const enabled=night3dEnabled(appearance,layer);
 if(navigation||following)return;
 if(enabled){
  if(map._vanoNight3DAutoPitch!==undefined)return;
  const current=map.getPitch();
  if(current>=32)return; // Preserve the user's existing camera angle.
  map._vanoNight3DAutoPitch=current;
  map.easeTo({pitch:53,duration:reducedMotion?0:420});
 }else if(map._vanoNight3DAutoPitch!==undefined){
  const prior=map._vanoNight3DAutoPitch;
  delete map._vanoNight3DAutoPitch;
  map.easeTo({pitch:prior,duration:reducedMotion?0:380});
 }
}
