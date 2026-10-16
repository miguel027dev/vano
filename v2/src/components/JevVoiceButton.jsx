import '../jev-voice.css';
import React,{useEffect,useRef,useState} from 'react';
import {Mic,MicOff,Send,X,Check,Volume2,RefreshCw,AudioLines,ShieldCheck,AlertCircle} from 'lucide-react';
import {api} from '../lib/api.js';
import {microphoneMessage,mediaCaptureError,recorderMime} from '../lib/jevMicSupport.mjs';

/** The V2-only voice input has three independent paths:
 * browser SpeechRecognition, optional local SpeechRecognition and direct
 * getUserMedia/MediaRecorder capture with optional server STT.
 * Navigation voice and all other map screens remain independent.
 */
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('off');
 const [reply,setReply]=useState(''),[heard,setHeard]=useState(''),[typed,setTyped]=useState('');
 const [proposal,setProposal]=useState(null),[diagnostic,setDiagnostic]=useState('');
 const [localReady,setLocalReady]=useState(false),[serverStt,setServerStt]=useState(false);
 const [captureActive,setCaptureActive]=useState(false);
 const enabledRef=useRef(false),mountedRef=useRef(true),busyRef=useRef(false);
 const recognitionRef=useRef(null),recognitionActive=useRef(false),recognitionError=useRef('');
 const recorderRef=useRef(null),streamRef=useRef(null),recordTimerRef=useRef(null);
 const requestRef=useRef(0),controllerRef=useRef(null),listenTimerRef=useRef(null);
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
   speechRef.current=null;
   // Do not cancel global speechSynthesis: it also belongs to navigation maneuvers.
 }
 function scheduleNextListen(){
   clearTimeout(listenTimerRef.current);
   if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
   listenTimerRef.current=setTimeout(()=>{
     if(!enabledRef.current||busyRef.current||recognitionError.current||!Recognizer)return;
     if(window.speechSynthesis?.speaking){scheduleNextListen();return;}
     listen('remote');
   },750);
 }
 function done(){
   busyRef.current=false;
   if(!enabledRef.current)return;
   if(recognitionError.current)setStatus('typed');
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
     speech.onend=()=>{if(speechRef.current===speech){speechRef.current=null;done();}};
     speech.onerror=()=>{if(speechRef.current===speech){speechRef.current=null;done();}};
     synth.speak(speech);
   }catch{done();}
 }
 async function submit(phrase){
   const text=String(phrase||'').trim().slice(0,360);
   if(!text||!enabledRef.current||busyRef.current)return;
   stopRecognition();setHeard(text);setTyped('');
   const simplified=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
   if(proposalRef.current&&/^(sim|pode|aceito|usar|confirma|confirmar|vamos|isso)(\b|$)/.test(simplified)){
     const selection=proposalRef.current;setProposal(null);proposalRef.current=null;
     let ok=false;try{ok=handlersRef.current.onAccept(selection)!==false;}catch{/* stale route */}
     const text=ok?'Nova rota selecionada.':'A sugestão expirou. Peça outra alternativa.';
     busyRef.current=true;setReply(text);speak(text);return;
   }
   if(proposalRef.current&&/^(nao|cancelar|deixa|manter|fica)(\b|$)/.test(simplified)){
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
     const code=String(event?.error||'unknown');recognitionError.current=code;
     setDiagnostic('Reconhecimento '+(mode==='local'?'local':'do navegador')+': '+code);
     setReply(microphoneMessage(code));
     setStatus(code==='no-speech'?'ready':'typed');
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
   setProposal(null);proposalRef.current=null;
 },[routeContextKey]);
 useEffect(()=>()=>{mountedRef.current=false;cancelEverything();},[]);

 function toggle(){
   if(enabledRef.current){
     cancelEverything();setEnabled(false);setStatus('off');setReply('');setProposal(null);return;
   }
   enabledRef.current=true;busyRef.current=false;recognitionError.current='';
   setEnabled(true);setStatus('ready');
   setReply('Pode falar: “Procure outra rota” ou “Evite pedágios”.');
   if(!Recognizer){setStatus('typed');setReply(microphoneMessage('unsupported'));return;}
   // Crucial: call start() inside the original click, not after a timeout/effect.
   listenRef.current('remote');
 }
 function accept(){
   if(!proposal)return;
   let applied=false;
   try{applied=handlersRef.current.onAccept(proposal)!==false;}catch{/* stale route */}
   setProposal(null);proposalRef.current=null;
   setReply(applied?'Nova rota selecionada.':'Esta sugestão expirou. Peça outra alternativa.');
 }
 function reject(){setProposal(null);proposalRef.current=null;setReply('Mantive sua rota atual.');}
 return <div className="jev-control-wrap">
  <button type="button" className={'circle-btn jev-mic '+(enabled?'jev-mic-active ':'')+(status==='listening'?'jev-listening':'')}
   onClick={toggle} aria-label={enabled?'Desativar assistente de voz':'Ativar assistente de voz'}
   aria-pressed={enabled} title={enabled?'Desativar assistente':'Falar com o assistente'}>
   {enabled?<Mic size={21}/>:<MicOff size={21}/>}
  </button>
  {enabled&&<section className="jev-panel" aria-label="VANO Assistant, protótipo de voz">
   <div className="jev-head"><strong><Volume2 size={16}/> VANO Assistant</strong>
    <button type="button" onClick={toggle} aria-label="Fechar assistente"><X size={17}/></button>
   </div>
   <small className="jev-status" role="status">{status==='listening'?'Escutando sua voz…':status==='processing'?'Processando comando…':
    status==='speaking'?'Respondendo por voz…':status==='recording'?'Gravando áudio…':
    status==='typed'?'Reconhecimento indisponível · tente alternativa':'Pronto para ouvir'}</small>
   {heard&&<p className="jev-heard">Você: {heard}</p>}
   {reply&&<p className="jev-reply" aria-live="polite">{reply}</p>}
   {proposal&&<div className="jev-actions">
    <button type="button" onClick={accept}><Check size={15}/> Usar rota</button>
    <button type="button" onClick={reject}>Manter atual</button>
   </div>}
   <div className="jev-voice-options">
    {Recognizer&&<button type="button" onClick={()=>listenRef.current('remote')} disabled={busyRef.current||captureActive}>
     <RefreshCw size={14}/> Ouvir novamente
    </button>}
    {localReady&&<button type="button" onClick={()=>listenRef.current('local')} disabled={busyRef.current||captureActive}>
     <AudioLines size={14}/> Voz local
    </button>}
    <button type="button" onClick={testMicrophone} disabled={captureActive}><ShieldCheck size={14}/> Testar microfone</button>
    {serverStt&&<button type="button" onClick={captureActive?stopRecording:startRecording} disabled={busyRef.current}>
     <Mic size={14}/> {captureActive?'Concluir gravação':'Gravar comando'}
    </button>}
   </div>
   {diagnostic&&<small className="jev-diagnostic" role="status"><AlertCircle size={12}/>{diagnostic}</small>}
   {serverStt&&<small className="jev-privacy">Ao gravar, o áudio é enviado para transcrição por um provedor externo, apenas após você tocar em “Gravar comando”.</small>}
   <form className="jev-text" onSubmit={event=>{event.preventDefault();void submitRef.current(typed);}}>
    <input aria-label="Digitar comando para o assistente" placeholder="Ou digite seu pedido" value={typed}
     onChange={event=>setTyped(event.target.value)} maxLength={360}/>
    <button type="submit" aria-label="Enviar comando" disabled={!typed.trim()||busyRef.current}><Send size={17}/></button>
   </form>
  </section>}
 </div>;
}
