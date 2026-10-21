/** Only summarize verified, fresh, selected-route evidence already on screen.
 * No GPS, raw incident details or claims of safety are passed to the assistant.
 */
export function maviTrafficSummary(feed,{authorized=false,hasRoute=false}={}){
  if(!authorized||!hasRoute||feed?.hasData!==true||feed.status==='stale'||feed.status==='loading')return null;
  const events=Array.isArray(feed.events)?feed.events.slice(0,12):[];
  const significant=events.filter(e=>['heavy','stopped'].includes(e?.severity));
  const delays=events.map(e=>e?.delaySeconds).filter(n=>Number.isFinite(n)&&n>0&&n<=7200);
  return {hasData:true,incidentCount:events.length,heavySegments:significant.length,
    // The largest single known incident delay, never an invented total trip delay.
    maxIncidentDelayMinutes:delays.length?Math.ceil(Math.max(...delays)/60):null};
}
