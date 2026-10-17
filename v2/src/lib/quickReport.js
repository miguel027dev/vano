/** The map's quick-report flow must only publish a fresh, measured GPS fix.
 * Never infer a location from the map center, manual route origin, or warm start.
 */
import {validReportCoords} from './communityReports.js';
export function quickReportPosition(fix,now=Date.now()){
  if(!fix||!validReportCoords(fix.coords))return {coords:null,reason:'Aguardando sua localização GPS atual.'};
  const age=now-Number(fix.sourceAt);
  if(!Number.isFinite(age)||age<0||age>20000)
    return {coords:null,reason:'Sua localização está desatualizada. Atualize o GPS.'};
  if(!Number.isFinite(fix.accuracy)||fix.accuracy>100||fix.accuracy<0)
    return {coords:null,reason:'A precisão do GPS está baixa. Tente novamente em um local aberto.'};
  return {coords:[...fix.coords],reason:null};
}
export function quickReportMotionBlocked(navigating,speedMetersPerSecond){
  return Boolean(navigating&&Number.isFinite(speedMetersPerSecond)&&speedMetersPerSecond>2.2);
}
