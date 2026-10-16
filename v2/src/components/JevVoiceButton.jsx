import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Mic,MicOff,Send,X,Check,Volume2,RefreshCw,AudioLines,ShieldCheck,AlertCircle} from 'lucide-react';
import {api} from '../lib/api.js';
import {playMaviVoice} from '../lib/maviElevenPlayback.mjs';
import {navigationAudioActive,onNavigationAudioStart} from '../lib/maviAudioFocus.mjs';
import {classifyMaviIntent,maviProposalDecision} from '../lib/maviAssistant.mjs';
import {microphoneMessage,mediaCaptureError,recorderMime} from '../lib/jevMicSupport.mjs';

/** The V2-only voice input has three independent paths:
 * browser SpeechRecognition, optional local SpeechRecognition and direct
 * getUserMedia/MediaRecorder capture with optional server STT.
 * Navigation voice and all other map screens remain independent.
 */
export default function JevVoiceButton({onCommand,onAccept,onAction,onPreview,onDismissPreview,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('off');
 const [reply,setReply]=useState(''),[heard,setHeard]=useState(''),[typed,setTyped]=useState('');
 const [proposal,setProposal]=useState(null),[offerReady,setOfferReady]=useState(false),[diagnostic,setDiagnostic]=useState('');
 const [localReady,setLocalReady]=useState(false),[serverStt,setServerStt]=useState(false);
 const [captureActive,setCaptureActive]=useState(false);
 const enabledRef=useRef(false),mountedRef=useRef(true),busyRef=useRef(false);
 const recognitionRef=useRef(null),recognitionActive=useRef(false),recognitionError=useRef('');
 const recorderRef=useRef(null),streamRef=useRef(null),recordTimerRef=useRef(null);
 const speechTimerRef=useRef(null),elevenAbortRef=useRef(null);
 const requestRef=useRef(0),controllerRef=useRef(null),listenTimerRef=useRef(null);
 const firstMaviTurnRef=useRef(true);
 const proposalRef=useRef(null),speechRef=useRef(null),handlersRef=useRef({onCommand,onAccept,onAction,onPreview,onDismissPreview});
 const navRef=useRef({navigationActive,maneuverDistance,muted});
 handlersRef.current={onCommand,onAccept,onAction,onPreview,onDismissPreview};
 navRef.current={navigationActive,maneuverDistance,muted};
 proposalRef.current=proposal;
 const Recognizer=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

 function stopRecognition(){
   clearTimeout(listenTimerRef.current);
   const engine=recognitionRef.current;recognitionRef.current=null;recognitionActive.current=false;
   if(engine){try{engine.abort();}catch{/* already closed */}}
 }
 function releaseStream(){
   clearTimeout(recordTimerRef.current);
   if(streamRef.current){for(const track of streamRef.current.getTracks())track.stop();streamRef.current=null;}
   recorderRef.current=null;
   if(mountedRef.current)setCaptureActive(false);
 }
 function stopRecording(){
   clearTimeout(recordTimerRef.current);
   if(recorderRef.current?.state==='recording'){
     try{recorderRef.current.stop();}catch{releaseStream();}
   }else releaseStream();
 }
 function cancelEverything(){
   requestRef.current++;
   controllerRef.current?.abort?.();controllerRef.current=null;
   enabledRef.current=false;busyRef.current=false;
   stopRecognition();stopRecording();
   clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
   elevenAbortRef.current?.abort();elevenAbortRef.current=null;
   speechRef.current=null;
   if(mountedRef.current)setOfferReady(false);
   // Do not cancel global speechSynthesis: it also belongs to navigation maneuvers.
 }
 function scheduleNextListen(delay=320){
   clearTimeout(listenTimerRef.current);
   if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
   listenTimerRef.current=setTimeout(()=>{
     if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
     if(window.speechSynthesis?.speaking){scheduleNextListen(480);return;}
     listen('remote');
   },delay);
 }
 function done(){
   busyRef.current=false;
   if(!enabledRef.current)return;
   if(recognitionError.current)setStatus('typed');
   else{setStatus('ready');scheduleNextListen();}
 }
 function speak(message,onComplete,voiceTicket=null){
   const {muted}=navRef.current;
   const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
   busyRef.current=true;
   let finished=false,attempts=0;
   const finish=()=>{
     if(finished)return;
     finished=true;
     clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
     speechRef.current=null;
     elevenAbortRef.current=null;
     done();
     // Offer controls are revealed only once the voice finishes or fails safely.
     if(enabledRef.current&&mountedRef.current)onComplete?.();
   };
   if(muted){finish();return;}
   const trySpeak=()=>{
     if(!synth||!Utterance){finish();return;}
     if(finished||!enabledRef.current)return;
     const nav=navRef.current;
     // Wait for the navigation announcement, rather than silently skip MAVI.
     if(navigationAudioActive()||synth.speaking){
       if(++attempts>12){finish();return;}
       speechTimerRef.current=setTimeout(trySpeak,750);
       return;
     }
     try{
       const speech=new Utterance(String(message||'').slice(0,400));
       speech.lang='pt-BR';speech.rate=1;speech.volume=1;
       const voices=synth.getVoices?.()||[];
       const selected=voices.find(x=>String(x.lang).toLowerCase()==='pt-br')||
         voices.find(x=>String(x.lang).toLowerCase().startsWith('pt'));
       if(selected)speech.voice=selected;
       speechRef.current=speech;setStatus('speaking');
       speech.onend=finish;speech.onerror=finish;
       synth.resume?.();synth.speak(speech);
       // Some WebViews omit onend; never trap the microphone or route proposal.
       speechTimerRef.current=setTimeout(finish,15000);
     }catch{finish();}
   };
   if((typeof voiceTicket==='string'&&voiceTicket.length>10)||voiceTicket?.then){
     const controller=new AbortController();elevenAbortRef.current=controller;
     setStatus('speaking');
     // Wait for turn-by-turn speech to complete before starting MAVI audio.
     const startRemote=()=>{
       if(finished||!enabledRef.current||controller.signal.aborted)return;
       if(navigationAudioActive()||window.speechSynthesis?.speaking){
         if(++attempts>12){trySpeak();return;}
         speechTimerRef.current=setTimeout(startRemote,500);
         return;
       }
       void playMaviVoice(voiceTicket,{signal:controller.signal}).then(finish,()=>{
         if(controller.signal.aborted||finished||!enabledRef.current)return;
         // An expired token, 429, unsupported codec or autoplay block must
         // never deadlock a proposal. Existing browser TTS is the fallback.
         elevenAbortRef.current=null;
         trySpeak();
       });
     };
     if(voiceTicket?.then){
       Promise.resolve(voiceTicket).then(ticket=>{
         if(finished||controller.signal.aborted||!enabledRef.current)return;
         if(typeof ticket!=='string'||ticket.length<10){trySpeak();return;}
         voiceTicket=ticket;startRemote();
       }).catch(()=>{if(!finished&&!controller.signal.aborted)trySpeak();});
     }else startRemote();
     return;
   }
   trySpeak();
 }
 async function submit(phrase){
   const text=String(phrase||'').trim().slice(0,360);
   if(!text||!enabledRef.current||busyRef.current)return;
   stopRecognition();setHeard(text);setTyped('');
   const decision=proposalRef.current?maviProposalDecision(text):null;
   if(decision){chooseProposal(decision);return;}
   // Repeat the last spoken response without duplicating a provider request
   // or clearing a still-pending route offer.
   if(classifyMaviIntent(text)==='repeat'&&reply){speak(reply);return;}
   handlersRef.current.onDismissPreview?.();
   busyRef.current=true;setStatus('processing');setProposal(null);proposalRef.current=null;setOfferReady(false);
   const seq=++requestRef.current;controllerRef.current?.abort?.();
   const controller=new AbortController();controllerRef.current=controller;
   const timeout=setTimeout(()=>controller.abort(),14000);
   try{
     const firstTurn=firstMaviTurnRef.current;
     firstMaviTurnRef.current=false;
     const response=await handlersRef.current.onCommand(text,controller.signal,{firstTurn});
     if(!enabledRef.current||seq!==requestRef.current)return;
     const message=typeof response?.text==='string'?response.text:'Não consegui responder.';
     if(response?.mode==='proposal'&&response.routeData?.routes?.length){
       setProposal(response);proposalRef.current=response;
       try{handlersRef.current.onPreview?.(response);}catch{/* preview is optional; never block speech */}
     }
     if(response?.mode==='action'&&typeof response.action==='string'){
       try{handlersRef.current.onAction?.(response.action);}catch{/* fail safely */}
     }
     setReply(message);speak(message,()=>{
       if(seq===requestRef.current&&proposalRef.current===response&&mountedRef.current)setOfferReady(true);
     },response?.voiceTicket||response?.voiceTicketPromise);
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
   if(recorderRef.current?.state==='recording')return false;
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
     if(phrase)void submitRef.current(phrase);
   };
   recognition.onerror=event=>{
     if(!enabledRef.current||recognitionRef.current!==recognition)return;
     const code=String(event?.error||'unknown');
     // Silence is expected while awaiting a wake word; remain hands-free.
     if(code==='no-speech'){
       recognitionError.current='';
       setDiagnostic('Aguardando sua próxima fala.');
       setStatus('ready');
       return;
     }
     recognitionError.current=code;
     setDiagnostic('Reconhecimento '+(mode==='local'?'local':'do navegador')+': '+code);
     setReply(microphoneMessage(code));
     setStatus('typed');
   };
   recognition.onend=()=>{
     if(recognitionRef.current!==recognition)return;
     recognitionRef.current=null;recognitionActive.current=false;
     if(enabledRef.current&&!busyRef.current&&!recognitionError.current){
       setStatus('ready');scheduleNextListen(320);
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
     setReply('O serviço de reconhecimento não iniciou: '+String(error?.name||'erro')+'. Tente voz local ou teste a captura.');
     setStatus('typed');return false;
   }
 }
 const listenRef=useRef(listen);listenRef.current=listen;
 async function testMicrophone(){
   if(!enabledRef.current)return;
   if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext){
     setDiagnostic('Captura direta indisponível neste contexto.');
     setReply(microphoneMessage('insecure'));return;
   }
   try{
     const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
     const active=stream.getAudioTracks().some(x=>x.readyState==='live');
     const device=stream.getAudioTracks()[0]?.label||'microfone do aparelho';
     stream.getTracks().forEach(track=>track.stop());
     if(!enabledRef.current)return;
     if(active){setDiagnostic('Captura direta: OK ('+device.slice(0,60)+').');setReply('Microfone funcionando. Se o reconhecimento falhar, o bloqueio é do serviço de voz do navegador.');}
     else{setDiagnostic('Captura direta: sem faixa de áudio ativa.');setReply('Não consegui receber áudio de um microfone ativo.');}
   }catch(error){
     if(!enabledRef.current)return;
     const detail=mediaCaptureError(error);
     setDiagnostic('Captura direta: '+detail.code+' ('+String(error?.name||'erro')+').');
     setReply(detail.text);
   }
 }
 async function startRecording(){
   if(!enabledRef.current||busyRef.current)return;
   if(!serverStt){setReply('A gravação para transcrição requer um provedor de voz configurado no servidor. O teste do microfone funciona sem ele.');return;}
   const Recorder=window.MediaRecorder;
   if(!Recorder||!navigator.mediaDevices?.getUserMedia){setReply('Este navegador não permite gravar áudio diretamente.');return;}
   stopRecognition();recognitionError.current='recording';
   try{
     const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
     if(!enabledRef.current){stream.getTracks().forEach(t=>t.stop());return;}
     streamRef.current=stream;
     const mime=recorderMime(Recorder);
     const recorder=mime?new Recorder(stream,{mimeType:mime,audioBitsPerSecond:32000}):new Recorder(stream);
     const contentType=recorder.mimeType.split(';')[0]||'';
     if(!['audio/webm','audio/ogg','audio/mp4','audio/wav'].includes(contentType)){
       releaseStream();setReply('Formato de gravação não aceito pelo servidor.');return;
     }
     const chunks=[];recorderRef.current=recorder;
     recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
     recorder.onerror=()=>{releaseStream();setStatus('typed');setReply('A gravação falhou. Sua rota não foi alterada.');};
     recorder.onstop=async()=>{
       const audio=new Blob(chunks,{type:contentType});
       releaseStream();
       if(!enabledRef.current)return;
       if(audio.size<800){setReply('Não recebi áudio suficiente. Tente gravar por alguns segundos.');setStatus('typed');return;}
       if(audio.size>2500000){setReply('Gravação grande demais. Faça um pedido mais curto.');setStatus('typed');return;}
       const seq=++requestRef.current;const controller=new AbortController();
       controllerRef.current=controller;const timeout=setTimeout(()=>controller.abort(),15000);
       busyRef.current=true;setStatus('processing');setReply('Transcrevendo sua gravação…');
       try{
         const result=await api('/v2/assistant/transcribe',{method:'POST',body:audio,signal:controller.signal});
         if(!enabledRef.current||seq!==requestRef.current)return;
         const recognized=String(result.text||'').trim();
         setDiagnostic('Gravação direta transcrita pelo servidor.');
         busyRef.current=false;
         await submitRef.current(recognized);
       }catch(error){
         if(enabledRef.current&&seq===requestRef.current){
           setStatus('typed');setReply(error?.message||'Transcrição indisponível. Você pode digitar o comando.');
         }
       }finally{
         clearTimeout(timeout);if(controllerRef.current===controller)controllerRef.current=null;
         if(seq===requestRef.current&&busyRef.current){busyRef.current=false;setStatus('typed');}
       }
     };
     recorder.start();setCaptureActive(true);setStatus('recording');
     setDiagnostic('Gravação direta ativa (máximo 12 segundos).');
     setReply('Gravando. Toque em “Concluir gravação” para enviar o comando para transcrição.');
     recordTimerRef.current=setTimeout(stopRecording,12000);
   }catch(error){
     releaseStream();setStatus('typed');setReply(mediaCaptureError(error).text);
     setDiagnostic('Falha da captura direta: '+String(error?.name||'desconhecida'));
   }
 }
 useEffect(()=>{
   if(!enabled)return;
   let disposed=false;
   // Discovery only; recording is never uploaded without a deliberate tap.
   api('/v2/assistant/audio-capabilities').then(data=>{
     if(!disposed&&enabledRef.current)setServerStt(data?.serverTranscription===true);
   }).catch(()=>{if(!disposed)setServerStt(false);});
   if(Recognizer?.available){
     Promise.resolve(Recognizer.available({langs:['pt-BR'],processLocally:true}))
      .then(state=>{if(!disposed)setLocalReady(state==='available');})
      .catch(()=>{if(!disposed)setLocalReady(false);});
   }
   return()=>{disposed=true;};
 },[enabled]);
 useEffect(()=>{requestRef.current++;controllerRef.current?.abort?.();
   elevenAbortRef.current?.abort();elevenAbortRef.current=null;
   setProposal(null);proposalRef.current=null;setOfferReady(false);
   handlersRef.current.onDismissPreview?.();
 },[routeContextKey]);
 useEffect(()=>onNavigationAudioStart(()=>{
   if(!enabledRef.current)return;
   const wasSpeaking=Boolean(elevenAbortRef.current||speechRef.current);
   if(!wasSpeaking)return;
   elevenAbortRef.current?.abort();elevenAbortRef.current=null;
   if(speechRef.current){try{window.speechSynthesis?.cancel?.()}catch{}}
   speechRef.current=null;clearTimeout(speechTimerRef.current);speechTimerRef.current=null;
   // A maneuver preempts assistant audio without disabling hands-free listening.
   busyRef.current=false;setStatus('ready');scheduleNextListen(1200);
 }),[]);
 useEffect(()=>()=>{mountedRef.current=false;cancelEverything();},[]);

 function toggle(){
   if(enabledRef.current){
     cancelEverything();handlersRef.current.onDismissPreview?.();setEnabled(false);setStatus('off');setReply('');setProposal(null);setOfferReady(false);return;
   }
   enabledRef.current=true;busyRef.current=false;recognitionError.current='';
   firstMaviTurnRef.current=true;
   setEnabled(true);setStatus('ready');
   setReply('Pode falar: “Quanto falta?”, “Próxima conversão”, “Outra rota” ou “O que você sabe fazer?”.');
   if(!Recognizer){setStatus('typed');setReply(microphoneMessage('unsupported'));return;}
   // Crucial: call start() inside the original click, not after a timeout/effect.
   listenRef.current('remote');
 }
 function fixedVoiceTicket(message){
   // Fixed, audited phrases; the server never accepts arbitrary TTS text.
   return api('/v2/assistant/local-voice-ticket',{
     method:'POST',body:{intent:'confirmation',text:message}
   }).then(result=>result.voiceTicket).catch(()=>null);
 }
 function chooseProposal(decision){
   const selection=proposalRef.current;
   if(!enabledRef.current||!selection)return false;
   setOfferReady(false);
   setProposal(null);proposalRef.current=null;
   handlersRef.current.onDismissPreview?.();
   if(decision==='reject'){
     setReply('Mantive sua rota atual.');
     speak('Tudo bem, sua rota atual foi mantida.',null,fixedVoiceTicket('Tudo bem, sua rota atual foi mantida.'));

     return true;
   }
   let applied=false;
   try{applied=handlersRef.current.onAccept(selection)!==false;}catch{/* expired route */}
   const message=applied?(selection.kind==='poi_stop'?'Parada adicionada. Depois, peça para continuar ao destino original.':'Nova rota selecionada.'):'Esta sugestão expirou. Peça outra alternativa.';
   setReply(message);speak(message,null,fixedVoiceTicket(message));
   return applied;
 }
 function accept(){return chooseProposal('accept');}
 function reject(){return chooseProposal('reject');}
 const offerTarget=typeof document!=='undefined'?document.getElementById('mavi-offer-host'):null;
 const voicePhase=!enabled?'off':status==='listening'?'listening':status==='processing'?'processing':status==='speaking'?'speaking':status==='typed'?'paused':'ready';
 const voiceLabel={
   off:'Ativar escuta da MAVI',ready:'MAVI ativa · aguardando voz',
   listening:'MAVI escutando',processing:'MAVI processando',
   speaking:'MAVI respondendo',paused:'Microfone precisa de atenção'
 }[voicePhase];
 return <div className={'jev-control-wrap mavi-voice-'+voicePhase}>
  <button type="button"
   className={'circle-btn jev-mic '+(enabled?'jev-mic-active ':'')+(status==='listening'?'jev-listening':'')}
   onClick={toggle} aria-label={enabled?'Desativar escuta contínua da MAVI':'Ativar escuta da MAVI'}
   aria-pressed={enabled} aria-describedby="mavi-voice-status" title={voiceLabel}>
   <span className="mavi-mic-glyph" aria-hidden="true">
     {voicePhase==='off'?<MicOff size={21} strokeWidth={1.9}/>:
      voicePhase==='processing'?<RefreshCw size={19} strokeWidth={2}/>:
      voicePhase==='speaking'?<AudioLines size={21} strokeWidth={2}/>:
      <Mic size={21} strokeWidth={2}/>}
   </span>
   <span className="mavi-mic-pulse" aria-hidden="true"/>
   <span className="mavi-mic-indicator" aria-hidden="true"/>
  </button>
  <span id="mavi-voice-status" className="mavi-voice-status" role="status" aria-live="polite">
    {voiceLabel}
  </span>
  {enabled&&offerReady&&proposal&&offerTarget&&createPortal(
    <section className="mavi-offer-card" role="group" aria-label={proposal.kind==='poi_stop'?'Parada sugerida pela MAVI':'Alternativa de rota sugerida pela MAVI'}>
      <div className="mavi-offer-header">
        <span className="mavi-offer-symbol"><Check size={18} aria-hidden="true"/></span>
        <div><strong>{proposal.kind==='poi_stop'?'Prévia de parada':'Prévia da nova rota'}</strong><small>{proposal.kind==='poi_stop'?'Destino original preservado':'Linha turquesa no mapa · confirme antes de trocar'}</small></div>
      </div>
      <p className="mavi-offer-description">{proposal.text||'Encontrei uma rota alternativa. Quer utilizá-la?'}</p>
      <div className="mavi-offer-actions">
        <button type="button" className="mavi-offer-reject" onClick={reject}>Manter atual</button>
        <button type="button" className="mavi-offer-confirm" onClick={accept}><Check size={16} aria-hidden="true"/> {proposal.kind==='poi_stop'?'Adicionar parada':'Usar rota'}</button>
      </div>
      <small className="mavi-offer-voice-hint">Ou diga “Pode” ou “Não” para decidir por voz.</small>
    </section>,offerTarget
  )}
 </div>;
}
