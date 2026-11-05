import {hasRecentGpsFix} from './geolocation.js';

const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const failures={
  denied:'Localização desativada', unavailable:'Localização indisponível',
  timeout:'O GPS demorou a responder', error:'Localização indisponível',
  unsupported:'GPS não disponível neste navegador', insecure:'Localização indisponível'
};

/** One presentation state for the card and recovery banner. Cached/manual
 * coordinates never imply a current device location or an ongoing request. */
export function locationSummary({status,fix,displayCoords,manualCoords,manualLabel,address,now=Date.now()}={}){
  if(validPoint(manualCoords))return {live:false,label:'Origem manual',title:manualLabel||'Origem selecionada',detail:'Ponto escolhido no mapa. Use o GPS para localizar o aparelho.',showRecovery:false};
  const live=['granted','approximate'].includes(status)&&hasRecentGpsFix(fix,now,35000);
  if(live)return {live:true,label:fix.accuracy>100?'Localização aproximada':'Sua localização',title:address?.street||'Localização identificada',detail:address?.detail||'Endereço sendo identificado pelo GPS',showRecovery:false};
  const failure=failures[status];
  if(failure)return {live:false,label:validPoint(displayCoords)?'Última localização':'Sua localização',title:validPoint(displayCoords)?'Último ponto conhecido':failure,detail:validPoint(displayCoords)?failure+' · posição salva, sem GPS atual':'Tente novamente ou escolha a origem no mapa.',recoveryTitle:failure,showRecovery:!validPoint(displayCoords)};
  if(status==='checking'||status==='reconnecting')return {live:false,label:validPoint(displayCoords)?'Última localização':'Sua localização',title:validPoint(displayCoords)?'Último ponto conhecido':'Buscando localização…',detail:validPoint(displayCoords)?'Atualizando GPS · posição salva':'Localizando seu dispositivo…',showRecovery:false};
  return {live:false,label:validPoint(displayCoords)?'Última localização':'Sua localização',title:validPoint(displayCoords)?'Último ponto conhecido':'Localização não atualizada',detail:'Use o GPS ou escolha a origem no mapa.',showRecovery:!validPoint(displayCoords),recoveryTitle:'Localização indisponível'};
}
