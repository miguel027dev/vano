/** Browser permission failures are not routing failures. Never forge a current GPS fix. */
export function geoAccessStatus(error){
  if(error?.code===1)return 'denied';
  if(error?.code===2)return 'unavailable';
  if(error?.code===3)return 'timeout';
  return 'error';
}
export function geoErrorMessage(error){
  switch(geoAccessStatus(error)){
    case 'denied':return 'O navegador negou a permissão de localização. Você ainda pode escolher sua origem manualmente.';
    case 'unavailable':return 'O aparelho não conseguiu identificar a posição. Escolha a origem no mapa.';
    case 'timeout':return 'O GPS demorou a responder. Tente novamente ou escolha sua origem.';
    default:return 'Não foi possível obter a localização. Escolha seu ponto de partida no mapa.';
  }
}

/** A transient watch/getCurrentPosition error must not erase a recent real fix.
 * Timestamp refers to when the browser supplied the location, not map render time.
 */
export function hasRecentGpsFix(fix, now=Date.now(), maxAgeMs=90000){
  if(!fix || !Array.isArray(fix.coords) || fix.coords.length!==2)return false;
  const [lng,lat]=fix.coords;
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)return false;
  return Number.isFinite(fix.receivedAt)&&fix.receivedAt<=now&&now-fix.receivedAt<maxAgeMs;
}
/** Prefer already granted location data when a redundant GPS call fails. */
export function gpsStateAfterError(error,fix,now=Date.now()){
  // Permission revocation must be shown immediately even if a recent fix remains.
  if(error?.code===1)return 'denied';
  return hasRecentGpsFix(fix,now)?'granted':geoAccessStatus(error);
}
/** Browser-reported GPS only: reject cached fixes and isolated implausible jumps. */
export function evaluateGpsPosition(position, previous=null, now=Date.now()) {
  const p=position?.coords;
  const coords=p&&[p.longitude,p.latitude];
  if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90)
    return {ok:false,reason:'invalid'};
  const timestamp=Number(position.timestamp);
  if(!Number.isFinite(timestamp)||timestamp<=0||timestamp>now+5000||now-timestamp>35000)
    return {ok:false,reason:'stale'};
  if(previous?.sourceAt && timestamp<=previous.sourceAt)
    return {ok:false,reason:'out-of-order'};
  const accuracy=Number(p.accuracy);
  if(!Number.isFinite(accuracy)||accuracy<0||accuracy>2000)
    return {ok:false,reason:'inaccurate'};
  if(previous?.sourceAt && timestamp>previous.sourceAt && Array.isArray(previous.coords)) {
    const rad=Math.PI/180;
    const dlat=(coords[1]-previous.coords[1])*111195;
    const dlon=(coords[0]-previous.coords[0])*111195*Math.cos(coords[1]*rad);
    const meters=Math.hypot(dlat,dlon);
    const elapsed=Math.max(0.5,(timestamp-previous.sourceAt)/1000);
    const tolerance=Math.max(accuracy,Number(previous.accuracy)||0);
    // Tight envelope for adjacent readings; larger recovery window after
    // genuine signal gaps. Poor-accuracy samples cannot authorize teleports.
    const limit=elapsed<=2
      ?Math.max(48,elapsed*42+16,Math.min(tolerance,55)*1.2+18)
      :Math.max(elapsed*60+35,Math.min(tolerance,120)*1.5+20);
    if(meters>limit)
      return {ok:false,reason:'jump'};
  }
  return {ok:true,fix:{coords,receivedAt:timestamp,sourceAt:timestamp,accuracy},heading:Number.isFinite(p.heading)?p.heading:null,speed:Number.isFinite(p.speed)?p.speed:null};
}
