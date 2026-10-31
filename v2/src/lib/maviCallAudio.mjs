/** Original two-tone "call answered" cue. Only called for an explicit V2 user tap.
 * Not linked to recognition restarts, speech turn changes, or notification events.
 */
export function playMaviConnectChime(context){
 if(!context||typeof context.createOscillator!=='function')return;
 const now=context.currentTime+0.035;
 for(const [frequency,offset,duration] of [[523.25,0,0.115],[698.46,0.135,0.18]]){
  const osc=context.createOscillator(),gain=context.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(frequency,now+offset);
  gain.gain.setValueAtTime(0.0001,now+offset);
  gain.gain.exponentialRampToValueAtTime(0.038,now+offset+0.027);
  gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+duration);
  osc.connect(gain);gain.connect(context.destination);
  osc.start(now+offset);osc.stop(now+offset+duration+0.015);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
}
