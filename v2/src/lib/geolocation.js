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
