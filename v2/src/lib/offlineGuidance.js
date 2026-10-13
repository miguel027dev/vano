/** Instructions are tied to real fixes, not network availability or route animation. */
export function spokenCue(guidance,{fresh=true,preview=false,muted=false,speed=0,language='pt-BR'}={}){
 if(!fresh||preview||muted||!guidance||!guidance.instruction||guidance.finished)return null;
 const distance=Number(guidance.distance);if(!Number.isFinite(distance)||distance<0)return null;
 const ahead=Math.max(180,Math.min(500,(Number(speed)||0)*18));
 const stage=distance<=40?'now':distance<=ahead?'soon':null;
 if(!stage)return null;
 const key=`${guidance.stepIndex??''}:${guidance.instruction}:${stage}`;
 const rounded=Math.max(50,Math.round(distance/50)*50);
 const lead=stage==='now'?'':language==='fr-FR'?`Dans ${rounded} mètres, `:language==='en-US'?`In ${rounded} meters, `:`Em ${rounded} metros, `;
 return {key,text:lead+guidance.instruction,language};
}
