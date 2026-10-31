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

/**
 * Single five-second, low-volume call progress tone. The browser's native
 * permission/safety indicator is outside the app's control.
 * Returns a cancel function. Never invoked on speech turns or recorder cycles.
 */
export function playMaviDialSequence(context,seconds=5){
 if(!context||typeof context.createOscillator!=='function')return ()=>{};
 const duration=Math.min(5,Math.max(1,Number(seconds)||5));
 const start=context.currentTime+0.04;
 const nodes=[];
 const note=(freq,at,length,volume)=>{
  const osc=context.createOscillator(),gain=context.createGain();
  osc.type='sine';
  osc.frequency.setValueAtTime(freq,start+at);
  gain.gain.setValueAtTime(.0001,start+at);
  gain.gain.exponentialRampToValueAtTime(volume,start+at+.035);
  gain.gain.exponentialRampToValueAtTime(.0001,start+at+length);
  osc.connect(gain);gain.connect(context.destination);
  osc.start(start+at);osc.stop(start+at+length+.035);
  osc.onended=()=>{try{osc.disconnect();gain.disconnect();}catch{/* stopped */}};
  nodes.push(osc);
 };
 for(let beat=0;beat<4;beat++){
  const offset=beat*1.1;
  if(offset+.62>duration-.25)break;
  note(425,offset,.21,.019);
  note(480,offset+.26,.25,.019);
 }
 const connected=Math.max(0,duration-.31);
 note(622.25,connected,.12,.025);
 note(783.99,connected+.13,.17,.026);
 let stopped=false;
 return ()=>{
  if(stopped)return;
  stopped=true;
  for(const osc of nodes)try{osc.stop();}catch{/* already finished */}
 };
}
