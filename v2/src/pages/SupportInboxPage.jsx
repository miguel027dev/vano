import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useVano} from '../context';
import {api,post} from '../lib/api';
import {SUPPORT_LABELS} from '../components/SupportContact';
function Ticket({ticket,onReply}){
 const [reply,setReply]=useState(ticket.reply||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event){event.preventDefault();setBusy(true);setError('');try{await post(`/admin/support/${ticket.id}/reply`,{reply});await onReply();}catch(ex){setError(ex.message);}finally{setBusy(false);}}
 return <article className="support-response"><h3>{SUPPORT_LABELS[ticket.topic]} · {ticket.status==='respondido'?'Respondido':'Aberto'}</h3><small>{new Date(ticket.createdAt).toLocaleString('pt-BR')} · {ticket.id}</small>{ticket.email&&<p>E-mail informado: {ticket.email}</p>}<p>{ticket.message}</p><form onSubmit={submit}><label htmlFor={`reply-${ticket.id}`}>Resposta no protocolo</label><textarea id={`reply-${ticket.id}`} rows={4} value={reply} onChange={e=>setReply(e.target.value)} required minLength={3} maxLength={2000}/><small>Não inclua dados pessoais ou credenciais. A resposta fica acessível pelo código secreto do usuário. Não há envio por e-mail.</small><button disabled={busy}>{busy?'Salvando…':'Salvar resposta'}</button></form>{error&&<p role="alert">{error}</p>}</article>;
}
export default function SupportInboxPage(){
 const {user,loading}=useVano();const [offset,setOffset]=useState(0),[total,setTotal]=useState(0),[tickets,setTickets]=useState([]),[error,setError]=useState(''),[fetching,setFetching]=useState(false);
 async function refresh(){setFetching(true);setError('');try{const data=await api(`/admin/support?offset=${offset}`);setTickets(data.tickets);setTotal(data.total);}catch(ex){setError(ex.message);}finally{setFetching(false);}}
 useEffect(()=>{if(user?.isAdmin)refresh();},[user?.isAdmin,offset]);
 if(loading)return <main className="content-page" role="status">Verificando acesso…</main>;
 if(!user?.isAdmin)return <main className="content-page"><h1>Suporte administrativo</h1><p>Área restrita à administração.</p><Link to="/entrar">Entrar</Link></main>;
 return <main className="content-page"><section className="support-contact"><Link to="/admin">Voltar à administração</Link><h1>Solicitações de suporte</h1><p>Responda pelo protocolo. Não execute alterações de conta ou exclusões sem o fluxo de verificação apropriado. Retenção de até 90 dias.</p><button type="button" disabled={fetching} onClick={refresh}>Atualizar fila</button>{error&&<p role="alert">{error}</p>}{fetching&&<p role="status">Carregando…</p>}{!fetching&&!error&&!tickets.length&&<p>Nenhuma solicitação na fila.</p>}<nav aria-label="Páginas de solicitações"><button type="button" className="support-secondary" disabled={offset===0||fetching} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Anteriores</button> <span>{total?`${offset+1}–${Math.min(offset+50,total)} de ${total}`:'0 solicitações'}</span> <button type="button" className="support-secondary" disabled={offset+50>=total||fetching} onClick={()=>setOffset(value=>value+50)}>Próximas</button></nav>{tickets.map(ticket=><Ticket key={ticket.id} ticket={ticket} onReply={refresh}/>)}</section></main>;
}
