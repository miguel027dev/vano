/** ETA while navigating: provider ETA is authoritative, never infer time from
 * speed-limit signs, the UI animation, or a global average-speed heuristic.
 * Route.duration is minutes; steps[].distance is meters; steps[].duration is seconds.
 * The GPS progress remains distance-based; the TIME remaining follows provider
 * step durations when the provider's step coverage is demonstrably consistent.
 */
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
function remainingStepSeconds(route,progress,providerSeconds){
 const steps=Array.isArray(route?.steps)?route.steps:[];
 if(!steps.length||steps.length>700||!(route.distance>0))return null;
 const segments=steps.filter(s=>Number.isFinite(s?.distance)&&s.distance>0&&
   Number.isFinite(s?.duration)&&s.duration>=0&&s.duration<=86400)
   .map(s=>({distance:s.distance,duration:s.duration}));
 const meters=segments.reduce((sum,s)=>sum+s.distance,0);
 const seconds=segments.reduce((sum,s)=>sum+s.duration,0);
 const expected=route.distance*1000;
 // Reject truncated instruction lists, incomplete durations and mismatched
 // provider units. Better to label a fallback than make up a confident ETA.
 if(segments.length===0||meters<expected*.80||meters>expected*1.20||
    seconds<providerSeconds*.70||seconds>providerSeconds*1.30)return null;
 const covered=progress*meters;
 let passed=0,remaining=0;
 for(const segment of segments){
   const local=clamp((covered-passed)/segment.distance,0,1);
   remaining+=segment.duration*(1-local);
   passed+=segment.distance;
 }
 // Calibrate to the exact provider route ETA; do not allow the sum of step
 // rounding to alter the ETA shown at trip start.
 return clamp(remaining*providerSeconds/seconds,0,providerSeconds);
}
export function navigationSummary(route,guidance,now=Date.now()){
 const duration=Number(route?.duration);
 const distance=Number(route?.distance);
 if(!Number.isFinite(duration)||duration<0||!Number.isFinite(distance)||distance<0||!Number.isFinite(now))
   return null;
 const rawProgress=Number(guidance?.progress);
 const progress=guidance?.progress!==undefined&&guidance?.progress!==null&&Number.isFinite(rawProgress)
   ?clamp(rawProgress,0,1):0;
 const exact=Number.isFinite(route?.durationSeconds)&&route.durationSeconds>=0?
   route.durationSeconds:duration*60;
 const weighted=remainingStepSeconds(route,progress,exact);
 const remainingSeconds=weighted===null?exact*(1-progress):weighted;
 const remainingKm=distance*(1-progress);
 return {
   remainingMinutes:Math.max(0,Math.ceil(remainingSeconds/60)),
   remainingSeconds:Math.max(0,remainingSeconds),
   remainingKm:Math.max(0,remainingKm),
   arrivalAt:new Date(now+remainingSeconds*1000),
   progress,
   etaMethod:weighted===null?'proportional-fallback':'provider-steps'
 };
}
/** Rescale remaining provider step time after a fresh traffic query matching
 * the SAME remaining road corridor. Never silently replace route geometry. */
/** Never dereference a missing review or route on the first map render.
 * An absent route must NOT equal an absent review.route (undefined === undefined).
 */
export function selectFreshEtaReview(review,route,now=Date.now()){
 if(!review||!route||review.route!==route||!Number.isFinite(now)||
    !Number.isFinite(review.checkedAt)||review.checkedAt>now||
    now-review.checkedAt>=360000)return null;
 return review;
}
export function navigationSummaryWithRefresh(summary,refresh,now=Date.now()){
 if(!summary||!refresh||!Number.isFinite(refresh.baseSeconds)||
   refresh.baseSeconds<=0||!Number.isFinite(refresh.freshSeconds)||refresh.freshSeconds<=0||
   !Number.isFinite(refresh.progress)||summary.progress+0.015<refresh.progress)return summary;
 const factor=clamp(summary.remainingSeconds/refresh.baseSeconds,0,1);
 const remainingSeconds=refresh.freshSeconds*factor;
 return {...summary,remainingSeconds,remainingMinutes:Math.ceil(remainingSeconds/60),
   arrivalAt:new Date(now+remainingSeconds*1000),
   etaMethod:summary.etaMethod+'+verified-corridor-refresh'};
}
export function arrivalClock(date,locale='pt-BR'){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return '--:--';
 try{return new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
 catch{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
}

/** Human-readable arrival day for the V2 HUD and route preview.
 * The date is calculated from the provider ETA, never simulated camera speed.
 */
export function arrivalCalendarDate(date,locale='pt-BR'){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return 'Data indisponível';
 const options={weekday:'long',day:'numeric',month:'long',year:'numeric'};
 try{return new Intl.DateTimeFormat(locale,options).format(date);}
 catch{return new Intl.DateTimeFormat('pt-BR',options).format(date);}
}
