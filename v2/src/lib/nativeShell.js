/** The host binds its message channel to one HTTPS origin and the main frame. */
export const isNativeShell=()=>typeof navigator!=='undefined'&&/VANOAndroid\//.test(navigator.userAgent);
/** Capability tag added by Android shells that can request permission and
 * deliver a single GPS stream without WebView watchPosition. Older AABs do
 * not send it and must keep their browser geolocation permission flow. */
export const hasNativeSingleGps=()=>isNativeShell()&&/VANOAndroidSingleGPS\/1\b/.test(navigator.userAgent);
export function notifyNative(message){
  if(!isNativeShell())return false;
  try{if(window.VanoHost?.postMessage){window.VanoHost.postMessage(JSON.stringify(message));return true;}return prompt('VANO_NATIVE',JSON.stringify(message))==='ok';}catch{return false;}
}
