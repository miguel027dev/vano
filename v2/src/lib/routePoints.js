/** Reversing a journey means changing the selected origin/destination, not swapping a live GPS fix. */
export function swapJourney(origin,dest,originLabel='Ponto de partida anterior'){
  const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  if(!valid(origin)||!valid(dest?.coords))return null;
  const oldOrigin=origin.slice();const oldDestination=dest.coords.slice();
  return {
    manualCoords:oldDestination,
    manualLabel:dest.name||'Ponto de partida',
    destination:{id:`reverse:${oldOrigin[0].toFixed(6)}:${oldOrigin[1].toFixed(6)}`,name:originLabel||'Ponto de partida anterior',address:'',coords:oldOrigin}
  };
}
