/** One guarded browser GPS subscription per map view.
 * Do not combine an immediate getCurrentPosition request with watchPosition:
 * on first login both can compete during the browser's permission prompt.
 * Watch acquires the first location and follows movement; a delayed low-power
 * one-shot is used only if the watch has not delivered an accepted fix.
 */
export function startGpsSession(geolocation,{onPosition,onError},{navigation=false,schedule=setTimeout,cancel=clearTimeout,firstFixTimeoutMs=8500}={}){
  if(!geolocation||typeof geolocation.watchPosition!=='function'||typeof geolocation.clearWatch!=='function')
    throw new TypeError('Geolocation watch unavailable');
  let active=true,settled=false,denied=false,watchId=null,timer=null;
  const stopTimer=()=>{if(timer!==null){cancel(timer);timer=null;}};
  const success=position=>{
    if(!active)return;
    const accepted=onPosition(position);
    if(accepted){settled=true;stopTimer();}
  };
  const failure=error=>{
    if(!active)return;
    if(error?.code===1){denied=true;stopTimer();}
    onError(error);
  };
  try {
    watchId=geolocation.watchPosition(success,failure,{
      enableHighAccuracy:true,
      maximumAge:navigation?1000:8000,
      timeout:navigation?16000:25000
    });
  }catch(error){failure(error);}
  if(active&&!settled&&!denied){
    timer=schedule(()=>{
      timer=null;
      if(!active||settled||denied||typeof geolocation.getCurrentPosition!=='function')return;
      try{
        geolocation.getCurrentPosition(success,failure,{
          enableHighAccuracy:false,maximumAge:8000,timeout:12000
        });
      }catch(error){failure(error);}
    },firstFixTimeoutMs);
  }
  return()=>{
    if(!active)return;
    active=false;stopTimer();
    if(watchId!==null&&watchId!==undefined)geolocation.clearWatch(watchId);
  };
}
