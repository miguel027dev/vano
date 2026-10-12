/** The host binds its message channel to one HTTPS origin and the main frame. */
export const isNativeShell=()=>typeof navigator!=='undefined'&&/VANOAndroid\//.test(navigator.userAgent);
export function notifyNative(message){
  if(!isNativeShell())return false;
  try{if(window.VanoHost?.postMessage){window.VanoHost.postMessage(JSON.stringify(message));return true;}return prompt('VANO_NATIVE',JSON.stringify(message))==='ok';}catch{return false;}
}
