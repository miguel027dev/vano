/**
 * Optional local full-duplex barge-in detector for MAVI.
 *
 * While MAVI speaks, a separate echo-cancelled microphone monitor can hear
 * user activity and interrupt the pending reply. Audio is never uploaded here.
 * It intentionally does NOT attempt to transcribe words: the existing
 * SpeechRecognition pipeline starts after the interruption.
 *
 * AEC and a sustained speech-band gate reduce false interruptions; devices
 * without Web Audio or microphone access retain the previous half-duplex flow.
 */
export function createMaviBargeInGate({
 minRms=0.042, noiseMultiplier=3.1, minVoiceRatio=0.38, minHoldMs=450
}={}){
 let baseline=0.012, armed=false, armedAt=0, firstLoud=null, fired=false;
 return {
  arm(value,at=0,graceMs=700){
   armed=Boolean(value);armedAt=at+graceMs;firstLoud=null;fired=false;
  },
  sample(rms,voiceRatio,at){
   if(!Number.isFinite(rms)||rms<0||!Number.isFinite(at))return false;
   if(!armed){
    // Learn cabin/road noise only while MAVI is not speaking.
    baseline=Math.min(0.12,baseline*0.97+Math.min(rms,0.12)*0.03);
    firstLoud=null;return false;
   }
   if(fired||at<armedAt)return false;
   const threshold=Math.max(minRms,baseline*noiseMultiplier);
   const isSpeech=rms>=threshold&&voiceRatio>=minVoiceRatio;
   if(!isSpeech){firstLoud=null;return false;}
   if(firstLoud===null)firstLoud=at;
   if(at-firstLoud<minHoldMs)return false;
   fired=true;return true;
  },
  get baseline(){return baseline;}
 };
}
export function createMaviBargeInMonitor({onBargeIn,mediaDevices,AudioContextClass,clock=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stream=null,ctx=null,source=null,timer=null,disposed=false,started=false,active=false;
 const gate=createMaviBargeInGate();
 function arm(value,graceMs=700){
  active=Boolean(value);
  gate.arm(active,clock(),graceMs);
 }
 function stop(){
  disposed=true;active=false;gate.arm(false,clock(),0);
  if(timer!==null){clearTimer(timer);timer=null;}
  try{source?.disconnect();}catch{}
  source=null;
  if(stream){for(const track of stream.getTracks())track.stop();}
  stream=null;
  if(ctx){try{void ctx.close();}catch{}}
  ctx=null;
 }
 async function start(){
  if(started||disposed)return started;
  const media=mediaDevices||globalThis.navigator?.mediaDevices;
  const Ctx=AudioContextClass||globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!media?.getUserMedia||!Ctx)return false;
  let nextStream,context;
  try{
   nextStream=await media.getUserMedia({audio:{
    echoCancellation:true,noiseSuppression:true,autoGainControl:true
   },video:false});
   if(disposed){nextStream.getTracks().forEach(t=>t.stop());return false;}
   const track=nextStream.getAudioTracks()[0];
   if(!track||track.getSettings?.().echoCancellation===false)
    throw Error('mavi_duplex_echo_cancellation_unavailable');
   context=new Ctx();
   const input=context.createMediaStreamSource(nextStream);
   const analyser=context.createAnalyser();
   analyser.fftSize=1024;analyser.smoothingTimeConstant=0.45;
   input.connect(analyser);
   if(context.state==='suspended')await context.resume();
   if(disposed){
    nextStream.getTracks().forEach(t=>t.stop());
    void context.close();return false;
   }
   stream=nextStream;ctx=context;source=input;started=true;
   const waveform=new Float32Array(analyser.fftSize);
   const frequencies=new Uint8Array(analyser.frequencyBinCount);
   const hzPerBin=context.sampleRate/analyser.fftSize;
   const tick=()=>{
    if(disposed||!started)return;
    analyser.getFloatTimeDomainData(waveform);
    let sum=0;
    for(const v of waveform)sum+=v*v;
    const rms=Math.sqrt(sum/waveform.length);
    analyser.getByteFrequencyData(frequencies);
    let speech=0,total=0;
    for(let i=1;i<frequencies.length;i++){
     const power=frequencies[i]*frequencies[i];
     total+=power;
     const hz=i*hzPerBin;
     if(hz>=170&&hz<=3400)speech+=power;
    }
    const voiceRatio=total>0?speech/total:0;
    const interrupted=gate.sample(rms,voiceRatio,clock());
    if(interrupted&&active){
     arm(false,0);
     try{onBargeIn?.();}catch{/* microphone callback must not break map */}
    }
    timer=setTimer(tick,60);
   };
   tick();
   return true;
  }catch{
   try{nextStream?.getTracks().forEach(t=>t.stop());}catch{}
   try{void context?.close();}catch{}
   return false;
  }
 }
 return {start,arm,stop};
}
