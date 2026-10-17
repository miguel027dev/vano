/** Native Mapbox Standard scenery on the dark streets basemap.
 * Standard owns trees, landmarks, building models, lighting and coverage.
 * Deliberately NO synthetic tree polygons, local tree tiles or fabricated positions.
 * The VANO orange route, traffic, radar markers and live GPS use separate layers.
 */
import {nativeNightMapboxStyle} from './mapLayers.js';

/** Idempotent after style.load/idle/moveend; never affects other map styles. */
export function syncNight3DScene(map,{appearance='light',layer='streets'}={}){
 if(!map||!nativeNightMapboxStyle(layer,appearance))return false;
 // Mapbox Standard supports 3D vegetation through its own basemap configuration.
 if(typeof map.setConfigProperty!=='function')return false;
 if(map._vanoNativeTreesConfigured)return true;
 map._vanoNativeTreesConfigured=true;
 for(const [property,value] of [
  ['lightPreset','night'],
  ['show3dObjects',true],
  ['show3dTrees',true],
  ['show3dBuildings',true]
 ]){
  try{map.setConfigProperty('basemap',property,value);}
  catch(error){
   // Older Mapbox GL JS versions may lack fine-grained tree/building switches.
   // show3dObjects already enables native trees with those versions.
   if(property==='lightPreset'||property==='show3dObjects')
    console.warn('VANO Mapbox Standard 3D config:',error?.message||String(error));
  }
 }
 return true;
}
