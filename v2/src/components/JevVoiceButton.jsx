import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {MaviVoiceController} from '../lib/maviVoiceController.mjs';

// Experimental /v2 only: a single control, with no typing or modal while driving.
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [phase,setPhase]=useState('OFF');
 const mounted=useRef(true),controllerRef=useRef(null);
 if(!controllerRef.current){
  controllerRef.current=new MaviVoiceController({
   Recognizer:typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null,
   synth:typeof window!=='undefined'?window.speechSynthesis:null,
   Utterance:typeof window!=='undefined'?window.SpeechSynthesisUtterance:null
  });
 }
 const controller=controllerRef.current;
 controller.configure({
  onCommand,onAccept,muted:()=>muted,
  isVisible:()=>typeof document!=='undefined'&&document.visibilityState!=='hidden',
  isNavigationSpeaking:()=>navigationActive&&Number.isFinite(maneuverDistance)&&maneuverDistance<230,
  onStatus:state=>{if(mounted.current)setPhase(state);},
  onEvent:(event,state)=>{
   // Transient diagnostic for testers; no transcript, precise position or audio retained.
   if(typeof window==='undefined')return;
   const previous=window.__MAVI_DIAG__||{events:[]};
   window.__MAVI_DIAG__={state,lastEvent:event,events:[...previous.events.slice(-19),event]};
  }
 });
 useEffect(()=>{
  controller.routeChanged();
 },[controller,routeContextKey]);
 useEffect(()=>{
  mounted.current=true;
  const hide=()=>{if(document.visibilityState==='hidden')controller.stop();};
  document.addEventListener('visibilitychange',hide);
  return()=>{
   document.removeEventListener('visibilitychange',hide);
   mounted.current=false;
   controller.dispose();
  };
 },[controller]);
 const active=phase!=='OFF';
 const label=phase==='CONFIRM'?'Aguardando confirmação por voz':
   phase==='PROCESSING'?'Consultando nova rota':
   phase==='SPEAKING'?'Mavi respondendo':
   active?'Ouvindo: diga Mavi antes do comando':'Ativar Mavi por voz';
 function toggle(){if(controller.enabled)controller.stop();else controller.start();}
 return <div className="jev-control-wrap">
  <button type="button" className={'circle-btn jev-mic '+(active?'jev-mic-active ':'')+
    (phase==='ARMED'||phase==='CONFIRM'?'jev-listening':'')}
    onClick={toggle} aria-pressed={active}
    aria-label={active?'Desativar Mavi: '+label:'Ativar Mavi, assistente de voz'}
    title={label}>
    {active?<Mic size={21}/>:<MicOff size={21}/>}
  </button>
  <span className="sr-only" role="status" aria-live="polite">{label}</span>
 </div>;
}
