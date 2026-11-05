import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,LifeBuoy,LoaderCircle} from 'lucide-react';
import {api} from '../lib/api';
import './HelpAssistant.css';
export default function HelpAssistant(){
 const [question,setQuestion]=useState(''),[useAI,setUseAI]=useState(false),[answer,setAnswer]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [aiAvailable,setAiAvailable]=useState(false);
 const request=useRef(null);
 useEffect(()=>{let current=true;const controller=new AbortController();api('/help/status',{signal:controller.signal}).then(status=>{if(current)setAiAvailable(status.aiAvailable===true);}).catch(()=>{});return()=>{current=false;controller.abort();};},[]);
 useEffect(()=>()=>request.current?.abort(),[]);
 function cancel(){request.current?.abort();request.current=null;setBusy(false);setError('Consulta cancelada. Você pode continuar usando a ajuda.');}
 async function ask(event){event.preventDefault();if(busy)return;const controller=new AbortController();request.current=controller;setBusy(true);setError('');setAnswer(null);
  try{const result=await api('/help/ask',{method:'POST',body:{question,useAI:aiAvailable&&useAI},signal:controller.signal});if(!controller.signal.aborted)setAnswer(result);}
  catch(ex){if(!controller.signal.aborted)setError(ex.message||'Não foi possível consultar a ajuda. Use as perguntas frequentes abaixo.');}
  finally{if(request.current===controller){setBusy(false);request.current=null;}}
 }
 return <section className="help-assistant" aria-labelledby="help-assistant-title">
  <div><span className="help-assistant-overline"><LifeBuoy size={18}/> AJUDA DO VANO</span><h2 id="help-assistant-title">Qual é a sua dúvida?</h2><p>Orientações sobre acesso, GPS, rotas, lugares salvos e preferências. Não consultamos nem alteramos sua conta.</p></div>
  <form onSubmit={ask} aria-busy={busy}>
   <label htmlFor="help-question">Sua pergunta</label>
   <textarea id="help-question" value={question} onChange={e=>setQuestion(e.target.value)} minLength={3} maxLength={600} required rows={3} placeholder="Ex.: como recuperar minha senha?" aria-describedby="help-question-privacy"/>
   <p id="help-question-privacy" className="help-assistant-note">Não inclua senha, e-mail, endereço, localização ou dados pessoais. As perguntas não são salvas no histórico do VANO.</p>
   {aiAvailable&&<label className="help-ai-choice"><input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)}/><span>Usar IA experimental da NVIDIA nesta consulta</span></label>}
   {aiAvailable&&useAI&&<p className="help-assistant-note" role="note">Ao consultar, sua pergunta será enviada à NVIDIA se a integração de teste estiver disponível. A IA apenas identifica o assunto; a orientação vem da ajuda do VANO. Sem acesso à sua conta ou GPS. Você pode usar a ajuda local sem marcar esta opção.</p>}
   <div className="help-assistant-actions"><button type="submit" disabled={busy}>{busy?<><LoaderCircle size={18}/> Consultando…</>:<>Consultar {aiAvailable&&useAI?'com IA de teste':'ajuda local'} <ArrowRight size={18}/></>}</button>{busy&&<button type="button" className="help-cancel" onClick={cancel}>Cancelar</button>}</div>
  </form>
  {error&&<p role="alert">{error}</p>}
  {answer&&<div className="help-assistant-answer" role="status"><strong>{answer.source==='ai-assisted'?'Assunto identificado com IA · orientação do VANO':'Orientação da ajuda local'}</strong>{answer.notice&&<p>{answer.notice}</p>}<p>{answer.answer}</p><div>{answer.links?.map(link=><Link key={link.href} to={link.href}>{link.label} <ArrowRight size={16}/></Link>)}</div></div>}
 </section>;
}
