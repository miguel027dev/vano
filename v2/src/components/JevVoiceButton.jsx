import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {consumeMaviTranscript,maviConfirmation,maviRearmDelay} from '../lib/maviVoiceLogic.mjs';

/**
 * Experimental /v2 hands-free MAVI. This intentionally restores the working
 * browser recognizer lifecycle from the October 15 voice prototype:
 * new Recognition() -> start() directly inside the button click -> onresult
 * reads all returned transcripts -> abort the recognizer before routing.
 * No separate voice-controller instance, text entry or visible panel.
 */
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('off');
 const enabledRef=useRef(false),mountedRef=useRef(true),busyRef=useRef(false);
 const recognizerRef=useRef(null),speechRef=useRef(null),listenTimerRef=useRef(null),speechTimerRef=useRef(null);
 const proposalRef=useRef(null),wakeUntilRef=useRef(0),hardErrorsRef=useRef(0),silencesRef=useRef(0);
 const requestRef=useRef(0),controllerRef=useRef(null),pendingDeadlineRef=useRef(0);
 const handlersRef=useRef({onCommand,onAccept}),navRef=useRef({navigationActive,maneuverDistance,muted});
 handlersRef.current={onCommand,onAccept};
 navRef.current={navigationActive,maneuverDistance,muted};
 const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

 function record(event){
   // Debug metadata only: never record transcripts, audio, or location.
   if(typeof window==='undefined')return;
   const prev=window.__MAVI_DIAG__||{events:[]};
   window.__MAVI_DIAG__={status:statusRef.current,lastEvent:event,
     events:[...prev.events.slice(-19),event]};
 }
 const statusRef=useRef(status);
 function state(value){statusRef.current=value;if(mountedRef.current)setStatus(value);}

 function stopRecognition(){
   clearTimeout(listenTimerRef.current);listenTimerRef.current=null;
   const engine=recognizerRef.current;recognizerRef.current=null;
   if(engine){try{engine.abort()}catch{/* already stopped */}}
 }
 function disable(){
   enabledRef.current=false;busyRef.current=false;
   ++requestRef.current;controllerRef.current?.abort?.();controllerRef.current=null;
   stopRecognition();clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
   speechRef.current=null;proposalRef.current=null;pendingDeadlineRef.current=0;
   wakeUntilRef.current=0;hardErrorsRef.current=0;silencesRef.current=0;
   if(mountedRef.current){setEnabled(false);state('off');}
   else statusRef.current='off';
   record('disabled');
 }
 function scheduleNextListen(delay){
   clearTimeout(listenTimerRef.current);listenTimerRef.current=null;
   if(!enabledRef.current||busyRef.current||!Recognizer)return;
   const ms=delay??maviRearmDelay({
     hardCount:hardErrorsRef.current,silentCount:silencesRef.current,wakePending:wakeUntilRef.current>Date.now()
   });
   if(ms===null){record('speech_retries_exhausted');disable();return;}
   listenTimerRef.current=setTimeout(()=>{
     listenTimerRef.current=null;
     if(!enabledRef.current||busyRef.current)return;
     if(document.visibilityState==='hidden'){disable();return;}
     // Do not make microphone listen to its own speech or navigation audio.
     if(speechRef.current||window.speechSynthesis?.speaking){scheduleNextListen(1200);return;}
     listenRef.current();
   },ms);
 }
 function finishSpeaking(next){
   clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
   speechRef.current=null;
   if(!enabledRef.current)return;
   busyRef.current=false;
   state(next==='confirm'?'confirm':'ready');
   scheduleNextListen(550);
 }
 function speak(text,next='ready'){
   if(!enabledRef.current)return;
   busyRef.current=true;stopRecognition();state('speaking');
   const synth=window.speechSynthesis,Speech=window.SpeechSynthesisUtterance;
   let finished=false,attempts=0;
   const done=()=>{
     if(finished)return;finished=true;
     clearTimeout(speechTimerRef.current);
     finishSpeaking(next);
   };
   if(!synth||!Speech){record('speech_unavailable');done();return;}
   const trySpeak=()=>{
     if(!enabledRef.current||finished)return;
     // Spoken directions take priority; keep any global TTS owned by navigation.
     const nav=navRef.current;
     if(synth.speaking||(nav.navigationActive&&Number.isFinite(nav.maneuverDistance)&&nav.maneuverDistance<230)){
       if(++attempts>=10){record('speech_busy_timeout');done();return;}
       speechTimerRef.current=setTimeout(trySpeak,950);return;
     }
     try{
       const utterance=new Speech(String(text||'').slice(0,450));
       utterance.lang='pt-BR';utterance.rate=1;utterance.volume=1;
       const voices=synth.getVoices?.()||[];
       const pt=voices.find(v=>String(v.lang).toLowerCase()==='pt-br')||
         voices.find(v=>String(v.lang).toLowerCase().startsWith('pt'));
       if(pt)utterance.voice=pt;
       speechRef.current=utterance;
       utterance.onend=()=>{if(speechRef.current===utterance){record('speech_done');done();}};
       utterance.onerror=()=>{if(speechRef.current===utterance){record('speech_error');done();}};
       synth.resume?.();
       synth.speak(utterance);record('speech_requested');
       // Android WebViews sometimes never call onend: never strand the mic.
       speechTimerRef.current=setTimeout(()=>{record('speech_timeout');done();},15000);
     }catch{record('speech_exception');done();}
   };
   trySpeak();
 }
 async function submit(command){
   if(!enabledRef.current||busyRef.current)return;
   stopRecognition();wakeUntilRef.current=0;busyRef.current=true;state('processing');
   proposalRef.current=null;pendingDeadlineRef.current=0;
   const seq=++requestRef.current;
   controllerRef.current?.abort?.();
   const controller=new AbortController();controllerRef.current=controller;
   const timeout=setTimeout(()=>controller.abort(),14000);
   record('route_request');
   try{
     // Crucial: dispatch route BEFORE speaking; a silent TTS must never block.
     const response=await handlersRef.current.onCommand(command,controller.signal);
     if(!enabledRef.current||seq!==requestRef.current)return;
     const hasProposal=response?.mode==='proposal'&&Array.isArray(response?.routeData?.routes)&&response.routeData.routes.length>0;
     if(hasProposal){
       proposalRef.current=response;pendingDeadlineRef.current=Date.now()+60000;
     }
     record(hasProposal?'route_proposal':'route_response');
     speak(response?.text||'Não consegui encontrar outra rota. Mantive sua rota atual.',hasProposal?'confirm':'ready');
   }catch{
     if(!enabledRef.current||seq!==requestRef.current)return;
     record('route_error');
     speak(controller.signal.aborted?'A busca demorou demais. Mantive sua rota atual.':
       'Não consegui consultar novas rotas. Mantive seu caminho.', 'ready');
   }finally{
     clearTimeout(timeout);
     if(controllerRef.current===controller)controllerRef.current=null;
   }
 }
 const submitRef=useRef(submit);submitRef.current=submit;
 function onPhrase(phrase){
   if(!enabledRef.current||busyRef.current)return false;
   const withinProposal=proposalRef.current&&pendingDeadlineRef.current>Date.now();
   const parsed=consumeMaviTranscript(phrase,{wakeUntil:wakeUntilRef.current,now:Date.now()});
   wakeUntilRef.current=parsed.wakeUntil||0;
   if(parsed.kind==='wake'){record('wake_recognized');silencesRef.current=0;hardErrorsRef.current=0;return false;}
   let command=parsed.kind==='command'?parsed.command:null;
   // An immediate short 'Pode' or 'Não' is allowed ONLY following an active proposal.
   if(!command&&withinProposal&&maviConfirmation(phrase)&&String(phrase).trim().length<=70)command=String(phrase).trim();
   if(!command)return false;
   record('command_recognized');
   hardErrorsRef.current=0;silencesRef.current=0;
   if(withinProposal){
     const decision=maviConfirmation(command);
     if(decision){
       stopRecognition();busyRef.current=true;
       const proposal=proposalRef.current;
       proposalRef.current=null;pendingDeadlineRef.current=0;
       if(decision==='reject'){record('route_declined');speak('Mantive sua rota atual.');return true;}
       let success=false;
       try{success=handlersRef.current.onAccept(proposal)!==false}catch{/* expired route */}
       record(success?'route_accepted':'route_expired');
       speak(success?'Pronto. Nova rota selecionada.':'A sugestão expirou. Mantive sua rota atual.');
       return true;
     }
   }
   void submitRef.current(command);return true;
 }
 const phraseRef=useRef(onPhrase);phraseRef.current=onPhrase;
 function listen(){
   if(!enabledRef.current||busyRef.current||!Recognizer)return false;
   stopRecognition();
   let recognition;
   try{recognition=new Recognizer();}
   catch{record('recognizer_constructor_error');disable();return false;}
   // The exact settings and Web Speech flow from the previously working prototype.
   recognition.lang='pt-BR';recognition.continuous=false;
   recognition.interimResults=false;recognition.maxAlternatives=1;
   recognizerRef.current=recognition;
   let errorCode='',heard=false;
   recognition.onresult=event=>{
     if(!enabledRef.current||recognizerRef.current!==recognition)return;
     const phrase=Array.from(event.results||[]).map(row=>row?.[0]?.transcript||'').join(' ').trim();
     if(phrase){
       heard=true;record('result_received');
       phraseRef.current(phrase);
     }
   };
   recognition.onerror=event=>{
     if(!enabledRef.current||recognizerRef.current!==recognition)return;
     const code=String(event?.error||'unknown');errorCode=code;record('recognition_'+code);
     if(['not-allowed','service-not-allowed','audio-capture','language-not-supported','language-unavailable'].includes(code)){
       disable();return;
     }
     if(code!=='no-speech'&&code!=='aborted'&&++hardErrorsRef.current>=3){disable();return;}
   };
   recognition.onend=()=>{
     if(recognizerRef.current!==recognition)return;
     recognizerRef.current=null;
     if(!enabledRef.current||busyRef.current)return;
     if(!heard)silencesRef.current++;else silencesRef.current=0;
     // Web Speech can end normally after every phrase, even after 'Mavi'.
     scheduleNextListen(errorCode==='no-speech'?1400:undefined);
   };
   try{
     // IMPORTANT: called synchronously by the mic button click.
     recognition.start();state('listening');record('recognition_started');
     return true;
   }catch(error){record('recognition_start_'+String(error?.name||'failed'));
     recognizerRef.current=null;
     if(++hardErrorsRef.current>=3){disable();return false;}
     scheduleNextListen(2000);return false;
   }
 }
 const listenRef=useRef(listen);listenRef.current=listen;
 function toggle(){
   if(enabledRef.current){disable();return;}
   if(!Recognizer){record('recognizer_unsupported');state('error');return;}
   enabledRef.current=true;busyRef.current=false;
   wakeUntilRef.current=0;hardErrorsRef.current=0;silencesRef.current=0;
   setEnabled(true);state('ready');
   // No TTS before the microphone; capture the original user click gesture.
   listenRef.current();
 }
 useEffect(()=>{
   // Route context invalidates old proposals; a new route is never auto-applied.
   proposalRef.current=null;pendingDeadlineRef.current=0;
 },[routeContextKey]);
 useEffect(()=>{
   mountedRef.current=true;
   const hidden=()=>{if(document.visibilityState==='hidden')disable();};
   document.addEventListener('visibilitychange',hidden);
   return()=>{
     document.removeEventListener('visibilitychange',hidden);
     mountedRef.current=false;disable();
   };
 },[]);
 const active=enabled&&status!=='off'&&status!=='error';
 const label=status==='processing'?'Mavi procurando alternativa':
   status==='speaking'?'Mavi respondendo por voz':
   status==='confirm'?'Mavi aguardando confirmação':
   active?'Mavi ouvindo':'Ativar Mavi, assistente por voz';
 return <div className="jev-control-wrap">
   <button type="button" className={'circle-btn jev-mic '+(active?'jev-mic-active ':'')+
     (status==='listening'?'jev-listening':'')}
     onClick={toggle} aria-pressed={active} aria-label={label} title={label}
     data-mavi-status={status}>
     {active?<Mic size={21}/>:<MicOff size={21}/>}
   </button>
   <span className="sr-only" role="status" aria-live="polite">{label}</span>
 </div>;
}
