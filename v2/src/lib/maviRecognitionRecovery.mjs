/** Android Web SpeechRecognition is often one-shot despite continuous=true.
 * An empty or errored session MUST NOT silently restart: doing so repeatedly
 * triggers audible permission/microphone sounds without ever transcribing.
 * Resume on user tap, or after a *successful answered* voice turn only.
 */
export const MAVI_IDLE_RESTART_LIMIT=1;
export function maviRecognitionRecovery({idleEnds=0,hadSpeech=false,error=''}={}){
 const reason=String(error||'');
 if(reason&&reason!=='no-speech'&&reason!=='aborted')
  return {retry:false,paused:true,delay:0,reason:'error'};
 if(hadSpeech)return {retry:false,paused:false,delay:0,reason:'answered'};
 return {retry:false,paused:true,delay:0,
  reason:reason==='no-speech'?'no-speech':idleEnds?'idle':'empty'};
}
