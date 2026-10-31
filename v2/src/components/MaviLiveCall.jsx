import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Phone,PhoneOff} from 'lucide-react';
import {api,transcribeMaviLiveTurn,fetchMaviLiveCallStream} from '../lib/api.js';
import {navigationAudioActive,onNavigationAudioStart} from '../lib/maviAudioFocus.mjs';
import {playMaviDialSequence} from '../lib/maviCallAudio.mjs';
import {micRms,voiceThreshold,shouldStartVoice} from '../lib/maviMicVAD.mjs';
import './MaviLiveCall.css';

const RING_MS=5000;
const SILENCE_MS=850;
const MAX_TURN_MS=10500;
const ECHO_TAIL_MS=950;
function preferredMime(){
 if(typeof MediaRecorder==='undefined')return '';
 return ['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus']
  .find(type=>MediaRecorder.isTypeSupported?.(type))||'';
}
/**
 * V2-only, one persistent microphone track. No SpeechRecognition instances,
 * repeated getUserMedia sessions, automatic mic prompts, or modal call panel.
 *
 * During MAVI playback microphone capture is gated to prevent feedback.
 * This intentionally prioritizes reliable turn-taking over unverified
 * simultaneous barge-in from the loudspeaker.
 */
export default function MaviLiveCall({active=true}){
 const [capabilities,setCapabilities]=useState(null);
 const [phase,setPhase]=useState('idle');
 const [notice,setNotice]=useState('');
 const mounted=useRef(false);
 const sessionRef=useRef(null);
 const counter=useRef(0);
 const starting=useRef(false);

 const cancelSources=useCallback(s=>{
  if(!s)return;
  s.llm?.abort();s.llm=null;
  s.transcribe?.abort();s.transcribe=null;
  for(const node of s.sources){
   try{node.stop();}catch{/* completed */}
  }
  s.sources.clear();
  if(s.context)s.playhead=s.context.currentTime;
 },[]);

 const endCall=useCallback((reason='')=>{
  const s=sessionRef.current;
  counter.current++;
  sessionRef.current=null;
  if(s){
   s.active=false;
   clearTimeout(s.frameTimer);
   clearTimeout(s.ringTimer);
   try{s.stopRingtone?.();}catch{/* already ended */}
   cancelSources(s);
   if(s.recorder&&s.recorder.state!=='inactive'){
    s.recorder.onstop=null;s.recorder.ondataavailable=null;
    try{s.recorder.stop();}catch{/* inactive */}
   }
   for(const track of s.stream?.getTracks?.()||[])try{track.stop();}catch{/* already stopped */}
   try{s.input?.disconnect();s.analyser?.disconnect();}catch{/* disconnected */}
   if(s.context?.state!=='closed')void s.context?.close?.().catch(()=>{});
  }
  if(mounted.current){
   setPhase('idle');
   setNotice(reason);
  }
 },[cancelSources]);
 useEffect(()=>{
  mounted.current=true;
  const ctrl=new AbortController();
  api('/admin/mavi-live/capabilities',{signal:ctrl.signal})
   .then(config=>{if(mounted.current)setCapabilities(config);})
   .catch(()=>{if(mounted.current)setCapabilities({enabled:false,sttAvailable:false});});
  const release=onNavigationAudioStart(()=>{
   const s=sessionRef.current;
   if(!s||!s.active)return;
   // Route guidance always wins; never feed guidance speech back into STT.
   s.gateUntil=Date.now()+ECHO_TAIL_MS;
   s.busy=false;
   cancelSources(s);
   // Never submit a partially recorded utterance containing navigation voice.
   const recording=s.recorder;
   s.recorder=null;s.recording=false;s.chunks=[];s.loudFrames=0;
   if(recording){
    recording.onstop=null;recording.ondataavailable=null;recording.onerror=null;
    if(recording.state!=='inactive')try{recording.stop();}catch{/* already stopped */}
   }
   mark(s,'listening');
  });
  return ()=>{
   mounted.current=false;ctrl.abort();release();endCall();
  };
 },[endCall,cancelSources]);
 useEffect(()=>{
  if(!active&&sessionRef.current)endCall('Chamada encerrada ao sair da V2.');
 },[active,endCall]);

 function mark(s,next){
  if(!s.active||sessionRef.current!==s||!mounted.current)return;
  setPhase(next);
 }
 function afterReply(s){
  if(!s.active||sessionRef.current!==s||!s.finished||s.sources.size>0)return;
  s.busy=false;s.finished=false;
  s.gateUntil=Date.now()+ECHO_TAIL_MS;
  mark(s,'listening');
 }
 function playAudio(s,pcm){
  if(!s.active||!s.context||navigationAudioActive())return;
  let bytes;
  try{bytes=atob(pcm);}catch{return;}
  const frames=Math.floor(bytes.length/2);
  if(frames<1||frames>72000)return;
  const buffer=s.context.createBuffer(1,frames,24000);
  const channel=buffer.getChannelData(0);
  for(let i=0;i<frames;i++){
   let n=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);
   if(n>32767)n-=65536;
   channel[i]=n/32768;
  }
  const node=s.context.createBufferSource();
  node.buffer=buffer;
  node.connect(s.context.destination);
  const at=Math.max(s.context.currentTime+.012,s.playhead);
  s.playhead=at+buffer.duration;
  s.sources.add(node);
  node.onended=()=>{
   s.sources.delete(node);
   try{node.disconnect();}catch{/* disconnected */}
   afterReply(s);
  };
  node.start(at);
  mark(s,'speaking');
 }
 async function respond(s,userText){
  if(!s.active||sessionRef.current!==s)return;
  const transcript=String(userText||'').trim().slice(0,360);
  if(transcript.length<2){s.busy=false;return;}
  const previous=s.history.slice(-6);
  s.history=[...previous,{role:'user',content:transcript}].slice(-6);
  const ctrl=new AbortController();s.llm=ctrl;s.finished=false;
  s.busy=true;
  mark(s,'thinking');
  let response='',partial='',completed=false;
  try{
   const upstream=await fetchMaviLiveCallStream(
    {text:transcript,history:previous},{signal:ctrl.signal});
   const reader=upstream.body?.getReader();
   if(!reader)throw Error('no_stream');
   const decoder=new TextDecoder();
   const receive=line=>{
    if(!s.active||sessionRef.current!==s)return;
    let item;try{item=JSON.parse(line);}catch{return;}
    if(item.type==='text'&&typeof item.delta==='string')
     response=(response+item.delta).slice(0,420);
    if(item.type==='audio'&&typeof item.pcm==='string')playAudio(s,item.pcm);
    if(item.type==='complete')completed=true;
    if(item.type==='error')throw Error('tts_unavailable');
   };
   while(s.active&&!ctrl.signal.aborted){
    const {value,done}=await reader.read();
    if(done)break;
    partial+=decoder.decode(value,{stream:true});
    if(partial.length>250000)throw Error('voice_stream_limit');
    let point;
    while((point=partial.indexOf('\n'))>=0){
     const line=partial.slice(0,point);partial=partial.slice(point+1);
     if(line)receive(line);
    }
   }
   if(partial.trim()&&s.active)receive(partial);
   if(completed&&response&&s.active){
    s.history.push({role:'assistant',content:response});
    s.history=s.history.slice(-6);
   }
  }catch(error){
   if(s.active&&!ctrl.signal.aborted&&mounted.current)
    setNotice('A resposta falhou. Pode falar novamente.');
  }finally{
   if(!s.active||sessionRef.current!==s)return;
   s.llm=null;s.finished=true;
   afterReply(s);
  }
 }
 async function transcribe(s,blob){
  if(!s.active||sessionRef.current!==s)return;
  if(blob.size<1800||blob.size>1_500_000){
   s.busy=false;s.gateUntil=Date.now()+350;mark(s,'listening');return;
  }
  const ctrl=new AbortController();
  s.transcribe=ctrl;
  mark(s,'transcribing');
  try{
   const transcript=await transcribeMaviLiveTurn(blob,{signal:ctrl.signal});
   if(!s.active||sessionRef.current!==s)return;
   s.transcribe=null;
   await respond(s,transcript);
  }catch(error){
   if(!s.active||sessionRef.current!==s)return;
   s.busy=false;s.gateUntil=Date.now()+450;
   s.transcribe=null;
   if(error.message!=='no_live_speech'&&mounted.current)
    setNotice('Transcrição indisponível. Verifique o serviço de voz.');
   mark(s,'listening');
  }
 }
 function finishRecord(s){
  if(!s.active||!s.recorder||s.recorder.state!=='recording')return;
  const elapsed=Date.now()-s.captureStarted;
  s.recording=false;
  s.busy=true;
  if(elapsed<430){
   s.recorder.onstop=null;s.recorder.ondataavailable=null;
   try{s.recorder.stop();}catch{/* stopped */}
   s.recorder=null;s.busy=false;s.gateUntil=Date.now()+260;
   mark(s,'listening');
   return;
  }
  const rec=s.recorder;
  rec.onstop=()=>{
   if(!s.active||sessionRef.current!==s)return;
   const blob=new Blob(s.chunks,{type:s.mime});
   s.chunks=[];s.recorder=null;
   void transcribe(s,blob);
  };
  try{rec.stop();}catch{
   rec.onstop=null;rec.ondataavailable=null;
   s.recorder=null;s.chunks=[];s.recording=false;
   s.busy=false;s.gateUntil=Date.now()+450;
   mark(s,'listening');
  }
 }
 function startRecord(s,now){
  if(!s.active||s.busy||s.recorder||!s.mime)return;
  try{
   const recorder=new MediaRecorder(s.stream,{mimeType:s.mime,audioBitsPerSecond:48000});
   s.recorder=recorder;s.chunks=[];s.captureStarted=now;
   s.lastVoice=now;s.recording=true;s.loudFrames=0;
   recorder.ondataavailable=e=>{
    if(s.active&&e.data?.size>0)s.chunks.push(e.data);
   };
   recorder.onerror=()=>{
    recorder.onstop=null;recorder.ondataavailable=null;
    try{if(recorder.state!=='inactive')recorder.stop();}catch{/* stopped */}
    s.recorder=null;s.chunks=[];s.recording=false;s.busy=false;
    s.gateUntil=Date.now()+500;mark(s,'listening');
   };
   recorder.start(200);
   mark(s,'hearing');
  }catch{
   s.recorder=null;s.recording=false;s.busy=false;
   if(mounted.current)setNotice('Não foi possível capturar sua voz.');
  }
 }
 function frame(s){
  if(!s.active||sessionRef.current!==s)return;
  const now=Date.now();
  const blocked=now<s.gateUntil||s.busy||s.ringing||navigationAudioActive();
  if(s.analyser){
   s.analyser.getByteTimeDomainData(s.sample);
   const level=micRms(s.sample);
   if(!blocked){
    const threshold=voiceThreshold(s.noiseFloor);
    const isLoud=level>=threshold;
    if(s.recording){
     if(isLoud)s.lastVoice=now;
     if(now-s.lastVoice>SILENCE_MS||now-s.captureStarted>MAX_TURN_MS)
      finishRecord(s);
    }else{
     if(!isLoud)s.noiseFloor=s.noiseFloor*.965+level*.035;
     s.loudFrames=isLoud?s.loudFrames+1:0;
     if(shouldStartVoice(level,s.noiseFloor,s.loudFrames))startRecord(s,now);
    }
   }else s.loudFrames=0;
  }
  s.frameTimer=setTimeout(()=>frame(s),40);
 }
 async function startCall(){
  if(sessionRef.current){endCall();return;}
  if(starting.current)return;
  starting.current=true;
  setNotice('');
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio){setNotice('Áudio não suportado neste navegador.');starting.current=false;return;}
  if(navigationAudioActive()){
   setNotice('Espere a orientação de navegação terminar.');starting.current=false;return;
  }
  // Unlock playback during the actual click, not after an awaited API request.
  let context;
  try{context=new Audio({latencyHint:'interactive'});void context.resume().catch(()=>{});}
  catch{setNotice('Não foi possível iniciar o áudio.');starting.current=false;return;}
  try{
   // A config update must take effect even when /v2 was open before the key changed.
   const latest=await api('/admin/mavi-live/capabilities');
   if(!mounted.current){void context.close().catch(()=>{});return;}
   setCapabilities(latest);
   if(!latest?.enabled||!latest?.sttAvailable){
    setNotice('A MAVI ainda não tem todos os provedores disponíveis no servidor.');
    void context.close().catch(()=>{});return;
   }
  }catch{
   if(mounted.current)setNotice('Não consegui verificar a sessão de voz. Atualize o login.');
   void context.close().catch(()=>{});return;
  }finally{starting.current=false;}
  const mime=preferredMime();
  if(!mime||!navigator.mediaDevices?.getUserMedia){
   setNotice('Seu navegador não oferece áudio contínuo compatível.');
   void context.close().catch(()=>{});return;
  }
  const s={
   id:++counter.current,active:true,context,stream:null,input:null,
   analyser:null,sample:null,mime,noiseFloor:.007,loudFrames:0,
   recorder:null,recording:false,chunks:[],captureStarted:0,lastVoice:0,
   busy:false,finished:false,sources:new Set(),playhead:context.currentTime,
   llm:null,transcribe:null,history:[],ringing:true,ringTimer:null,
   frameTimer:null,gateUntil:Infinity,stopRingtone:null
  };
  sessionRef.current=s;
  mark(s,'connecting');
  try{
   // ONE browser permission request per explicit call. Native permission UI
   // cannot be bypassed; after permission the track stays open until hangup.
   const stream=await navigator.mediaDevices.getUserMedia({
    video:false,audio:{
     channelCount:1,echoCancellation:true,noiseSuppression:true,
     autoGainControl:true
    }
   });
   if(!s.active||sessionRef.current!==s){
    stream.getTracks().forEach(track=>track.stop());return;
   }
   s.stream=stream;
   const input=context.createMediaStreamSource(stream);
   const analyser=context.createAnalyser();
   analyser.fftSize=1024;analyser.smoothingTimeConstant=.12;
   input.connect(analyser);
   s.input=input;s.analyser=analyser;s.sample=new Uint8Array(analyser.fftSize);
   for(const track of stream.getTracks())track.onended=()=>{
    if(s.active)endCall('O microfone foi desconectado.');
   };
   s.stopRingtone=playMaviDialSequence(context,5);
   s.gateUntil=Date.now()+RING_MS+350;
   s.ringTimer=setTimeout(()=>{
    if(s.active&&sessionRef.current===s){
     s.ringing=false;
     mark(s,'listening');
    }
   },RING_MS);
   mark(s,'ringing');
   frame(s);
  }catch(error){
   if(sessionRef.current===s){
    const reason=error?.name==='NotAllowedError'?
     'Autorize o microfone nas permissões do navegador.':
     'Não foi possível acessar o microfone.';
    endCall(reason);
   }else void context.close().catch(()=>{});
  }
 }
 const live=Boolean(sessionRef.current);
 const label=live?(phase==='ringing'?'Chamando MAVI — toque para desligar':
  phase==='speaking'?'MAVI respondendo — desligar':
  'Chamada MAVI ativa — desligar'):'Ligar para MAVI';
 return <>
  <button type="button"
   className={'circle-btn mavi-live-trigger '+(live?'is-connected ':'')+(phase==='ringing'?'is-ringing':'')}
   title={label} aria-label={label} aria-pressed={live}
   onClick={()=>live?endCall():void startCall()}>
   {live?<PhoneOff size={21} strokeWidth={2.1}/>:<Phone size={21} strokeWidth={2.2}/>}
   {live&&<span className="mavi-live-ring" aria-hidden="true"/>}
  </button>
  <span className="mavi-live-sr-status" role="status" aria-live="polite">
   {notice||(
    phase==='ringing'?'Chamando MAVI.':
    phase==='listening'?'Pode falar, a MAVI está ouvindo.':
    phase==='speaking'?'MAVI respondendo.':''
   )}
  </span>
  {notice&&<span className="mavi-live-inline-error" role="alert">{notice}</span>}
 </>;
}
