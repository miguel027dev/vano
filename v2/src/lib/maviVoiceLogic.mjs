/** MAVI voice parsing. The browser can produce either one complete utterance
 * or separate recognition results for "Mavi" and the actual request.
 * This code never stores or transmits non-wake-word utterances.
 * Note: browser STT itself may be supplied by the browser vendor.
 */
export function normalizeMaviSpeech(value) {
 return String(value||'').slice(0,400).toLowerCase().normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function extractMaviCommand(transcript){
 const text=normalizeMaviSpeech(transcript);
 // Conservative PT-BR transcription variants; do not treat "me avise" as wake word.
 const wake=text.match(/^(?:(?:ei|oi|ola|hey|o|ok|opa) )?(?:mavi|mavy|mave|mavie|marvi|ma vi|ma ve|mevi)(?: |$)/);
 return wake?text.slice(wake[0].length).trim():null;
}
export function consumeMaviTranscript(transcript,{wakeUntil=0,now=Date.now()}={}){
 const text=normalizeMaviSpeech(transcript);
 if(!text)return {kind:'ignore',wakeUntil};
 const command=extractMaviCommand(text);
 if(command!==null){
   if(command)return {kind:'command',command,wakeUntil:0};
   return {kind:'wake',wakeUntil:now+8000};
 }
 if(wakeUntil>now && text.length>=2)return {kind:'command',command:text,wakeUntil:0};
 return {kind:'ignore',wakeUntil:0};
}
export function maviConfirmation(command){
 const s=normalizeMaviSpeech(command);
 // Requests for additional alternatives must not accidentally confirm current option.
 if(/\b(outra|outro|nova|novo|recalcula|recalcular|procura|buscar|calcula)\b/.test(s))return null;
 if(/^(?:nao|cancelar|cancela|mantem|manter|deixa|prefiro a atual|fica com a atual|nao troca)\b/.test(s) ||
    /\b(nao gostei|nao quero|mantem essa|mantem a atual|deixa como esta)\b/.test(s))return 'reject';
 if(/^(?:sim|aceito|confirma|confirmar|confirmado|pode|ok|fechado)\b/.test(s) ||
    /\b(gostei dessa|gostei desta|pode ser essa|pode ser esta|pode trocar|usa essa|usar essa|siga por essa|vamos nessa)\b/.test(s))
   return 'accept';
 return null;
}
export function maviRearmDelay({silentCount=0,hardCount=0,wakePending=false}={}){
 if(hardCount>=3)return null;
 if(wakePending)return 400;
 if(hardCount>0)return Math.min(12000,2000*Math.pow(2,hardCount-1));
 return Math.min(3300,700+Math.max(0,silentCount)*450);
}
