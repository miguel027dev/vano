import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {microphoneMessage} from '../lib/jevMicSupport.mjs';
import {consumeMaviTranscript,maviConfirmation,maviRearmDelay} from '../lib/maviVoiceLogic.mjs';

/** The V2-only voice input has three independent paths:
 * browser SpeechRecognition, optional local SpeechRecognition and direct
 * getUserMedia/MediaRecorder capture with optional server STT.
 * Navigation voice and all other map screens remain independent.
 */
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('off');
 const [reply,setReply]=useState(''),[proposal,setProposal]=useState(null),[diagnostic,setDiagnostic]=useState('');
 const enabledRef=useRef(false),mountedRef=useRef(true),busyRef=useRef(false);
 const recognitionRef=useRef(null),recognitionActive=useRef(false),recognitionError=useRef('');
 const requestRef=useRef(0),controllerRef=useRef(null),listenTimerRef=useRef(null);
 const wakeUntilRef=useRef(0),speechTimerRef=useRef(null),softFailuresRef=useRef(0),hardFailuresRef=useRef(0);
 const proposalRef=useRef(null),speechRef=useRef(null),handlersRef=useRef({onCommand,onAccept});
 const navRef=useRef({navigationActive,maneuverDistance,muted});
 handlersRef.current={onCommand,onAccept};
 navRef.current={navigationActive,maneuverDistance,muted};
 proposalRef.current=proposal;
 const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

 function stopRecognition(){
   clearTimeout(listenTimerRef.current);
   const engine=recognitionRef.current;recognitionRef.current=null;recognitionActive.current=false;
   if(engine){try{engine.abort();}catch{/* already closed */}}
 }
 function cancelEverything(){
   requestRef.current++;
   controllerRef.current?.abort?.();controllerRef.current=null;
   enabledRef.current=false;busyRef.current=false;
   stopRecognition();clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
   wakeUntilRef.current=0;speechRef.current=null;
   // Do not cancel global speechSynthesis: it also belongs to navigation maneuvers.
 }
 function scheduleNextListen(){
   clearTimeout(listenTimerRef.current);
   if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
   listenTimerRef.current=setTimeout(()=>{
     if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
     if(window.speechSynthesis?.speaking){scheduleNextListen();return;}
     listen('remote');
   },maviRearmDelay({silentCount:softFailuresRef.current,hardCount:hardFailuresRef.current,wakePending:wakeUntilRef.current>Date.now()})??5000);
 }
 function done(){
   busyRef.current=false;
   if(!enabledRef.current)return;
   if(recognitionError.current){setStatus('off');enabledRef.current=false;setEnabled(false);}
   else{setStatus('ready');scheduleNextListen();}
 }
 function speak(message){
   const {navigationActive,maneuverDistance,muted}=navRef.current;
   const synth=window.speechSynthesis;
   const Utterance=window.SpeechSynthesisUtterance;
   if(!synth||!Utterance||muted||synth.speaking||
     (navigationActive&&Number.isFinite(maneuverDistance)&&maneuverDistance<250)){
      done();return;
   }
   try{
     const speech=new Utterance(message);
     speech.lang='pt-BR';speech.rate=1;speech.volume=1;
     const voices=synth.getVoices?.()||[];
     const selected=voices.find(x=>x.lang.toLowerCase()==='pt-br')||voices.find(x=>x.lang.toLowerCase().startsWith('pt'));
     if(selected)speech.voice=selected;
     speechRef.current=speech;setStatus('speaking');
     const finish=()=>{if(speechRef.current===speech){clearTimeout(speechTimerRef.current);speechTimerRef.current=null;speechRef.current=null;done();}};
     speech.onend=finish;speech.onerror=finish;
     synth.speak(speech);
     speechTimerRef.current=setTimeout(finish,14000);
   }catch{done();}
 }
 async function submit(phrase){
   const text=String(phrase||'').trim().slice(0,360);
   if(!text||!enabledRef.current||busyRef.current)return;
   stopRecognition();
   const simplified=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   if(proposalRef.current&&maviConfirmation(simplified)==='accept'){
     const selection=proposalRef.current;setProposal(null);proposalRef.current=null;
     let ok=false;try{ok=handlersRef.current.onAccept(selection)!==false;}catch{/* stale route */}
     const text=ok?'Nova rota selecionada.':'A sugestão expirou. Peça outra alternativa.';
     busyRef.current=true;setReply(text);speak(text);return;
   }
   if(proposalRef.current&&maviConfirmation(simplified)==='reject'){
     setProposal(null);proposalRef.current=null;setReply('Mantive sua rota atual.');
     busyRef.current=true;speak('Mantive sua rota atual.');return;
   }
   busyRef.current=true;setStatus('processing');setProposal(null);proposalRef.current=null;
   const seq=++requestRef.current;controllerRef.current?.abort?.();
   const controller=new AbortController();controllerRef.current=controller;
   const timeout=setTimeout(()=>controller.abort(),14000);
   try{
     const response=await handlersRef.current.onCommand(text,controller.signal);
     if(!enabledRef.current||seq!==requestRef.current)return;
     const message=typeof response?.text==='string'?response.text:'Não consegui responder.';
     if(response?.mode==='proposal'&&response.routeData?.routes?.length){
       setProposal(response);proposalRef.current=response;
     }
     setReply(message);speak(message);
   }catch{
     if(!enabledRef.current||seq!==requestRef.current)return;
     const message=controller.signal.aborted?'A consulta demorou demais. Sua rota continua igual.':
       'Não consegui consultar as rotas. Sua rota continua igual.';
     setReply(message);speak(message);
   }finally{
     clearTimeout(timeout);
     if(controllerRef.current===controller)controllerRef.current=null;
   }
 }
 const submitRef=useRef(submit);submitRef.current=submit;
 function listen(mode='remote'){
   if(!enabledRef.current||busyRef.current||!Recognizer)return false;
   stopRecognition();
   let recognition;
   try{recognition=new Recognizer();}
   catch{recognitionError.current='unsupported';setStatus('typed');setReply(microphoneMessage('unsupported'));return false;}
   recognition.lang='pt-BR';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
   if(mode==='local'&&'processLocally' in recognition)recognition.processLocally=true;
   recognitionRef.current=recognition;recognitionError.current='';
   recognition.onresult=event=>{
     if(!enabledRef.current||recognitionRef.current!==recognition)return;
     const phrase=Array.from(event.results||[]).map(row=>row?.[0]?.transcript||'').join(' ').trim();
     if(!phrase)return;
     const now=Date.now();
     const parsed=consumeMaviTranscript(phrase,{wakeUntil:wakeUntilRef.current,now});
     wakeUntilRef.current=parsed.wakeUntil||0;
     if(parsed.kind==='wake'){softFailuresRef.current=0;hardFailuresRef.current=0;return;}
     let command=parsed.kind==='command'?parsed.command:null;
     // Only during an actual pending proposal may the driver say a short 'Pode'.
     if(!command&&proposalRef.current&&maviConfirmation(phrase)&&phrase.length<=70)command=phrase;
     if(command){softFailuresRef.current=0;hardFailuresRef.current=0;void submitRef.current(command);}
   };
   recognition.onerror=event=>{
     if(!enabledRef.current||recognitionRef.current!==recognition)return;
     const code=String(event?.error||'unknown');
     setDiagnostic('Reconhecimento '+(mode==='local'?'local':'do navegador')+': '+code);
     setReply(microphoneMessage(code));
     if(code==='no-speech'){softFailuresRef.current++;recognitionError.current='';return;}
     if(['not-allowed','service-not-allowed','audio-capture','language-not-supported','language-unavailable'].includes(code)){
       recognitionError.current=code;cancelEverything();setEnabled(false);setStatus('off');return;
     }
     hardFailuresRef.current++;
     if(hardFailuresRef.current>=3){recognitionError.current=code;cancelEverything();setEnabled(false);setStatus('off');}
     else recognitionError.current='';
   };
   recognition.onend=()=>{
     if(recognitionRef.current!==recognition)return;
     recognitionRef.current=null;recognitionActive.current=false;
     if(enabledRef.current&&!busyRef.current&&!recognitionError.current){
       setStatus('ready');scheduleNextListen();
     }
   };
   try{
     // Invoked synchronously from button presses, preserving user gesture.
     recognition.start();
     recognitionActive.current=true;setStatus('listening');setDiagnostic('Reconhecimento '+(mode==='local'?'local':'do navegador')+' iniciado.');
     return true;
   }catch(error){
     recognitionRef.current=null;
     recognitionError.current=error?.name||'unknown';
     setReply('O serviço de reconhecimento não iniciou: '+String(error?.name||'erro')+'.');
     cancelEverything();setEnabled(false);setStatus('off');return false;
   }
 }
 const listenRef=useRef(listen);listenRef.current=listen;
 useEffect(()=>{requestRef.current++;controllerRef.current?.abort?.();
   setProposal(null);proposalRef.current=null;
 },[routeContextKey]);
 useEffect(()=>()=>{mountedRef.current=false;cancelEverything();},[]);

 function toggle(){
   if(enabledRef.current){
     cancelEverything();setEnabled(false);setStatus('off');setReply('');setProposal(null);return;
   }
   enabledRef.current=true;busyRef.current=false;recognitionError.current='';
   setEnabled(true);setStatus('ready');
   if(!Recognizer){cancelEverything();setEnabled(false);setStatus('off');return;}
   // Crucial: call start() inside the original click, not after a timeout/effect.
   listenRef.current('remote');
 }
 return <div className="jev-control-wrap">
  <button type="button" className={'circle-btn jev-mic '+(enabled?'jev-mic-active ':'')+(status==='listening'?'jev-listening':'')}
   onClick={toggle} aria-label={enabled?'Desativar Mavi por voz':'Ativar Mavi por voz'}
   aria-pressed={enabled} title={enabled?'MAVI escutando · diga Mavi antes de pedir':'Ativar MAVI'}
   data-mavi-status={status} data-mavi-error={diagnostic.includes('Reconhecimento')?diagnostic.split(': ').pop():''}>
   {enabled?<Mic size={21}/>:<MicOff size={21}/>}
  </button>
  <span className="sr-only" role="status" aria-live="polite">{status==='listening'?'Mavi escutando':status==='processing'?'Mavi consultando rotas':status==='speaking'?'Mavi respondendo':status==='off'?'Mavi desligada':'Mavi disponível'}</span>
 </div>;
}
