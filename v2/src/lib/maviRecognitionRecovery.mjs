/** Chrome/Android can close a SpeechRecognition session silently. Avoid
 * opening and closing the microphone forever when nobody is speaking.
 * After a few paced recoveries, leave the mic paused until a user gesture.
 */
export const MAVI_IDLE_RESTART_LIMIT=3;
export function maviRecognitionRecovery({idleEnds=0,hadSpeech=false,error=''}={}){
 const reason=String(error||'');
 if(reason&&reason!=='no-speech'&&reason!=='aborted')
  return {retry:false,paused:true,delay:0,reason:'error'};
 if(hadSpeech)return {retry:true,paused:false,delay:950,reason:'answered'};
 const attempts=Math.max(1,Number.isFinite(idleEnds)?Math.floor(idleEnds):1);
 if(attempts>=MAVI_IDLE_RESTART_LIMIT)
  return {retry:false,paused:true,delay:0,reason:'idle'};
 return {retry:true,paused:false,delay:Math.min(8500,2400*2**(attempts-1)),reason:'idle'};
}
