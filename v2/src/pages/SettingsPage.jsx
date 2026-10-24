import React,{useEffect,useState} from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { CarFront,ShieldCheck, Bell, Moon, Globe2, Map, LockKeyhole, CircleHelp,FileText,UserRound, Mail, Trash2, Settings2, AlertTriangle,MessageSquareText,Info,KeyRound,ArrowLeft,ArrowRight,CheckCircle2,ExternalLink,Download,Save,Shield } from 'lucide-react';
import { useVano } from '../context';
import { api,patch,remove } from '../lib/api';
import { PageHeader,Section,OptionRow,Notice,CTA } from '../components/Ui';
import {LANGUAGES} from '../lib/i18n';
export function SettingsPage(){const {preferences:pref,savePreference,t}=useVano();return <main className="content-page"><PageHeader title={t("Configurações")} subtitle={t("Ajuste a navegação para o seu jeito.")}/><Section title={t("Sua experiência")} className="settings-card"><div className="settings-line"><div><CarFront size={21}/><span><strong>{t("Veículo principal")}</strong><small>{t("Seu modo de transporte")}</small></span></div><div className="segment">{['carro','moto'].map(x=><button key={x} className={pref.vehicle===x?'active':''} onClick={()=>savePreference({vehicle:x})}>{t(x==='carro'?'Carro':'Moto')}</button>)}</div></div><div className="settings-line"><div><ShieldCheck size={21}/><span><strong>{t("Rota preferida")}</strong><small>{t("Seleção ao buscar destino")}</small></span></div><div className="segment">{[['safe','Segura'],['fast','Rápida']].map(([id,label])=><button className={pref.preferredRoute===id?'active':''} key={id} onClick={()=>savePreference({preferredRoute:id})}>{t(label)}</button>)}</div></div><div className="settings-line"><div><ShieldCheck size={21}/><span><strong>Preferência de pedágios</strong><small>Evitar quando houver outra rota viável</small></span></div><button className={`switch ${pref.avoidTolls?'on':''}`} role="switch" aria-label="Preferir rotas sem pedágios" aria-checked={Boolean(pref.avoidTolls)} onClick={()=>savePreference({avoidTolls:!pref.avoidTolls})}><span/></button></div><div className="settings-line"><div><Bell size={21}/><span><strong>{t("Alertas no app")}</strong><small>{t("Informações de ocorrências")}</small></span></div><button className={`switch ${pref.alerts?'on':''}`} aria-label="Ativar ou desativar alertas" role="switch" aria-checked={Boolean(pref.alerts)} onClick={()=>savePreference({alerts:!pref.alerts})}><span/></button></div><div className="settings-line"><div><Moon size={21}/><span><strong>{t("Tema")}</strong><small>{t("Contraste da interface")}</small></span></div><div className="segment">{[['light','Claro'],['dark','Escuro'],['system','Auto']].map(([id,label])=><button className={pref.theme===id?'active':''} key={id} onClick={()=>savePreference({theme:id})}>{t(label)}</button>)}</div></div><div className="settings-line v27-settings-locale"><div><Globe2 size={21}/><span><strong>{t('Idioma')}</strong><small>{t('Interface')}</small></span></div><label className="v27-language-select v27-settings-select"><span className="sr-only">{t('Idioma do aplicativo')}</span><select value={pref.language||'pt-BR'} onChange={e=>savePreference({language:e.target.value})}>{LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.native}</option>)}</select><span aria-hidden="true">⌄</span></label></div></Section><Section title={t("Privacidade e conta")}><div className="list-card"><OptionRow icon={UserRound} title={t("Minha conta")} to="/conta"/><OptionRow icon={LockKeyhole} title={t("Política de privacidade")} to="/privacidade"/></div></Section><Section title={t("Suporte e informações")}><div className="list-card"><OptionRow icon={CircleHelp} title={t("Central de ajuda")} to="/ajuda"/><OptionRow icon={FileText} title={t("Termos de uso")} to="/termos"/><OptionRow icon={ShieldCheck} title={t("Segurança na navegação")} to="/seguranca-na-navegacao"/><OptionRow icon={Info} title={t("Sobre o Vano")} to="/sobre"/></div></Section><Notice>Versão local: configurações são armazenadas neste computador. Dados externos dependem da integração do Mapbox e da conexão de rede.</Notice></main>}
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
       <Link className="v92-account-secondary v92-account-full" to="/privacidade"><LockKeyhole size={18}/> Segurança e privacidade <ArrowRight size={15}/></Link>
     </section>
     <section className="v92-account-panel v92-account-danger"><h2>Excluir minha conta</h2><p>Se não quiser mais usar o VANO, você pode solicitar a exclusão permanente.</p><button type="button" onClick={()=>{setDeleteOpen(true);setError('');}}>Solicitar exclusão <ArrowRight size={15}/></button></section>
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
