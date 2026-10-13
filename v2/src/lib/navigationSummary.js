/** GPS-derived navigation summary. Never advance progress without real GPS updates.
 * Route.duration is in minutes; route.distance in kilometers (VANO V2 contract).
 */
export function navigationSummary(route,guidance,now=Date.now()){
  const duration=Number(route?.duration);
  const distance=Number(route?.distance);
  if(!Number.isFinite(duration)||duration<0||!Number.isFinite(distance)||distance<0||!Number.isFinite(now))
    return null;
  const rawProgress=Number(guidance?.progress);
  const progress=guidance?.progress!==undefined&&guidance?.progress!==null&&Number.isFinite(rawProgress)
    ? Math.max(0,Math.min(1,rawProgress)):0;
  const remainingMinutes=duration*(1-progress);
  const remainingKm=distance*(1-progress);
  return {
    remainingMinutes:Math.max(0,Math.ceil(remainingMinutes)),
    remainingKm:Math.max(0,remainingKm),
    arrivalAt:new Date(now+remainingMinutes*60000),
    progress
  };
}
export function arrivalClock(date,locale='pt-BR'){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return '--:--';
  try{return new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
  catch{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
}
