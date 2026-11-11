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
  return hasRecentGpsFix(fix,now)?'granted':geoAccessStatus(error);
}
