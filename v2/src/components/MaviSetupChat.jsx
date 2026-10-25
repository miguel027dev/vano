import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Headphones,LoaderCircle,RotateCcw,ShieldCheck,Route,Volume2,VolumeX,Zap} from 'lucide-react';
import {api} from '../lib/api';
import {playMaviVoice} from '../lib/maviElevenPlayback.mjs';

export const MAVI_STEPS=Object.freeze([
  {id:'route',question:'Para começar: o que importa mais na escolha de uma rota?',
   choices:[{label:'Chegar mais rápido',value:'fast',detail:'Menor tempo estimado',icon:Zap},
    {label:'Comparar segurança',value:'safe',detail:'Quando houver dados verificados',icon:ShieldCheck}]},
  {id:'tolls',question:'Posso incluir caminhos com pedágio?',
   choices:[{label:'Prefiro evitar',value:true,detail:'Buscar alternativas sem pedágio'},
    {label:'Pode incluir',value:false,detail:'Considerar também vias pedagiadas'}]},
  {id:'alerts',question:'Quer receber avisos de ocorrências pelo VANO?',
   choices:[{label:'Sim, pode avisar',value:true,detail:'Alertas quando disponíveis'},
    {label:'Prefiro desativar',value:false,detail:'Menos notificações'}]}
]);

const summaries={route:{fast:'Chegada mais rápida',safe:'Comparar segurança'},tolls:{true:'Evitar pedágios',false:'Permitir pedágios'},alerts:{true:'Alertas ativados',false:'Alertas desativados'}};
export function getMaviSummary(settings){return MAVI_STEPS.map(item=>({id:item.id,label:summaries[item.id][String(settings[item.id])]}));}

export default function MaviSetupChat({settings,onChange,firstName='você',compact=false}){
 const [step,setStep]=useState(0),[speaking,setSpeaking]=useState(false),[voiceError,setVoiceError]=useState('');
 const voiceRequest=useRef(null);
 useEffect(()=>()=>voiceRequest.current?.abort(),[]);
 const done=step>=MAVI_STEPS.length;
 const current=MAVI_STEPS[step];
 const messages=MAVI_STEPS.slice(0,step).map((item,index)=>({id:item.id,question:item.question,response:summaries[item.id][String(settings[item.id])],index}));
 async function speak(){
   voiceRequest.current?.abort();
   const controller=new AbortController();voiceRequest.current=controller;setVoiceError('');setSpeaking(true);
   try{
     const stage=done?'done':step===0?'welcome':current.id;
     const result=await api('/v2/onboarding/voice-ticket',{method:'POST',signal:controller.signal,body:JSON.stringify({stage})});
     if(!result?.voiceTicket)throw new Error('Voz da MAVI indisponível.');
     await playMaviVoice(result.voiceTicket,{signal:controller.signal});
   }catch(error){if(!controller.signal.aborted)setVoiceError('A voz não está disponível agora. Continue pelas mensagens.');}
   finally{if(voiceRequest.current===controller){voiceRequest.current=null;setSpeaking(false);}}
 }
 function answer(value){if(!current)return;voiceRequest.current?.abort();setSpeaking(false);onChange(current.id,value);setStep(s=>Math.min(s+1,MAVI_STEPS.length));setVoiceError('');}
 return <section className={`mavi-setup ${compact?'mavi-setup-compact':''}`} aria-label="Converse com a MAVI para personalizar suas rotas">
  <header className="mavi-setup-top">
    <div className="mavi-setup-avatar" aria-hidden="true"><Route size={22} strokeWidth={1.85}/></div>
    <div><span className="mavi-setup-brand">MAVI <span>·</span> ASSISTENTE VANO</span><strong>Sua próxima rota começa aqui.</strong></div>
    <button type="button" className="mavi-setup-audio" onClick={speaking?()=>{voiceRequest.current?.abort();setSpeaking(false);}:speak} aria-label={speaking?'Parar áudio da MAVI':'Ouvir MAVI'} aria-pressed={speaking} title="A mesma voz usada pela MAVI no mapa">{speaking?<VolumeX size={19}/>:<Volume2 size={19}/>}</button>
  </header>
  <div className="mavi-setup-conversation" aria-live="polite">
    <div className="mavi-setup-bubble mavi-setup-bubble-ai"><span className="mavi-setup-author">MAVI</span>Bem-vindo ao VANO, {firstName}! Quero conhecer três preferências para facilitar seus trajetos. Sem pedir sua localização.</div>
    {messages.map(item=><React.Fragment key={item.id}>
      {item.index>0&&<div className="mavi-setup-bubble mavi-setup-bubble-ai"><span className="mavi-setup-author">MAVI</span>{item.question}</div>}
      <div className="mavi-setup-bubble mavi-setup-bubble-user">{item.response}</div>
    </React.Fragment>)}
    <div className="mavi-setup-bubble mavi-setup-bubble-ai mavi-setup-question"><span className="mavi-setup-author">MAVI</span>{done?'Pronto! Essas escolhas ficarão nas suas preferências. Você pode mudar tudo depois.':current.question}</div>
  </div>
  {!done?<div className="mavi-setup-answers" role="group" aria-label={current.question}>{current.choices.map(choice=><button type="button" key={String(choice.value)} onClick={()=>answer(choice.value)} className="mavi-setup-answer">{choice.icon?<choice.icon size={19}/>:<ArrowRight size={18}/>}<span><strong>{choice.label}</strong><small>{choice.detail}</small></span><ArrowRight className="mavi-setup-chevron" size={17}/></button>)}</div>
   :<div className="mavi-setup-complete"><span><Check size={18}/> Tudo certo</span><button type="button" onClick={()=>setStep(0)}><RotateCcw size={15}/> Rever respostas</button></div>}
  <footer className="mavi-setup-footer"><div className="mavi-setup-progress" aria-label={`${Math.min(step,MAVI_STEPS.length)} de ${MAVI_STEPS.length} perguntas respondidas`}>{MAVI_STEPS.map((s,i)=><span key={s.id} className={i<step?'is-done':i===step?'is-current':''}/>)}</div><span>{done?'Personalização pronta':`Pergunta ${step+1} de ${MAVI_STEPS.length}`}</span></footer>
  {voiceError&&<p className="mavi-setup-voice-error" role="status">{voiceError}</p>}
 </section>;
}
