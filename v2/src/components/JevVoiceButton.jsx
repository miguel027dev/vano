import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff} from 'lucide-react';
import {consumeMaviTranscript,maviConfirmation,maviRearmDelay} from '../lib/maviVoiceLogic.mjs';
import {classifyJev} from '../lib/jevShared.mjs';

/** Only /v2: no text input or driving interaction. Speech recognition is
 * provided by the browser and may involve remote vendor processing.
 * A green mic means the browser recognizer is armed or doing voice work;
 * persistent failures turn it off instead of silently pretending to listen.
 */
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [enabled,setEnabled]=useState(false);
 const [stateLabel,setStateLabel]=useState('Desligada');
 const enabledRef=useRef(false),mountedRef=useRef(true),phaseRef=useRef('OFF');
 const recognizerRef=useRef(null),listenTimer=useRef(null),speechTimer=useRef(null);
 const speakingRef=useRef(null),abortRef=useRef(null),operationRef=useRef(0);
 const contextRef=useRef({onCommand,onAccept,navigationActive,maneuverDistance,muted});
 contextRef.current={onCommand,onAccept,navigationActive,maneuverDistance,muted};
 const pendingRef=useRef(null),wakeUntilRef=useRef(0),softFailures=useRef(0),hardFailures=useRef(0);
 const acceptingOwnRoute=useRef(false);
 const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

 function status(phase){
   phaseRef.current=phase;
   if(mountedRef.current)setStateLabel(
     phase==='ARMED'?'Ouvindo Mavi':phase==='CONFIRM'?'Aguardando confirmação por voz':
     phase==='PROCESSING'?'Calculando outra rota':phase==='SPEAKING'?'Mavi respondendo':'Desligada'
   );
 }
 function stopListening(){
   clearTimeout(listenTimer.current);listenTimer.current=null;
   const instance=recognizerRef.current;recognizerRef.current=null;
   if(instance){try{instance.abort();}catch{/* already ended */}}
 }
 function turnOff(){
   enabledRef.current=false;status('OFF');stopListening();
   ++operationRef.current;
   abortRef.current?.abort?.();abortRef.current=null;
   clearTimeout(speechTimer.current);speechTimer.current=null;
   speakingRef.current=null;pendingRef.current=null;wakeUntilRef.current=0;
   softFailures.current=0;hardFailures.current=0;
   if(mountedRef.current)setEnabled(false);
   // Do not cancel speechSynthesis: it also owns turn-by-turn navigation.
 }
 function arm(delay=650){
   clearTimeout(listenTimer.current);
   if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
   listenTimer.current=setTimeout(()=>{
     listenTimer.current=null;
     if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
     if(document.visibilityState==='hidden'){turnOff();return;}
     if(speakingRef.current||window.speechSynthesis?.speaking){arm(1200);return;}
     listen();
   },Math.max(350,delay));
 }
 function consume(phrase){
   if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return false;
   const result=consumeMaviTranscript(phrase,{wakeUntil:wakeUntilRef.current,now:Date.now()});
   wakeUntilRef.current=result.wakeUntil||0;
   if(result.kind==='ignore')return false;
   softFailures.current=0;hardFailures.current=0;
   if(result.kind==='wake')return false; // Bare "Mavi": listen for the next phrase.
   const command=result.command;
   stopListening();
   const pending=pendingRef.current;
   if(pending&&phaseRef.current==='CONFIRM'){
     const decision=maviConfirmation(command);
     if(decision==='accept'||decision==='reject'){
       void confirm(decision);return true;
     }
   }
   // For tentative finalization, unrecognized ambient text is never forwarded.
   void lookup(command);return true;
 }
 function listen(){
   if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current)||recognizerRef.current)return;
   if(!Recognizer){turnOff();return;}
   if(document.visibilityState==='hidden'){turnOff();return;}
   let instance;
   try{instance=new Recognizer();}catch{turnOff();return;}
   instance.lang='pt-BR';
   // A finite session can deliver complete short commands on mobile Chrome;
   // automatic restart is handled by a bounded explicit state machine.
   instance.continuous=false;instance.interimResults=true;instance.maxAlternatives=1;
   recognizerRef.current=instance;
   let interim='',handled=false,hadFinal=false,lastError='';
   instance.onresult=event=>{
     if(!enabledRef.current||recognizerRef.current!==instance)return;
     for(let i=event.resultIndex||0;i<(event.results?.length||0);i++){
       const part=event.results[i];
       const words=String(part?.[0]?.transcript||'').trim();
       if(!words)continue;
       if(part.isFinal){
         hadFinal=true;interim='';
         if(consume(words)){handled=true;return;}
       }else interim=words;
     }
   };
   instance.onerror=event=>{
     if(recognizerRef.current!==instance||!enabledRef.current)return;
     lastError=String(event?.error||'unknown');
     if(['not-allowed','service-not-allowed','audio-capture','language-not-supported','language-unavailable'].includes(lastError)){
       turnOff();return;
     }
     if(!['no-speech','aborted'].includes(lastError)){
       hardFailures.current++;
       if(hardFailures.current>=3)turnOff();
     }
   };
   instance.onend=()=>{
     if(recognizerRef.current!==instance)return;
     recognizerRef.current=null;
     if(!enabledRef.current||!['ARMED','CONFIRM'].includes(phaseRef.current))return;
     // Safari/embedded browsers sometimes finish without a final result.
     // Only accept an interim with an explicit Mavi wake word and an actionable intent,
     // or a confirmation following an already recognized Mavi.
     if(!hadFinal&&!handled&&interim){
       const tentative=consumeMaviTranscript(interim,{wakeUntil:wakeUntilRef.current,now:Date.now()});
       const valid=tentative.kind==='wake'||(
         tentative.kind==='command'&&(
           classifyJev(tentative.command)!=='unknown'||
           (pendingRef.current&&maviConfirmation(tentative.command)!==null)
         )
       );
       if(valid && consume(interim))return;
     }
     if(lastError==='aborted')return;
     if(!hadFinal)softFailures.current++;else softFailures.current=0;
     const ms=maviRearmDelay({
       silentCount:softFailures.current,
       hardCount:hardFailures.current,
       wakePending:wakeUntilRef.current>Date.now()
     });
     if(ms===null){turnOff();return;}
     arm(ms);
   };
   try{instance.start();}
   catch{
     recognizerRef.current=null;hardFailures.current++;
     const ms=maviRearmDelay({hardCount:hardFailures.current});
     if(ms===null)turnOff();else arm(ms);
   }
 }
 function speakVoice(sentence){
   // Resolves true only when TTS actually finishes.
   return new Promise(resolve=>{
     if(!enabledRef.current){resolve(false);return;}
     status('SPEAKING');
     stopListening();
     const synth=window.speechSynthesis,Speech=window.SpeechSynthesisUtterance;
     if(!synth||!Speech||contextRef.current.muted){resolve(false);return;}
     const seq=operationRef.current;
     let trials=0,finished=false;
     function finish(ok){
       if(finished)return;
       finished=true;
       clearTimeout(speechTimer.current);speechTimer.current=null;
       speakingRef.current=null;
       resolve(ok&&enabledRef.current&&seq===operationRef.current);
     }
     function attempt(){
       if(!enabledRef.current||seq!==operationRef.current){finish(false);return;}
       const nav=contextRef.current;
       if(synth.speaking||(nav.navigationActive&&Number.isFinite(nav.maneuverDistance)&&nav.maneuverDistance<230)){
         if(++trials>=10){finish(false);return;}
         speechTimer.current=setTimeout(attempt,950);return;
       }
       try{
         synth.resume?.();
         const phrase=new Speech(sentence);
         phrase.lang='pt-BR';phrase.rate=1;phrase.volume=1;
         const voices=synth.getVoices?.()||[];
         phrase.voice=voices.find(v=>String(v.lang).toLowerCase()==='pt-br')||
           voices.find(v=>String(v.lang).toLowerCase().startsWith('pt'))||null;
         phrase.onend=()=>finish(true);phrase.onerror=()=>finish(false);
         speakingRef.current=phrase;
         speechTimer.current=setTimeout(()=>finish(false),18000);
         synth.speak(phrase);
       }catch{finish(false);}
     }
     attempt();
   });
 }
 async function lookup(command){
   if(!enabledRef.current)return;
   status('PROCESSING');stopListening();wakeUntilRef.current=0;
   pendingRef.current=null;
   const token=++operationRef.current;
   // A short spoken acknowledgement guarantees visible progress through audio,
   // without displaying text fields or a distracting panel.
   const ack=await speakVoice('Certo, vou procurar outra rota.');
   if(!enabledRef.current||token!==operationRef.current)return;
   if(!ack){turnOff();return;}
   status('PROCESSING');
   abortRef.current?.abort?.();
   const controller=new AbortController();abortRef.current=controller;
   const timeout=setTimeout(()=>controller.abort(),13500);
   let reply;
   try{reply=await contextRef.current.onCommand(command,controller.signal);}
   catch{reply={mode:'information',text:controller.signal.aborted?
     'A consulta demorou demais. Sua rota atual foi mantida.':
     'Não consegui consultar as rotas. Mantive seu trajeto.'};}
   finally{clearTimeout(timeout);if(abortRef.current===controller)abortRef.current=null;}
   if(!enabledRef.current||token!==operationRef.current)return;
   const isProposal=reply?.mode==='proposal'&&Array.isArray(reply.routeData?.routes)&&reply.routeData.routes.length>0;
   pendingRef.current=isProposal?reply:null;
   const spoken=await speakVoice(reply?.text||'Não consegui encontrar uma alternativa. A rota atual foi mantida.');
   if(!enabledRef.current||token!==operationRef.current)return;
   if(!spoken){turnOff();return;}
   status(isProposal?'CONFIRM':'ARMED');arm(500);
 }
 async function confirm(decision){
   if(!enabledRef.current)return;
   status('PROCESSING');stopListening();wakeUntilRef.current=0;
   const chosen=pendingRef.current;pendingRef.current=null;
   let message='Tudo bem. Mantive sua rota atual.';
   if(decision==='accept'&&chosen){
     acceptingOwnRoute.current=true;
     let success=false;
     try{success=contextRef.current.onAccept(chosen)!==false;}catch{/* stale proposal */}
     if(!success)acceptingOwnRoute.current=false;
     message=success?'Pronto. Nova rota selecionada.':'A sugestão expirou. Mantive sua rota atual.';
   }
   const token=++operationRef.current;
   const said=await speakVoice(message);
   if(!enabledRef.current||token!==operationRef.current)return;
   if(!said){turnOff();return;}
   status('ARMED');arm(550);
 }
 function toggle(){
   if(enabledRef.current){turnOff();return;}
   if(!Recognizer||document.visibilityState==='hidden')return;
   enabledRef.current=true;pendingRef.current=null;
   wakeUntilRef.current=0;softFailures.current=0;hardFailures.current=0;
   setEnabled(true);status('ARMED');
   // User gesture unlocks device speech where permitted. No audible startup.
   try{window.speechSynthesis?.resume?.();}catch{/* unavailable */}
   listen();
 }
 useEffect(()=>{
   if(acceptingOwnRoute.current){acceptingOwnRoute.current=false;return;}
   ++operationRef.current;abortRef.current?.abort?.();pendingRef.current=null;
   wakeUntilRef.current=0;
   if(phaseRef.current==='CONFIRM'){status('ARMED');arm(650);}
 },[routeContextKey]);
 useEffect(()=>{
   const onBackground=()=>{if(document.visibilityState==='hidden')turnOff();};
   document.addEventListener('visibilitychange',onBackground);
   return()=>{document.removeEventListener('visibilitychange',onBackground);mountedRef.current=false;turnOff();};
 },[]);
 return <div className="jev-control-wrap">
   <button type="button" className={'circle-btn jev-mic '+(enabled?'jev-mic-active jev-listening':'')}
      onClick={toggle} aria-pressed={enabled}
      aria-label={enabled?'Desativar Mavi: '+stateLabel:'Ativar Mavi, assistente de voz'}
      title={enabled?'MAVI: '+stateLabel:'Ativar MAVI (somente por voz)'}>
     {enabled?<Mic size={21}/>:<MicOff size={21}/>}
   </button>
 </div>;
}
