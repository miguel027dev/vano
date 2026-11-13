import React,{useEffect,useState,useRef} from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { CarFront,ShieldCheck, Bell, SunMoon, Route, Ticket, Globe2, Map, LockKeyhole, CircleHelp,FileText,UserRound, Mail, Trash2, Settings2, AlertTriangle,MessageSquareText,Info,KeyRound,ArrowLeft,ArrowRight,CheckCircle2,ExternalLink,Download,Save,Shield } from 'lucide-react';
import { useVano } from '../context';
import { api,patch,remove } from '../lib/api';
import { PageHeader,Section,OptionRow,Notice,CTA } from '../components/Ui';
import {LANGUAGES} from '../lib/i18n';

const SETTINGS_LOCALES={
 'pt-BR':{name:'Português',country:'BR'},
 'pt-PT':{name:'Português',country:'PT'},
 'fr-FR':{name:'Français',country:'FR'},
 'en-US':{name:'English',country:'US'},
};
function LocaleFlag({code}){
 const country=SETTINGS_LOCALES[code]?.country||'BR';
 return <svg className="settings-country-flag" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
 {country==='BR'?<><path fill="#169b62" d="M0 0h30v20H0z"/><path fill="#ffdf00" d="m15 2 12 8-12 8L3 10z"/><circle cx="15" cy="10" r="5" fill="#21468b"/><path d="M10.5 8.5q5-1 9 3" stroke="#fff" fill="none" strokeWidth="1"/></>:
 country==='PT'?<><path fill="#e5243b" d="M0 0h30v20H0z"/><path fill="#087a3e" d="M0 0h12v20H0z"/><circle cx="12" cy="10" r="4.5" fill="#ffcd00"/><path fill="#fff" stroke="#cb2030" strokeWidth="1.5" d="M9.5 7h5v4q-2.5 4-5 0z"/></>:
 country==='FR'?<><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#002395" d="M0 0h10v20H0z"/><path fill="#ed2939" d="M20 0h10v20H20z"/></>:
 <><path fill="#fff" d="M0 0h30v20H0z"/>{Array.from({length:7},(_,i)=><path key={i} fill="#b22234" d={`M0 ${i*40/13}h30v${20/13}H0z`}/>)}<path fill="#3c3b6e" d="M0 0h13v11H0z"/><text x="6.5" y="8" fill="white" fontSize="7" textAnchor="middle">★</text></>}
 </svg>;
}
function ThemeControl({value,onSave,onError,t}){
 const [choice,setChoice]=useState(value||'system');
 const latest=useRef(value||'system'),pending=useRef(0),queue=useRef(Promise.resolve()),gesture=useRef(null),swiped=useRef(false);
 const options=[['light','Claro'],['dark','Escuro'],['system','Auto']];
 useEffect(()=>{if(!pending.current){latest.current=value||'system';setChoice(latest.current)}},[value]);
 function choose(next){
  if(next===latest.current)return;
  const previous=latest.current;latest.current=next;setChoice(next);pending.current++;
  queue.current=queue.current.catch(()=>{}).then(()=>onSave({theme:next})).catch(error=>{
   if(latest.current===next){latest.current=previous;setChoice(previous)}
   onError(error?.message||t('Não foi possível salvar as preferências.'));
  }).finally(()=>{pending.current--});
 }
 return <div className="segment settings-theme-segment" role="group" aria-label={t('Tema')}
 onPointerDown={e=>{if(e.isPrimary){swiped.current=false;gesture.current={x:e.clientX,y:e.clientY}}}}
 onPointerCancel={()=>{gesture.current=null}}
 onPointerUp={e=>{const start=gesture.current;gesture.current=null;if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>25&&Math.abs(dx)>Math.abs(dy)){swiped.current=true;const index=options.findIndex(([id])=>id===latest.current);choose(options[Math.max(0,Math.min(2,index+(dx>0?1:-1)))][0])}}}
 onClickCapture={e=>{if(swiped.current){e.preventDefault();e.stopPropagation();swiped.current=false}}}>
 <span className="settings-theme-indicator" aria-hidden="true" style={{transform:`translateX(${Math.max(0,options.findIndex(([id])=>id===choice))*100}%)`}}/>
 {options.map(([id,label])=><button type="button" key={id} aria-pressed={choice===id} className={choice===id?'active':''} onClick={()=>choose(id)}>{t(label)}</button>)}
 </div>;
}

export function SettingsPage(){const {preferences:pref,savePreference,setToast,t}=useVano();return <main className="content-page settings-page"><header className="page-header settings-header"><Link className="circle-btn back-btn" to="/perfil" aria-label={t('Voltar')}><ArrowLeft size={20}/></Link><h1>{t("Configurações")}</h1></header><Section title={t("Privacidade e conta")}><div className="list-card"><OptionRow icon={UserRound} title={t("Minha conta")} to="/conta"/><OptionRow icon={LockKeyhole} title={t("Política de privacidade")} to="/privacidade"/></div></Section><Section title={t("Sua experiência")} className="settings-card"><div className="settings-line"><div><CarFront size={21}/><span><strong>{t("Veículo principal")}</strong><small>{t("Seu modo de transporte")}</small></span></div><div className="segment">{['carro','moto'].map(x=><button key={x} aria-pressed={pref.vehicle===x} className={pref.vehicle===x?'active':''} onClick={()=>savePreference({vehicle:x})}>{t(x==='carro'?'Carro':'Moto')}</button>)}</div></div><div className="settings-line"><div><Route size={21}/><span><strong>{t("Rota preferida")}</strong><small>{t("Seleção ao buscar destino")}</small></span></div><div className="segment">{[['safe','Segura'],['fast','Rápida']].map(([id,label])=><button aria-pressed={pref.preferredRoute===id} className={pref.preferredRoute===id?'active':''} key={id} onClick={()=>savePreference({preferredRoute:id})}>{t(label)}</button>)}</div></div><div className="settings-line"><div><Ticket size={21}/><span><strong>Preferência de pedágios</strong><small>Evitar quando houver outra rota viável</small></span></div><button className={`switch ${pref.avoidTolls?'on':''}`} role="switch" aria-label="Preferir rotas sem pedágios" aria-checked={Boolean(pref.avoidTolls)} onClick={()=>savePreference({avoidTolls:!pref.avoidTolls})}><span/></button></div><div className="settings-line"><div><Bell size={21}/><span><strong>{t("Alertas no app")}</strong><small>{t("Informações de ocorrências")}</small></span></div><button className={`switch ${pref.alerts?'on':''}`} aria-label="Ativar ou desativar alertas" role="switch" aria-checked={Boolean(pref.alerts)} onClick={()=>savePreference({alerts:!pref.alerts})}><span/></button></div><div className="settings-line settings-theme-line"><div><SunMoon size={21}/><span><strong>{t("Tema")}</strong><small>{t("Contraste da interface")}</small></span></div><ThemeControl value={pref.theme} onSave={savePreference} onError={setToast} t={t}/></div><div className="settings-line v27-settings-locale"><div><Globe2 size={21}/><span><strong>{t('Idioma')}</strong><small>{t('Interface')}</small></span></div><details className="settings-language" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus()}}}>
<summary aria-label={t('Idioma do aplicativo')}><span className="settings-locale-name"><LocaleFlag code={pref.language||'pt-BR'}/><span>{SETTINGS_LOCALES[pref.language||'pt-BR']?.name||'Português'}</span></span><span className="settings-language-chevron" aria-hidden="true">⌄</span></summary>
<div className="settings-language-options" role="radiogroup" aria-label={t('Idioma do aplicativo')}>{LANGUAGES.map(l=><label key={l.code} aria-label={l.native} className={l.code===(pref.language||'pt-BR')?'is-selected':''}><input type="radio" name="settings-language" value={l.code} checked={l.code===(pref.language||'pt-BR')} onChange={e=>{const menu=e.currentTarget.closest('details');menu.open=false;menu.querySelector('summary')?.focus();savePreference({language:l.code})}}/><span className="settings-locale-name" lang={l.code}><LocaleFlag code={l.code}/><span>{SETTINGS_LOCALES[l.code]?.name||l.native}</span></span><CheckCircle2 size={17} aria-hidden="true"/></label>)}</div>
</details></div></Section><Section title={t("Suporte e informações")}><div className="list-card"><OptionRow icon={CircleHelp} title={t("Central de ajuda")} to="/ajuda"/><OptionRow icon={FileText} title={t("Termos de uso")} to="/termos"/><OptionRow icon={ShieldCheck} title={t("Segurança na navegação")} to="/seguranca-na-navegacao"/><OptionRow icon={Info} title={t("Sobre o Vano")} to="/sobre"/></div></Section></main>}
export function AccountPage(){
 const {user,googleReady,refresh,setToast}=useVano(),nav=useNavigate();
 const [name,setName]=useState(user?.name||'');
 const [busy,setBusy]=useState(false),[deleteOpen,setDeleteOpen]=useState(false),[password,setPassword]=useState(''),[error,setError]=useState('');
 useEffect(()=>setName(user?.name||''),[user?.name]);
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await patch('/profile',{name});await refresh();setToast('Perfil atualizado');}catch(ex){setError(ex.message)}finally{setBusy(false)}}
 async function exportData(){setBusy(true);setError('');try{
  const data=await api('/profile/export');
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='vano-meus-dados.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setToast('Seus dados foram exportados. Guarde o arquivo em local privado.');
 }catch(ex){setError(ex.message)}finally{setBusy(false)}}
 async function drop(e){e.preventDefault();setBusy(true);setError('');try{await remove('/profile',{password});setPassword('');setDeleteOpen(false);await refresh();setToast('Conta excluída');nav('/inicio');}catch(ex){setError(ex.message)}finally{setBusy(false)}}
 const initials=(user?.name||'V').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 const googleStatus=new URLSearchParams(window.location.search).get('google');
 return <main className="content-page v92-account">
   <nav className="v92-account-crumb" aria-label="Voltar ao perfil"><Link to="/perfil"><ArrowLeft size={16}/> Meu perfil</Link><span>/</span><span>Dados da conta</span></nav>
   <header className="v92-account-hero"><div className="v92-account-avatar" aria-hidden="true">{initials}</div><div><span className="v92-account-eyebrow"><ShieldCheck size={15}/> SEU ESPAÇO, SEUS DADOS</span><h1>Dados da conta</h1><p>Seu perfil no VANO. Simples de editar, fácil de controlar.</p></div></header>
   {user?<div className="v92-account-grid">
    <div className="v92-account-main">
     <form className="v92-account-panel v92-account-edit" onSubmit={save}><div className="v92-account-heading"><span className="v92-account-icon"><UserRound size={20}/></span><div><h2>Informações pessoais</h2><p>Como você aparece no VANO.</p></div></div>
      <label htmlFor="vano-account-name">Nome completo<input id="vano-account-name" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label htmlFor="vano-account-email">E-mail cadastrado<input id="vano-account-email" value={user.email} readOnly autoComplete="email" aria-describedby="vano-email-note"/></label>
      <p id="vano-email-note" className="v92-field-hint"><Shield size={15}/> Seu e-mail não pode ser alterado nesta versão.</p>
      {error&&!deleteOpen&&<p className="v92-account-error" role="alert">{error}</p>}
      <button className="v92-account-submit" disabled={busy||name.trim()===user.name}><Save size={17}/>{busy?'Salvando…':'Salvar alterações'}</button>
     </form>
     <section className="v92-account-panel"><div className="v92-account-heading"><span className="v92-account-icon"><LockKeyhole size={20}/></span><div><h2>Acesso seguro</h2><p>Gerencie como você entra na sua conta.</p></div></div>
      <div className="v92-google-row"><div><strong>{user.googleLinked?'Google conectado':'Entrar com Google'}</strong><small>{user.googleLinked?'Seu acesso pelo Google está disponível.':'Vincule sua conta usando o mesmo e-mail.'}</small></div>{user.googleLinked?<span className="v92-connected"><CheckCircle2 size={16}/> Conectado</span>:googleReady?<a className="v92-account-secondary" href="/api/auth/google/start?link=1">Conectar <ExternalLink size={15}/></a>:<span className="v92-muted">Indisponível</span>}</div>
      {googleStatus==='vinculado'&&<p role="status" className="v92-field-hint">Conta Google conectada.</p>}{googleStatus==='email-divergente'&&<p role="alert" className="v92-account-error">Escolha o mesmo e-mail cadastrado no VANO.</p>}
     </section>
    </div>
    <aside className="v92-account-side">
     <section className="v92-account-panel"><div className="v92-account-heading"><span className="v92-account-icon"><ShieldCheck size={20}/></span><div><h2>Você no controle</h2><p>Privacidade sem complicação.</p></div></div>
       <p className="v92-account-side-copy">Suas configurações podem ser alteradas e os dados da sua conta podem ser exportados quando quiser.</p>
       <button type="button" className="v92-account-secondary v92-account-full" disabled={busy} onClick={exportData}><Download size={18}/> Baixar meus dados <ArrowRight size={15}/></button>
       <Link className="v92-account-secondary v92-account-full" to="/privacidade"><LockKeyhole size={18}/> Política de privacidade <ArrowRight size={15}/></Link>
     </section>
     <section className="v92-account-panel v92-account-danger"><div className="v92-account-heading"><span className="v92-account-icon"><Trash2 size={20}/></span><div><h2>Excluir minha conta</h2><p>Controle do acesso e dos seus dados</p></div></div><p>Se não quiser mais usar o VANO, você pode solicitar a exclusão permanente.</p><button type="button" onClick={()=>{setDeleteOpen(true);setError('');}}>Solicitar exclusão <ArrowRight size={15}/></button></section>
    </aside>
   </div>:<div className="v92-account-panel v92-account-guest"><p>Você está usando o VANO como visitante.</p><CTA to="/entrar">Entrar ou criar conta</CTA></div>}
   {user&&deleteOpen&&<form className="v92-account-panel v92-delete-confirm" onSubmit={drop} aria-label="Confirmar exclusão de conta">
    <h2>Confirmar exclusão permanente</h2><p>Essa ação apaga a conta, lugares salvos e histórico do servidor.</p>
    {user.googleLinked&&<><p>Você também pode confirmar pelo Google usando sua conta vinculada.</p><a className="v92-account-secondary" href="/api/auth/google/start?delete=1">Verificar com Google <ExternalLink size={15}/></a><p>Ou use sua senha VANO:</p></>}
    <label>Senha atual<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {error&&<p role="alert" className="v92-account-error">{error}</p>}
    {googleStatus==='exclusao-invalida'&&<p role="alert" className="v92-account-error">A conta Google selecionada não corresponde à conta atual.</p>}
    <div className="v92-confirm-actions"><button type="button" onClick={()=>{setDeleteOpen(false);setPassword('');setError('');}}>Cancelar</button><button type="submit" disabled={busy}>Excluir com senha</button></div>
   </form>}
  </main>;
}
