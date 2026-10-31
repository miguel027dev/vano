import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Phone,PhoneOff,Volume2,VolumeX,X,AudioLines} from 'lucide-react';
import {api,fetchMaviLiveCallStream} from '../lib/api.js';
import {onNavigationAudioStart,navigationAudioActive} from '../lib/maviAudioFocus.mjs';
import {playMaviConnectChime} from '../lib/maviCallAudio.mjs';
import './MaviLiveCall.css';

const compact=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const browserRecognizer=()=>typeof window==='undefined'?null:
 (window.SpeechRecognition||window.webkitSpeechRecognition||null);

/** Admin /v2 only. Audio and recognition are independent from GPS/navigation.
 * This remains a browser-STT preview, not a native WebRTC full-duplex call.
 */
export default function MaviLiveCall({active=true}){
 const [ready,setReady]=useState(null);
 const [open,setOpen]=useState(false);
 const [connected,setConnected]=useState(false);
 const [phase,setPhase]=useState('idle');
 const [detail,setDetail]=useState('');
 const [heard,setHeard]=useState('');
 const [reply,setReply]=useState('');
 const [muted,setMuted]=useState(false);

 const mounted=useRef(false),call=useRef(false),round=useRef(0);
 const recognizer=useRef(null),recognizerRunning=useRef(false),restart=useRef(null);
 const rapidEnds=useRef(0),startedAt=useRef(0),fatal=useRef(false);
 const request=useRef(null),audio=useRef(null),sources=useRef(new Set()),head=useRef(0);
 const history=useRef([]),lastAssistant=useRef(''),lastAssistantAt=useRef(0);
 const recentFinal=useRef({text:'',at:0}),mutedRef=useRef(false);
 const phoneSession=useRef(0);

 const stopAudio=useCallback(()=>{
  round.current+=1;
  request.current?.abort();
  request.current=null;
  for(const source of [...sources.current]){
   try{source.stop();}catch{/* source already stopped */}
  }
  sources.current.clear();
  head.current=audio.current?.currentTime||0;
 },[]);

 const endCall=useCallback((message='Chamada encerrada')=>{
  call.current=false;
  phoneSession.current+=1;
  clearTimeout(restart.current);restart.current=null;
  stopAudio();
  const engine=recognizer.current;
  recognizer.current=null;
  recognizerRunning.current=false;
  if(engine){engine.onend=null;engine.onresult=null;engine.onerror=null;try{engine.abort();}catch{/* already stopped */}}
  const ctx=audio.current;
  audio.current=null;
  if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
  if(mounted.current){
   setConnected(false);setPhase('idle');setDetail(message);
  }
 },[stopAudio]);

 useEffect(()=>{
  mounted.current=true;
  const controller=new AbortController();
  api('/admin/mavi-live/capabilities',{signal:controller.signal})
   .then(info=>{if(mounted.current)setReady(info?.enabled===true);})
   .catch(()=>{if(mounted.current)setReady(false);});
  const release=onNavigationAudioStart(()=>{
   if(!call.current)return;
   stopAudio();
   if(mounted.current)setPhase('listening');
  });
  return ()=>{
   mounted.current=false;
   controller.abort();release();endCall();
  };
 },[endCall,stopAudio]);

 useEffect(()=>{if(!active&&call.current)endCall('Chamada pausada ao sair do mapa.');},[active,endCall]);

 function isAssistantEcho(transcript){
  const said=compact(transcript),answer=compact(lastAssistant.current);
  if(!said||!answer)return false;
  if(answer.includes(said)&&said.length>=7)return true;
  if(Date.now()-lastAssistantAt.current>1300&&sources.current.size===0)return false;
  const words=said.split(' ').filter(w=>w.length>=4);
  if(words.length<3)return false;
  const hit=words.filter(word=>answer.split(' ').includes(word)).length;
  return hit>=Math.ceil(words.length*0.7);
 }
 function schedulePcm(encoded,turn){
  if(!call.current||turn!==round.current||mutedRef.current||navigationAudioActive())return;
  const ctx=audio.current;
  if(!ctx||ctx.state==='closed')return;
  let raw;
  try{raw=atob(encoded);}catch{return;}
  const count=Math.floor(raw.length/2);
  if(!count||count>72000)return;
  const audioBuffer=ctx.createBuffer(1,count,24000);
  const floats=audioBuffer.getChannelData(0);
  for(let i=0;i<count;i++){
   let sample=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
   if(sample&32768)sample-=65536;
   floats[i]=sample/32768;
  }
  const source=ctx.createBufferSource();
  source.buffer=audioBuffer;
  source.connect(ctx.destination);
  source.onended=()=>{
   sources.current.delete(source);
   try{source.disconnect();}catch{/* detached */}
   if(call.current&&turn===round.current&&!sources.current.size&&mounted.current){
    setPhase(request.current?'thinking':'listening');
   }
  };
  const when=Math.max(ctx.currentTime+0.012,head.current);
  sources.current.add(source);
  head.current=when+audioBuffer.duration;
  source.start(when);
  lastAssistantAt.current=Date.now();
  if(mounted.current)setPhase('speaking');
 }
 async function talk(transcript){
  const text=String(transcript||'').trim().slice(0,360);
  if(!call.current||text.length<2||isAssistantEcho(text))return;
  const now=Date.now(),normalized=compact(text);
  if(normalized===recentFinal.current.text&&now-recentFinal.current.at<1700)return;
  recentFinal.current={text:normalized,at:now};
  stopAudio();
  const turn=round.current;
  const previous=history.current.slice(-6);
  history.current=[...previous,{role:'user',content:text}].slice(-6);
  lastAssistant.current='';
  if(mounted.current){setHeard(text);setReply('');setPhase('thinking');setDetail('');}
  const ctrl=new AbortController();
  request.current=ctrl;
  let answer='',pending='',complete=false;
  try{
   const response=await fetchMaviLiveCallStream({text,history:previous},{signal:ctrl.signal});
   const reader=response.body?.getReader();
   if(!reader)throw Error('no_audio_stream');
   const decoder=new TextDecoder();
   const parse=line=>{
    let packet;
    try{packet=JSON.parse(line);}catch{return;}
    if(turn!==round.current||!call.current)return;
    if(packet.type==='text'&&typeof packet.delta==='string'){
     answer=(answer+packet.delta).slice(0,420);
     lastAssistant.current=answer;
     lastAssistantAt.current=Date.now();
     if(mounted.current)setReply(answer);
    }else if(packet.type==='audio'&&typeof packet.pcm==='string'){
     schedulePcm(packet.pcm,turn);
    }else if(packet.type==='complete'){
     complete=true;
    }else if(packet.type==='error'){
     if(mounted.current){setDetail('Resposta interrompida pelo serviço de voz.');setPhase('error');}
    }
   };
   while(call.current&&turn===round.current){
    const {value,done}=await reader.read();
    if(done)break;
    pending+=decoder.decode(value,{stream:true});
    if(pending.length>300000)throw Error('stream_too_large');
    let end;
    while((end=pending.indexOf('\n'))>=0){
     const line=pending.slice(0,end);pending=pending.slice(end+1);
     if(line)parse(line);
    }
   }
   if(pending.trim()&&turn===round.current)parse(pending);
   if(complete&&answer&&turn===round.current)history.current=[
    ...history.current,{role:'assistant',content:answer}
   ].slice(-6);
  }catch(error){
   if(error.name!=='AbortError'&&turn===round.current&&mounted.current){
    setPhase('error');setDetail('Não consegui responder agora. Pode falar novamente.');
   }
  }finally{
   if(turn===round.current){
    request.current=null;
    if(call.current&&!sources.current.size&&mounted.current)setPhase('listening');
   }
  }
 }
 function beginListening(){
  if(!call.current||!recognizer.current||recognizerRunning.current)return;
  try{recognizer.current.start();}
  catch(error){
   if(error?.name!=='InvalidStateError'&&mounted.current){
    setDetail('O reconhecimento de fala não iniciou.');
   }
  }
 }
 function startCall(){
  if(call.current){setOpen(true);return;}
  setOpen(true);
  if(ready!==true){setDetail('A chamada ainda não está configurada no servidor.');return;}
  const Recognizer=browserRecognizer();
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Recognizer||!Context){
   setDetail('Este navegador não oferece reconhecimento contínuo de fala e áudio.');
   return;
  }
  if(navigationAudioActive()){
   setDetail('Conclua a orientação de navegação atual antes de iniciar.');
   return;
  }
  try{
   const ctx=new Context({latencyHint:'interactive'});
   audio.current=ctx;
   // Autoplay unlocking must happen synchronously inside the button click.
   void ctx.resume().catch(()=>{});
   playMaviConnectChime(ctx);
   const engine=new Recognizer();
   engine.lang='pt-BR';
   engine.continuous=true;
   engine.interimResults=true;
   engine.maxAlternatives=1;
   recognizer.current=engine;
   rapidEnds.current=0;startedAt.current=0;fatal.current=false;
   lastAssistant.current='';history.current=[];recentFinal.current={text:'',at:0};
   round.current+=1;phoneSession.current+=1;
   const session=phoneSession.current;
   engine.onstart=()=>{
    if(!call.current||session!==phoneSession.current)return;
    recognizerRunning.current=true;
    startedAt.current=Date.now();
    if(mounted.current){setPhase('listening');setDetail('');}
   };
   engine.onresult=event=>{
    if(!call.current||session!==phoneSession.current)return;
    for(let i=event.resultIndex;i<event.results.length;i++){
     const result=event.results[i];
     const utterance=result?.[0]?.transcript?.trim();
     if(!utterance||isAssistantEcho(utterance))continue;
     if(result.isFinal){void talk(utterance);continue;}
     const words=compact(utterance).split(' ').filter(Boolean);
     if(words.length>=3&&(request.current||sources.current.size)){
      // Cancel once per interruption, not once for every interim character.
      stopAudio();
      if(mounted.current){setPhase('listening');setDetail('Pode continuar falando.');}
     }
    }
   };
   engine.onerror=event=>{
    if(!call.current||session!==phoneSession.current)return;
    const code=String(event?.error||'');
    if(['not-allowed','service-not-allowed','audio-capture','network','language-not-supported'].includes(code)){
     fatal.current=true;
     endCall(code==='not-allowed'||code==='service-not-allowed'?
      'Permita o acesso ao microfone para conversar.':
      'Reconhecimento de voz indisponível neste navegador.');
     if(mounted.current)setOpen(true);
    }
   };
   engine.onend=()=>{
    recognizerRunning.current=false;
    if(!call.current||session!==phoneSession.current||fatal.current)return;
    const elapsed=Date.now()-startedAt.current;
    rapidEnds.current=elapsed<1200?rapidEnds.current+1:0;
    if(rapidEnds.current>=3){
     endCall('O navegador encerrou o reconhecimento repetidamente. Verifique o microfone.');
     return;
    }
    const delay=rapidEnds.current?Math.min(2000,400*2**rapidEnds.current):300;
    clearTimeout(restart.current);
    restart.current=setTimeout(()=>{
     if(call.current&&session===phoneSession.current)beginListening();
    },delay);
   };
   call.current=true;
   setConnected(true);setMuted(false);mutedRef.current=false;
   setHeard('');setReply('');setPhase('connecting');setDetail('');
   beginListening();
  }catch{
   endCall('Não foi possível abrir a chamada. Verifique o navegador.');
   if(mounted.current)setOpen(true);
  }
 }
 function switchMute(){
  mutedRef.current=!mutedRef.current;
  setMuted(mutedRef.current);
  if(mutedRef.current){
   for(const source of [...sources.current])try{source.stop();}catch{/* ended */}
   sources.current.clear();
   head.current=audio.current?.currentTime||0;
  }
 }
 function dismiss(){
  endCall();setOpen(false);
 }
 const status=phase==='listening'?'Ouvindo você':phase==='thinking'?'Preparando resposta':
  phase==='speaking'?'MAVI falando':phase==='connecting'?'Ligando...':
  phase==='error'?'Problema na resposta':'Chamada de voz';
 const content=open&&createPortal(
  <section className="mavi-live-panel" aria-label="Chamada de voz MAVI" role="dialog" aria-modal="false">
   <header className="mavi-live-heading">
    <div className="mavi-live-identity"><span className="mavi-live-avatar"><AudioLines size={22}/></span>
     <span><strong>MAVI</strong><small>Assistente do VANO Maps</small></span>
    </div>
    <button type="button" className="mavi-live-close" aria-label="Fechar chamada" onClick={dismiss}><X size={19}/></button>
   </header>
   <div className="mavi-live-call-state" role="status" aria-live="polite">
    <span className={connected?'mavi-live-dot active':'mavi-live-dot'}/>
    <strong>{status}</strong>
    {connected&&<span className="mavi-live-live-tag">AO VIVO</span>}
   </div>
   {detail&&<p className="mavi-live-detail">{detail}</p>}
   <div className="mavi-live-transcript" aria-live="polite">
    {heard&&<p className="mavi-live-said"><span>Você</span>{heard}</p>}
    {reply&&<p className="mavi-live-answered"><span>MAVI</span>{reply}</p>}
    {!heard&&!reply&&<p className="mavi-live-prompt">{connected?'Estou ouvindo. Pode falar naturalmente.':'Toque para iniciar sua conversa.'}</p>}
   </div>
   <footer className="mavi-live-actions">
    <button type="button" className={connected?'mavi-live-end':'mavi-live-start'} onClick={connected?()=>endCall():startCall}>
     {connected?<PhoneOff size={19}/>:<Phone size={19}/>}
     {connected?'Encerrar':'Iniciar chamada'}
    </button>
    {connected&&<button type="button" className="mavi-live-mute" onClick={switchMute} aria-label={muted?'Ativar voz da MAVI':'Silenciar voz da MAVI'}>
     {muted?<VolumeX size={20}/>:<Volume2 size={20}/>}
    </button>}
   </footer>
   <p className="mavi-live-note">Teste exclusivo da V2. A MAVI pode ser interrompida. Prefira fones e nunca opere enquanto dirige.</p>
  </section>,document.body
 );
 return <>
  <button type="button" className={`circle-btn mavi-live-trigger ${connected?'is-connected':''}`}
   onClick={()=>connected?dismiss():startCall()}
   aria-label={connected?'Encerrar chamada com MAVI':'Ligar para MAVI'}
   aria-expanded={open} title={connected?'Encerrar chamada MAVI':'Conversar com MAVI'}>
   {connected?<PhoneOff size={21} strokeWidth={2.2}/>:<Phone size={21} strokeWidth={2.2}/>}
   {connected&&<span className="mavi-live-ring" aria-hidden="true"/>}
  </button>
  {content}
 </>;
}
