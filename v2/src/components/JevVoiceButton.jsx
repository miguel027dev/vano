import React,{useEffect,useRef,useState} from 'react';
import { Mic, MicOff, Send, X, Check, Volume2 } from 'lucide-react';

// Experimental web-only hands-free assistant. It does not own the navigation
// speaker: maneuver instructions retain priority over assistant responses.
export default function JevVoiceButton({onCommand,onAccept,routeContextKey,navigationActive=false,maneuverDistance=null,muted=false}){
  const [enabled,setEnabled]=useState(false);
  const [status,setStatus]=useState('off');
  const [reply,setReply]=useState('');
  const [heard,setHeard]=useState('');
  const [typed,setTyped]=useState('');
  const [proposal,setProposal]=useState(null);
  const enabledRef=useRef(false),busyRef=useRef(false),recognizerRef=useRef(null);
  const submitRef=useRef(null),startTimer=useRef(null),requestRef=useRef(0),controllerRef=useRef(null);
  const proposalRef=useRef(null),replySpeechRef=useRef(null);
  const commandRef=useRef(onCommand),acceptRef=useRef(onAccept);
  const flagsRef=useRef({navigationActive,maneuverDistance,muted});
  commandRef.current=onCommand;
  acceptRef.current=onAccept;
  flagsRef.current={navigationActive,maneuverDistance,muted};
  proposalRef.current=proposal;
  const hasRecognition=typeof window!=='undefined'&&Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);

  function scheduleListen(){
    clearTimeout(startTimer.current);
    if(!enabledRef.current||busyRef.current||!recognizerRef.current)return;
    startTimer.current=setTimeout(()=>{
      if(!enabledRef.current||busyRef.current)return;
      if(window.speechSynthesis?.speaking){scheduleListen();return;}
      try{recognizerRef.current?.start();setStatus('listening');}
      catch(error){if(error?.name!=='InvalidStateError'){setStatus('error');setReply('Toque novamente no microfone ou digite seu pedido.');}}
    },600);
  }
  function done(){
    busyRef.current=false;
    if(enabledRef.current){setStatus(hasRecognition?'idle':'typed');scheduleListen();}
  }
  function speak(text){
    const {navigationActive, maneuverDistance,muted}=flagsRef.current;
    const synth=window.speechSynthesis;
    const Utterance=window.SpeechSynthesisUtterance;
    // Never interrupt a navigation maneuver or a different speaker.
    if(!synth||!Utterance||muted||synth.speaking||
      (navigationActive&&Number.isFinite(maneuverDistance)&&maneuverDistance<250)){done();return;}
    try{
      const utterance=new Utterance(text);
      utterance.lang='pt-BR';utterance.rate=1;utterance.volume=1;
      const voices=synth.getVoices?.()||[];
      const voice=voices.find(v=>String(v.lang).toLowerCase()==='pt-br')||
        voices.find(v=>String(v.lang).toLowerCase().startsWith('pt'));
      if(voice)utterance.voice=voice;
      replySpeechRef.current=utterance;
      setStatus('speaking');
      utterance.onend=()=>{if(replySpeechRef.current===utterance){replySpeechRef.current=null;done();}};
      utterance.onerror=()=>{if(replySpeechRef.current===utterance){replySpeechRef.current=null;done();}};
      synth.speak(utterance);
    }catch{done();}
  }
  async function submit(text){
    const phrase=String(text||'').trim().slice(0,360);
    if(!phrase||busyRef.current||!enabledRef.current)return;
    clearTimeout(startTimer.current);
    try{recognizerRef.current?.stop?.();}catch{/* recognition not running */}
    setHeard(phrase);setTyped('');
    const normalized=phrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(proposalRef.current&&/^(sim|pode|aceito|usar|confirma|confirmar|vamos|isso)(\b|$)/.test(normalized)){
      const candidate=proposalRef.current;
      setProposal(null);proposalRef.current=null;
      const accepted=acceptRef.current(candidate);
      const message=accepted===false?'A rota mudou enquanto conversávamos. Peça outra alternativa.':'Nova rota selecionada.';
      setReply(message);busyRef.current=true;speak(message);return;
    }
    if(proposalRef.current&&/^(nao|cancelar|deixa|manter|fica)(\b|$)/.test(normalized)){
      setProposal(null);proposalRef.current=null;
      setReply('Tudo bem. Mantive sua rota atual.');
      busyRef.current=true;speak('Tudo bem. Mantive sua rota atual.');return;
    }
    const token=++requestRef.current;
    controllerRef.current?.abort?.();
    const controller=new AbortController();
    controllerRef.current=controller;
    busyRef.current=true;setStatus('processing');setProposal(null);proposalRef.current=null;
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
      const result=await commandRef.current(phrase,controller.signal);
      if(!enabledRef.current||token!==requestRef.current)return;
      const message=typeof result?.text==='string'?result.text:'Não consegui responder agora.';
      if(result?.mode==='proposal'&&result.routeData?.routes?.length){
        setProposal(result);proposalRef.current=result;
      }
      setReply(message);speak(message);
    }catch(error){
      if(!enabledRef.current||token!==requestRef.current)return;
      const message=controller.signal.aborted?
        'A pesquisa demorou demais. Sua rota continua igual.':
        'Não consegui consultar o servidor. Sua rota continua igual.';
      setReply(message);speak(message);
    }finally{
      clearTimeout(timer);
      if(controllerRef.current===controller)controllerRef.current=null;
    }
  }
  submitRef.current=submit;

  useEffect(()=>{
    if(!enabled)return;
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setStatus('typed');setReply('Seu navegador não oferece reconhecimento de voz. Você pode digitar seu pedido.');return;}
    let recognition;
    try{recognition=new Recognition();}catch{setStatus('typed');return;}
    recognition.lang='pt-BR';recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
    recognizerRef.current=recognition;
    recognition.onresult=event=>{
      const text=Array.from(event.results||[]).map(r=>r?.[0]?.transcript||'').join(' ').trim();
      if(text)void submitRef.current?.(text);
    };
    recognition.onerror=event=>{
      if(!enabledRef.current)return;
      if(['not-allowed','service-not-allowed','audio-capture'].includes(event?.error)){
        recognizerRef.current=null;setStatus('typed');
        setReply('Microfone indisponível ou sem permissão. Digite o comando abaixo.');
      }else if(event?.error!=='aborted'&&event?.error!=='no-speech'){
        setStatus('typed');setReply('Não foi possível reconhecer a fala. Você pode digitar o comando.');
        recognizerRef.current=null;
      }
    };
    recognition.onend=()=>{if(enabledRef.current&&!busyRef.current&&recognizerRef.current===recognition)scheduleListen();};
    scheduleListen();
    return()=>{clearTimeout(startTimer.current);if(recognizerRef.current===recognition)recognizerRef.current=null;try{recognition.abort();}catch{/* closed */}};
  },[enabled]);

  useEffect(()=>{
    // A route change invalidates proposals calculated from older geometry.
    requestRef.current++;controllerRef.current?.abort?.();
    setProposal(null);proposalRef.current=null;
  },[routeContextKey]);
  useEffect(()=>()=>{enabledRef.current=false;clearTimeout(startTimer.current);
    requestRef.current++;controllerRef.current?.abort?.();
    try{recognizerRef.current?.abort();}catch{/* closed */}
  },[]);

  function toggle(){
    if(enabledRef.current){
      enabledRef.current=false;setEnabled(false);setStatus('off');setReply('');setProposal(null);proposalRef.current=null;
      requestRef.current++;controllerRef.current?.abort?.();clearTimeout(startTimer.current);
      try{recognizerRef.current?.abort();}catch{/* stopped */}
      return;
    }
    enabledRef.current=true;busyRef.current=false;
    setEnabled(true);setStatus('idle');setReply('Pode falar! Peça outra rota, menos trânsito ou evitar pedágios.');
  }
  function apply(){
    if(!proposal)return;
    const accepted=acceptRef.current(proposal);
    const message=accepted===false?'Esta sugestão expirou. Peça uma nova rota.':'Nova rota selecionada.';
    setProposal(null);proposalRef.current=null;setReply(message);
  }
  function reject(){setProposal(null);proposalRef.current=null;setReply('Sua rota atual foi mantida.');}

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
      <small className="jev-status" role="status">{status==='listening'?'Escutando…':status==='processing'?'Consultando alternativas…':
        status==='speaking'?'Respondendo por voz…':status==='typed'?'Entrada por texto disponível':
        status==='error'?'Microfone indisponível':'Microfone ativado'}</small>
      {heard&&<p className="jev-heard">Você: {heard}</p>}
      {reply&&<p className="jev-reply" aria-live="polite">{reply}</p>}
      {proposal&&<div className="jev-actions">
        <button type="button" onClick={apply}><Check size={15}/> Usar rota</button>
        <button type="button" onClick={reject}>Manter atual</button>
      </div>}
      <form className="jev-text" onSubmit={event=>{event.preventDefault();void submit(typed);}}>
        <input aria-label="Digitar comando para o assistente" placeholder="Ou digite seu pedido" value={typed}
          onChange={event=>setTyped(event.target.value)} maxLength={360}/>
        <button type="submit" aria-label="Enviar comando" disabled={!typed.trim()||busyRef.current}><Send size={17}/></button>
      </form>
    </section>}
  </div>;
}
