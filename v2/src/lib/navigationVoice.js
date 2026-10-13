/** Navigation audio for browser and native Android.
 * Only actual route text, no estimated/fabricated instructions.
 * A web browser has no VanoHost bridge: use its speechSynthesis directly.
 */
const VOICE_LOCALE=Object.freeze({'pt-BR':'pt-BR','pt-PT':'pt-PT','fr-FR':'fr-FR','en-US':'en-US'});
export function speakNavigationVoice(text,language='pt-BR',{
  native=false,sendNative=()=>false,scope=typeof window!=='undefined'?window:null,
  onFailure=()=>{},onStart=()=>{}
}={}){
 const phrase=String(text||'').trim();
 if(!phrase)return {ok:false,reason:'empty'};
 const locale=VOICE_LOCALE[language]||'pt-BR';
 if(native){
  try{
   if(sendNative({action:'speak',text:phrase,lang:locale,language:locale})){
    onStart();return {ok:true,channel:'native'};
   }
  }catch{/* Unavailable native host: fall back to Web Speech. */}
 }
 const synth=scope?.speechSynthesis,Utterance=scope?.SpeechSynthesisUtterance;
 if(!synth||typeof synth.speak!=='function'||typeof Utterance!=='function'){
  onFailure('unsupported');return {ok:false,reason:'unsupported'};
 }
 try{
  const speech=new Utterance(phrase);
  speech.lang=locale;
  speech.rate=.98;
  speech.volume=1;
  const voices=typeof synth.getVoices==='function'?synth.getVoices():[];
  const same=voices.find(v=>String(v.lang).toLowerCase()===locale.toLowerCase());
  const languageFamily=voices.find(v=>String(v.lang).toLowerCase().split('-')[0]===locale.split('-')[0].toLowerCase());
  if(same||languageFamily)speech.voice=same||languageFamily;
  speech.onstart=()=>onStart();
  speech.onerror=event=>{
   // A newer instruction may preempt an old one; this is not a microphone/
   // voice failure and must not trigger a false error banner.
   if(!['canceled','interrupted'].includes(event?.error))onFailure(event?.error||'synthesis');
  };
  synth.cancel(); // Do not queue obsolete turn-by-turn instructions.
  synth.speak(speech);
  return {ok:true,channel:'web'};
 }catch(error){
  onFailure(error?.message||'synthesis');return {ok:false,reason:'synthesis'};
 }
}
export function stopNavigationVoice({native=false,sendNative=()=>false,
 scope=typeof window!=='undefined'?window:null}={}){
 if(native){try{sendNative({action:'stopSpeech'});}catch{/* no host */}}
 try{scope?.speechSynthesis?.cancel?.();}catch{/* unsupported */ }
}
