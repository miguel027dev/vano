import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Mic,Phone,PhoneOff,Volume2,VolumeX,X} from 'lucide-react';
import {api,fetchMaviLiveCallStream} from '../lib/api.js';
import {onNavigationAudioStart,navigationAudioActive} from '../lib/maviAudioFocus.mjs';
import './MaviLiveCall.css';

const simplify=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

export default function MaviLiveCall(){
 const [available,setAvailable]=useState(false);
 const [open,setOpen]=useState(false);
 const [inCall,setInCall]=useState(false);
 const [state,setState]=useState('Desligado');
 const [heard,setHeard]=useState('');
 const [answered,setAnswered]=useState('');
 const [muted,setMuted]=useState(false);
 const alive=useRef(true),call=useRef(false),generation=useRef(0);
 const recognition=useRef(null),restartTimer=useRef(null),request=useRef(null);
 const audio=useRef(null),sources=useRef(new Set()),playhead=useRef(0);
 const history=useRef([]),assistant=useRef(''),lastTurn=useRef('');
 const silence=useRef(false);
 const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

 useEffect(()=>{
  alive.current=true;
  api('/admin/mavi-live/capabilities').then(info=>{if(alive.current)setAvailable(info?.enabled===true);}).catch(()=>{});
  const release=onNavigationAudioStart(()=>stopAudioAndRequest());
  return ()=>{alive.current=false;stopCall();release();};
 },[]);
 function stopAudioAndRequest(){
  generation.current++;
  request.current?.abort();request.current=null;
  for(const source of sources.current){try{source.stop();}catch{/* ended */}}
  sources.current.clear();
  playhead.current=audio.current?.currentTime||0;
 }
 function echoOfMavi(text){
  const said=simplify(text),reply=simplify(assistant.current);
  return said.length>=8&&reply.length>=8&&(reply.includes(said)||said.includes(reply));
 }
 function playPcm(encoded,id){
  if(id!==generation.current||!call.current||silence.current||!audio.current||navigationAudioActive())return;
  const raw=atob(encoded),count=Math.floor(raw.length/2);
  if(!count||count>48000)return;
  const buffer=audio.current.createBuffer(1,count,24000),data=buffer.getChannelData(0);
  for(let i=0;i<count;i++){
   let value=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
   if(value>32767)value-=65536;
   data[i]=value/32768;
  }
  const source=audio.current.createBufferSource();
  source.buffer=buffer;
  source.connect(audio.current.destination);
  source.onended=()=>{
   sources.current.delete(source);
   try{source.disconnect();}catch{/* already disposed */}
   if(!sources.current.size&&call.current&&id===generation.current)setState('Ouvindo');
  };
  const when=Math.max(audio.current.currentTime+0.02,playhead.current);
  sources.current.add(source);
  source.start(when);
  playhead.current=when+buffer.duration;
  setState('MAVI falando · pode interromper');
 }
 async function ask(text){
  text=String(text||'').trim().slice(0,360);
  if(text.length<2||!call.current||echoOfMavi(text))return;
  if(lastTurn.current===text)return;
  lastTurn.current=text;
  stopAudioAndRequest();
  const id=generation.current,prior=history.current.slice(-6);
  history.current=[...prior,{role:'user',content:text}].slice(-6);
  assistant.current='';
  setHeard(text);setAnswered('');setState('MAVI pensando...');
  const controller=new AbortController();
  request.current=controller;
  let reply='',pending='';
  try{
   const response=await fetchMaviLiveCallStream({text,history:prior},{signal:controller.signal});
   const reader=response.body?.getReader();
   if(!reader)throw Error('no_stream');
   const decoder=new TextDecoder();
   const handle=event=>{
    if(id!==generation.current)return;
    let item;try{item=JSON.parse(event);}catch{return;}
    if(item.type==='text'&&typeof item.delta==='string'){
     reply=(reply+item.delta).slice(0,420);
     assistant.current=reply;
     if(alive.current)setAnswered(reply);
    }else if(item.type==='audio'&&typeof item.pcm==='string'){
     playPcm(item.pcm,id);
    }else if(item.type==='error'){
     if(alive.current)setState('Falha na resposta. Pode tentar de novo.');
    }else if(item.type==='complete'&&reply){
     history.current=[...history.current,{role:'assistant',content:reply}].slice(-6);
    }
   };
   while(id===generation.current){
    const {value,done}=await reader.read();
    if(done)break;
    pending+=decoder.decode(value,{stream:true});
    if(pending.length>400000)throw Error('stream_too_large');
    let end;
    while((end=pending.indexOf('\n'))>=0){
     const line=pending.slice(0,end);
     pending=pending.slice(end+1);
     if(line)handle(line);
    }
   }
   if(pending.trim()&&id===generation.current)handle(pending);
  }catch(error){
   if(error.name!=='AbortError'&&id===generation.current&&alive.current){
    setState('Conexão de voz indisponível. Verifique as APIs.');
   }
  }finally{
   if(id===generation.current){
    request.current=null;
    if(call.current&&!sources.current.size)setState('Ouvindo');
   }
  }
 }
 function recognize(){
  if(!call.current||!recognition.current)return;
  try{recognition.current.start();}catch{/* recognizer already running */}
 }
 function startCall(){
  if(!available||!Recognizer){setState('Reconhecimento contínuo indisponível neste navegador.');return;}
  try{
   if(navigationAudioActive()){setState('Finalize a orientação de navegação primeiro.');return;}
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context){setState('Áudio em tempo real não suportado.');return;}
   audio.current ||=new Context({latencyHint:'interactive'});
   void audio.current.resume();
   const stt=new Recognizer();
   stt.lang='pt-BR';
   stt.continuous=true;
   stt.interimResults=true;
   recognition.current=stt;
   stt.onstart=()=>{if(call.current)setState('Ouvindo');};
   stt.onresult=event=>{
    if(!call.current)return;
    for(let i=event.resultIndex;i<event.results.length;i++){
     const result=event.results[i],spoken=result[0]?.transcript?.trim();
     if(!spoken||echoOfMavi(spoken))continue;
     if(!result.isFinal){
      if(spoken.split(/\s+/).length>=2&&(request.current||sources.current.size)){
       stopAudioAndRequest();
       setState('Estou ouvindo você...');
      }
     }else void ask(spoken);
    }
   };
   stt.onerror=event=>{
    if(['not-allowed','service-not-allowed','network'].includes(event.error)){
     stopCall();
     if(alive.current)setState('Microfone ou serviço de fala indisponível.');
    }
   };
   stt.onend=()=>{
    if(call.current){
     clearTimeout(restartTimer.current);
     restartTimer.current=setTimeout(recognize,350);
    }
   };
   call.current=true;
   setInCall(true);setState('Conectando microfone...');
   recognize();
  }catch{
   stopCall();
   setState('Não foi possível iniciar a chamada.');
  }
 }
 function stopCall(){
  call.current=false;
  clearTimeout(restartTimer.current);
  stopAudioAndRequest();
  try{recognition.current?.abort();}catch{/* already stopped */}
  recognition.current=null;
  if(alive.current){setInCall(false);setState('Chamada encerrada');}
 }
 function closePanel(){
  stopCall();setOpen(false);
 }
 if(!available)return null;
 const content=<>
  <button className="mavi-live-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label="Abrir chamada de voz MAVI">
   <Phone size={17}/> MAVI · Ligar
  </button>
  {open&&<section className="mavi-live-panel" aria-label="Ligação experimental com a MAVI">
   <div className="mavi-live-heading"><strong>MAVI · Chamada ao vivo</strong><button aria-label="Fechar painel" onClick={closePanel}><X size={18}/></button></div>
   <p role="status" className="mavi-live-state"><span className={inCall?'mavi-live-dot active':'mavi-live-dot'}/>{state}</p>
   <p className="mavi-live-caption">Fale naturalmente. Você pode interromper a MAVI sem encerrar a ligação.</p>
   <div className="mavi-live-transcript" aria-live="polite">
    {heard&&<p><b>Você:</b> {heard}</p>}
    {answered&&<p><b>MAVI:</b> {answered}</p>}
    {!heard&&!answered&&<p>Diga algo depois de iniciar a chamada.</p>}
   </div>
   <div className="mavi-live-actions">
    <button className={inCall?'mavi-live-end':'mavi-live-start'} onClick={inCall?stopCall:startCall}>
     {inCall?<PhoneOff size={18}/>:<Mic size={18}/>}
     {inCall?'Encerrar':'Iniciar ligação'}
    </button>
    <button className="mavi-live-mute" onClick={()=>{silence.current=!silence.current;setMuted(silence.current);if(silence.current){for(const s of sources.current)try{s.stop();}catch{}sources.current.clear();}}} aria-label={muted?'Ativar voz da MAVI':'Silenciar voz da MAVI'}>
     {muted?<VolumeX size={18}/>:<Volume2 size={18}/>}
    </button>
   </div>
   <small>Experimental · Apenas /v2 (admin). Use fones para reduzir eco. Não manuseie enquanto dirige.</small>
  </section>}
 </>;
 return createPortal(content,document.body);
}
