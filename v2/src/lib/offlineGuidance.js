/** Navigation announcements are derived from accepted GPS route steps only.
 * A short second turn is announced as a sequence, not as an abrupt new command.
 */
export function spokenCue(guidance,{fresh=true,preview=false,muted=false,speed=0,language='pt-BR'}={}){
 if(!fresh||preview||muted||!guidance||!guidance.instruction||guidance.finished)return null;
 const distance=Number(guidance.distance);
 if(!Number.isFinite(distance)||distance<0)return null;
 const velocity=Number.isFinite(Number(speed))?Math.max(0,Number(speed)):0;
 const ahead=Math.max(180,Math.min(500,velocity*18));
 // Timing is speed-sensitive; "now" must not be spoken for a distant bend.
 const near=Math.max(16,Math.min(65,velocity*2.8+14));
 const stage=distance<=near?'now':distance<=ahead?'soon':null;
 if(!stage)return null;
 const next=guidance.following;
 const combined=stage==='soon'&&next?.instruction&&Number(next.gapMeters)>0&&Number(next.gapMeters)<=45;
 const followingIndex=combined?next.stepIndex:null;
 const key=`${guidance.stepIndex??''}:${guidance.instruction}:${stage}${combined?':'+followingIndex:''}`;
 const unit=distance<100?10:50;
 const rounded=Math.max(unit,Math.round(distance/unit)*unit);
 const lead=stage==='now'?'':language==='fr-FR'?`Dans ${rounded} mètres, `:language==='en-US'?`In ${rounded} meters, `:`Em ${rounded} metros, `;
 const first=String(guidance.instruction).trim().replace(/[.!;]+$/,'');
 const second=combined?String(next.instruction).trim().replace(/[.!;]+$/,''):'';
 const separator=language==='fr-FR'?', puis juste après, ':language==='en-US'?', then immediately, ':', e logo em seguida, ';
 const text=lead+first+(combined?separator+second.replace(/^./,c=>c.toLowerCase()):'');
 return {key,text,language,stage,distance,stepIndex:guidance.stepIndex,followingIndex};
}
