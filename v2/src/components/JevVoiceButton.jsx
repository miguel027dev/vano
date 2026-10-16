import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {extractMaviCommand,maviConfirmation,maviRearmDelay} from '../lib/maviVoiceLogic.mjs';

/**
 * MAVI (experimental /v2 only): one button, no panel, text field, or visual
 * interaction while driving. Commands and confirmation require "Mavi".
 *
 * Browser SpeechRecognition may use the browser vendor's remote recognizer.
 * This cannot guarantee hotword detection with the screen locked/background.
 * We never forward transcripts without the local text wake-word check.
 */
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
  const [enabled,setEnabled]=useState(false);
  const enabledRef=useRef(false);
  const phaseRef=useRef('OFF'); // OFF | ARMED | PROCESSING | SPEAKING | CONFIRM
  const nextPhaseRef=useRef('ARMED');
  const recognitionRef=useRef(null),rearmTimerRef=useRef(null),speechTimerRef=useRef(null);
  const ownSpeechRef=useRef(null),requestRef=useRef(0),controllerRef=useRef(null);
  const pendingRef=useRef(null),silentCountRef=useRef(0),hardCountRef=useRef(0);
  const heardDuringSessionRef=useRef(false),mountedRef=useRef(true);
  const handlersRef=useRef({onCommand,onAccept}),navigationRef=useRef({navigationActive,maneuverDistance,muted});
  handlersRef.current={onCommand,onAccept};
  navigationRef.current={navigationActive,maneuverDistance,muted};
  const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

  function stopRecognition(){
    clearTimeout(rearmTimerRef.current);rearmTimerRef.current=null;
    const old=recognitionRef.current;
    recognitionRef.current=null;
    if(old){try{old.abort();}catch{/* already stopped */}}
  }
  function deactivate(){
    enabledRef.current=false;phaseRef.current='OFF';
    stopRecognition();
    clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
    requestRef.current++;
    controllerRef.current?.abort?.();controllerRef.current=null;
    pendingRef.current=null;ownSpeechRef.current=null;
    silentCountRef.current=0;hardCountRef.current=0;
    if(mountedRef.current)setEnabled(false);
    // Do not cancel the global synthesizer: the navigation voice also owns it.
  }
  function scheduleListen(delay=850){
    clearTimeout(rearmTimerRef.current);rearmTimerRef.current=null;
    if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
    rearmTimerRef.current=setTimeout(()=>{
      rearmTimerRef.current=null;
      if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
      if(document.visibilityState==='hidden'){deactivate();return;}
      // Do not capture the MAVI or navigation maneuver TTS.
      if(ownSpeechRef.current||window.speechSynthesis?.speaking){scheduleListen(1800);return;}
      startListening();
    },Math.max(450,delay));
  }
  function startListening(){
    if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current)||recognitionRef.current)return;
    if(!Recognizer){deactivate();return;}
    if(document.visibilityState==='hidden'){deactivate();return;}
    if(ownSpeechRef.current||window.speechSynthesis?.speaking){scheduleListen(1800);return;}
    let recognition;
    try{recognition=new Recognizer();}
    catch{deactivate();return;}
    recognition.lang='pt-BR';recognition.continuous=true;
    recognition.interimResults=false;recognition.maxAlternatives=1;
    recognitionRef.current=recognition;
    heardDuringSessionRef.current=false;
    let errorCode='';
    recognition.onresult=event=>{
      if(recognitionRef.current!==recognition||!enabledRef.current)return;
      heardDuringSessionRef.current=true;
      silentCountRef.current=0;hardCountRef.current=0;
      for(let i=event.resultIndex||0;i<(event.results?.length||0);i++){
        const item=event.results[i];
        if(!item?.isFinal)continue;
        const phrase=String(item?.[0]?.transcript||'').trim();
        if(phrase&&onTranscript(phrase))break;
      }
    };
    recognition.onerror=event=>{
      if(recognitionRef.current!==recognition||!enabledRef.current)return;
      const error=String(event?.error||'unknown');
      errorCode=error;
      // Silences are normal: do not spin start() on every onend.
      if(error==='no-speech')return;
      if(['not-allowed','service-not-allowed','audio-capture','language-not-supported','language-unavailable'].includes(error)){
        deactivate();return;
      }
      hardCountRef.current++;
      if(hardCountRef.current>=3)deactivate();
    };
    recognition.onend=()=>{
      if(recognitionRef.current!==recognition)return; // Explicit abort is not a restart.
      recognitionRef.current=null;
      if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
      if(!heardDuringSessionRef.current) silentCountRef.current++;
      if(errorCode==='aborted')return;
      const delay=maviRearmDelay({silentCount:silentCountRef.current,hardCount:hardCountRef.current});
      if(delay===null){deactivate();return;}
      scheduleListen(delay);
    };
    try{recognition.start();}
    catch{
      recognitionRef.current=null;hardCountRef.current++;
      const delay=maviRearmDelay({hardCount:hardCountRef.current});
      if(delay===null)deactivate();else scheduleListen(delay);
    }
  }
  function announce(message,nextPhase='ARMED'){
    if(!enabledRef.current)return;
    phaseRef.current='SPEAKING';nextPhaseRef.current=nextPhase;
    stopRecognition();
    const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
    if(!synth||typeof synth.speak!=='function'||!Utterance){
      // Voice-only UI cannot silently offer/approve a route.
      deactivate();return;
    }
    const currentAnnouncement=++requestRef.current;
    let attempts=0;
    const attempt=()=>{
      if(!enabledRef.current||phaseRef.current!=='SPEAKING'||currentAnnouncement!==requestRef.current)return;
      const nav=navigationRef.current;
      if(nav.muted){deactivate();return;}
      // A maneuver is more important than conversational output.
      if(synth.speaking||(nav.navigationActive&&Number.isFinite(nav.maneuverDistance)&&nav.maneuverDistance<250)){
        if(++attempts>12){deactivate();return;}
        speechTimerRef.current=setTimeout(attempt,1000);return;
      }
      try{
        const utterance=new Utterance(message);
        utterance.lang='pt-BR';utterance.rate=1;utterance.volume=1;
        const voices=typeof synth.getVoices==='function'?synth.getVoices():[];
        utterance.voice=voices.find(v=>String(v.lang).toLowerCase()==='pt-br')||
          voices.find(v=>String(v.lang).toLowerCase().startsWith('pt'))||null;
        ownSpeechRef.current=utterance;
        const finish=()=>{
          if(ownSpeechRef.current!==utterance)return;
          clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
          ownSpeechRef.current=null;
          if(!enabledRef.current||phaseRef.current!=='SPEAKING')return;
          phaseRef.current=nextPhaseRef.current;
          scheduleListen(900);
        };
        utterance.onend=finish;utterance.onerror=finish;
        // Some WebViews do not reliably dispatch onend; fail closed.
        speechTimerRef.current=setTimeout(()=>{
          if(ownSpeechRef.current===utterance)deactivate();
        },20000);
        synth.speak(utterance);
      }catch{deactivate();}
    };
    attempt();
  }
  async function requestRoute(text){
    if(!enabledRef.current)return;
    phaseRef.current='PROCESSING';
    stopRecognition();
    pendingRef.current=null;
    const seq=++requestRef.current;
    controllerRef.current?.abort?.();
    const controller=new AbortController();controllerRef.current=controller;
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
      const result=await handlersRef.current.onCommand(text,controller.signal);
      if(!enabledRef.current||seq!==requestRef.current)return;
      if(result?.mode==='proposal'&&Array.isArray(result.routeData?.routes)&&result.routeData.routes.length){
        pendingRef.current=result;
        announce(result.text||'Encontrei outra rota. Quer usar?', 'CONFIRM');
      }else{
        announce(result?.text||'Não consegui encontrar outra rota. Mantive seu trajeto.', 'ARMED');
      }
    }catch{
      if(enabledRef.current&&seq===requestRef.current)
        announce(controller.signal.aborted?
          'A pesquisa demorou demais. Mantive sua rota.':
          'Não consegui buscar outra rota. Mantive sua rota.', 'ARMED');
    }finally{
      clearTimeout(timer);
      if(controllerRef.current===controller)controllerRef.current=null;
    }
  }
  function onTranscript(phrase){
    if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return false;
    const command=extractMaviCommand(phrase);
    if(command===null)return false; // Ignore all ambient speech.
    const waiting=phaseRef.current==='CONFIRM'&&pendingRef.current;
    stopRecognition();
    silentCountRef.current=0;hardCountRef.current=0;
    if(!command){announce('Pode falar. Estou ouvindo.',waiting?'CONFIRM':'ARMED');return true;}
    if(waiting){
      const decision=maviConfirmation(command);
      if(decision==='accept'){
        const proposal=pendingRef.current;pendingRef.current=null;
        let accepted=false;
        try{accepted=handlersRef.current.onAccept(proposal)!==false;}
        catch{/* Route expired/changed; fail closed. */}
        announce(accepted?'Pronto. A nova rota foi selecionada.':
          'A rota mudou desde a sugestão. Mantive seu trajeto atual.','ARMED');
        return true;
      }
      if(decision==='reject'){
        pendingRef.current=null;
        announce('Tudo bem. Mantive sua rota atual.','ARMED');
        return true;
      }
    }
    void requestRoute(command);return true;
  }
  function toggle(){
    if(enabledRef.current){deactivate();return;}
    if(!Recognizer || document.visibilityState==='hidden') {
      // No text fallback: disabled means we cannot provide hands-free controls.
      return;
    }
    enabledRef.current=true;phaseRef.current='ARMED';
    pendingRef.current=null;hardCountRef.current=0;silentCountRef.current=0;
    setEnabled(true);
    // Start within the click's user gesture to satisfy browser restrictions.
    startListening();
  }
  useEffect(()=>{
    // A new route invalidates any proposal calculated from the old geometry.
    requestRef.current++;controllerRef.current?.abort?.();
    pendingRef.current=null;
    if(phaseRef.current==='CONFIRM')phaseRef.current='ARMED';
  },[routeContextKey]);
  useEffect(()=>{
    const onVisibility=()=>{if(document.visibilityState==='hidden')deactivate();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{
      document.removeEventListener('visibilitychange',onVisibility);
      mountedRef.current=false;deactivate();
    };
  },[]);
  return <div className="jev-control-wrap">
    <button type="button" className={'circle-btn jev-mic '+(enabled?'jev-mic-active jev-listening':'')}
      onClick={toggle} aria-pressed={enabled}
      aria-label={enabled?'Desativar Mavi, assistente de voz':'Ativar Mavi, assistente de voz'}
      title={enabled?'MAVI ativada · diga Mavi antes do pedido':'Ativar MAVI (somente por voz)'}>
      {enabled?<Mic size={21}/>:<MicOff size={21}/>}
    </button>
  </div>;
}
