import {evaluateGpsPosition} from './geolocation.js';
/** Read an existing grant. Revocation clears the watch and exposed position. */
export function watchSearchLocation(navigator,onFix){
 let cancelled=false,permission=null,watch=null,previous=null;
 const stop=()=>{if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}previous=null;};
 const change=()=>{
  stop();onFix(null);
  if(cancelled||permission?.state!=='granted')return;
  watch=navigator.geolocation.watchPosition(position=>{
   if(cancelled||permission.state!=='granted')return;
   const result=evaluateGpsPosition(position,previous);
   if(result.ok){previous=result.fix;onFix(result.fix);}
  },()=>{if(!cancelled)onFix(null);},{maximumAge:20000,timeout:8000,enableHighAccuracy:false});
 };
 async function locate(){
  try{
   if(!navigator.permissions?.query||!navigator.geolocation)return;
   permission=await navigator.permissions.query({name:'geolocation'});
   if(cancelled)return;
   permission.addEventListener?.('change',change);change();
  }catch{if(!cancelled)onFix(null);}
 }
 locate();
 return()=>{cancelled=true;stop();permission?.removeEventListener?.('change',change);};
}
