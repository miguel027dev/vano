import React, {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bell, Bookmark, CarFront, Check,
  CheckCircle2, ChevronRight, CircleHelp, Download, ExternalLink, Globe2,
  History, LockKeyhole, LogOut, MapPin, Moon, Navigation, Palette, Route,
  Save, Settings2, ShieldCheck, SlidersHorizontal, Sun, Ticket, Trash2,
  UserRound, Zap
} from 'lucide-react';
import {useVano} from '../context';
import {BottomNav} from '../components/Navigation';
import {Brand} from '../components/Brand';
import {api, patch, timeAgo} from '../lib/api';
import {LANGUAGES} from '../lib/i18n';
import {measuredKilometers} from '../lib/travelDistance';
import {fmtKm} from '../lib/api';
import './profile-preview.css';

const PREVIEW_ROOT='/v2/perfil-preview';
const PREVIEW_ACCOUNT='/v2/conta-preview';
const PREVIEW_SETTINGS='/v2/configuracoes-preview';
const tabs=[
  {key:'profile',label:'Perfil',hint:'Visão geral',path:PREVIEW_ROOT,icon:UserRound},
  {key:'account',label:'Dados da conta',hint:'Cadastro e acesso',path:PREVIEW_ACCOUNT,icon:ShieldCheck},
  {key:'settings',label:'Configurações',hint:'Suas preferências',path:PREVIEW_SETTINGS,icon:SlidersHorizontal}
];

function Initials({name,large=false}){
  const text=(name||'VANO').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  return <span className={'pv2-avatar'+(large?' pv2-avatar-large':'')} aria-hidden="true">{text}</span>;
}
function PreviewShell({section,title,subtitle,children}){
  const {user}=useVano();
  return <main className="pv2-page" id="conteudo-principal">
    <div className="pv2-wrap">
      <header className="pv2-global-top">
        <Link to="/mapa" className="pv2-back"><ArrowLeft size={17}/> Voltar ao mapa</Link>
        <Brand small to="/mapa"/>
        <span className="pv2-preview-mark"><span className="pv2-preview-dot"/> PRÉVIA V2</span>
      </header>
      <div className="pv2-heading">
        <div><span className="pv2-eyebrow">SEU ESPAÇO VANO</span><h1>{title}</h1><p>{subtitle}</p></div>
        {user&&<div className="pv2-account-pill"><Initials name={user.name}/><span>{user.name?.split(' ')[0]||'Sua conta'}</span></div>}
      </div>
      <nav className="pv2-tabs" aria-label="Áreas da prévia">
        {tabs.map(item=><Link key={item.key} to={item.path} className={'pv2-tab'+(item.key===section?' is-current':'')} aria-current={item.key===section?'page':undefined}>
          <item.icon size={19} strokeWidth={2}/>
          <span><b>{item.label}</b><small>{item.hint}</small></span>
        </Link>)}
      </nav>
      {children}
      <footer className="pv2-preview-footer">
        <span><ShieldCheck size={16}/> Ambiente de prévia da interface. As telas atuais continuam disponíveis.</span>
        <Link to="/mapa">Ir para o mapa <ArrowUpRight size={15}/></Link>
      </footer>
    </div>
    <BottomNav/>
  </main>;
}
function Panel({eyebrow,title,description,action,children,className=''}) {
  return <section className={'pv2-panel '+className}>
    <header className="pv2-panel-head">
      <div><span className="pv2-eyebrow">{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}
    </header>
    {children}
  </section>;
}
function ItemLink({to,icon:Icon,title,desc,danger=false}){
  return <Link to={to} className={'pv2-item-link'+(danger?' is-danger':'')}>
    <span className="pv2-item-icon"><Icon size={20}/></span>
    <span className="pv2-item-info"><b>{title}</b><small>{desc}</small></span>
    <ChevronRight size={18} className="pv2-chevron"/>
  </Link>;
}
function ProfileView(){
  const {user,history=[],favorites=[],preferences={},logout,setToast,language}=useVano();
  const navigate=useNavigate();
  const stats=useMemo(()=>{
    const distance=history.reduce((sum,record)=>sum+measuredKilometers(record),0);
    return [
      {name:'Rotas iniciadas',value:history.length.toLocaleString(language||'pt-BR'),hint:'no seu histórico',icon:Route},
      {name:'Distância registrada',value:fmtKm(distance,language),hint:'nos trajetos',icon:Navigation},
      {name:'Lugares salvos',value:String(favorites.length),hint:'seus atalhos',icon:Bookmark}
    ];
  },[history,favorites,language]);
  const [signingOut,setSigningOut]=useState(false);
  async function signOut(){
    if(signingOut)return;
    setSigningOut(true);
    try{await logout();navigate('/inicio');}
    catch(e){setToast(e?.message||'Não foi possível sair da conta.');setSigningOut(false);}
  }
  const firstName=(user?.name||'Usuário').trim().split(/\s+/)[0];
  return <PreviewShell section="profile" title="Meu perfil" subtitle="Tudo o que importa sobre você e suas viagens, em um só lugar.">
    <section className="pv2-hero">
      <div className="pv2-hero-content">
        <span className="pv2-eyebrow">BEM-VINDO DE VOLTA</span>
        <div className="pv2-hero-identity"><Initials name={user?.name} large/><div><h2>Olá, {firstName}.</h2><p>{user?.email||'Sua conta VANO'}</p></div></div>
        <p className="pv2-hero-caption">Sua experiência de navegação, organizada do seu jeito.</p>
        <Link to={PREVIEW_ACCOUNT} className="pv2-primary-action">Ver dados da conta <ArrowUpRight size={18}/></Link>
      </div>
      <div className="pv2-hero-art" aria-hidden="true"><div className="pv2-art-circle"/><Navigation size={86} strokeWidth={1.1}/><div className="pv2-art-route"/></div>
    </section>
    <div className="pv2-stats" aria-label="Resumo de atividade">
      {stats.map(s=><div className="pv2-stat" key={s.name}><span className="pv2-stat-icon"><s.icon size={19}/></span><span className="pv2-stat-name">{s.name}</span><strong>{s.value}</strong><small>{s.hint}</small></div>)}
    </div>
    <div className="pv2-columns">
      <Panel eyebrow="ACESSO RÁPIDO" title="Seu VANO, organizado" description="Ajuste seus dados e preferências sem procurar por menus." className="pv2-col-primary">
        <div className="pv2-link-list">
          <ItemLink to={PREVIEW_ACCOUNT} icon={UserRound} title="Dados da conta" desc="Nome, e-mail e segurança"/>
          <ItemLink to={PREVIEW_SETTINGS} icon={Settings2} title="Configurações" desc="Rota, aparência, alertas e idioma"/>
          <ItemLink to="/favoritos" icon={MapPin} title="Lugares salvos" desc="Acesse seus destinos preferidos"/>
          <ItemLink to="/ajuda" icon={CircleHelp} title="Ajuda e suporte" desc="Dúvidas e atendimento"/>
        </div>
      </Panel>
      <Panel eyebrow="SEU TRAJETO" title="Sua navegação" description="Um resumo das suas escolhas atuais." className="pv2-col-secondary">
        <div className="pv2-prefs-summary">
          <div><span className="pv2-summary-icon"><CarFront size={18}/></span><span>Veículo</span><b>{preferences.vehicle==='moto'?'Moto':'Carro'}</b></div>
          <div><span className="pv2-summary-icon"><Zap size={18}/></span><span>Preferência</span><b>{preferences.preferredRoute==='fast'?'Mais rápida':'Mais segura'}</b></div>
          <div><span className="pv2-summary-icon"><Ticket size={18}/></span><span>Pedágios</span><b>{preferences.avoidTolls?'Evitar quando possível':'Permitidos'}</b></div>
        </div>
        <Link className="pv2-secondary-action" to={PREVIEW_SETTINGS}>Personalizar navegação <ArrowRight size={17}/></Link>
      </Panel>
    </div>
    <Panel eyebrow="SUA CONTA" title="Acesso e privacidade">
      <div className="pv2-quiet-actions">
        <Link to="/privacidade"><LockKeyhole size={17}/> Privacidade <ChevronRight size={16}/></Link>
        <button type="button" onClick={signOut} disabled={signingOut}><LogOut size={17}/> {signingOut?'Saindo…':'Sair da conta'} <ChevronRight size={16}/></button>
      </div>
    </Panel>
  </PreviewShell>;
}

function AccountView(){
  const {user,googleReady,refresh,setToast}=useVano();
  const [name,setName]=useState(user?.name||'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [advancedOpen,setAdvancedOpen]=useState(false);
  useEffect(()=>setName(user?.name||''),[user?.name]);
  const cleaned=name.trim();
  const dirty=cleaned!==(user?.name||'');
  const valid=cleaned.length>=2&&cleaned.length<=80;
  async function save(e){
    e.preventDefault();if(!valid||!dirty||busy)return;
    setBusy(true);setError('');setSuccess('');
    try{await patch('/profile',{name:cleaned});await refresh();setSuccess('Nome atualizado com sucesso.');setToast('Dados atualizados.');}
    catch(e){setError(e?.message||'Não foi possível salvar.');}
    finally{setBusy(false);}
  }
  async function exportData(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const data=await api('/profile/export');
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='vano-meus-dados.json';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setToast('Dados exportados. Guarde o arquivo em local privado.');
    }catch(e){setError(e?.message||'Não foi possível exportar os dados.');}
    finally{setBusy(false);}
  }
  return <PreviewShell section="account" title="Dados da conta" subtitle="Suas informações pessoais e opções de acesso, sem complicação.">
    <div className="pv2-columns pv2-account-columns">
      <div className="pv2-stack">
        <Panel eyebrow="INFORMAÇÕES PESSOAIS" title="Seu cadastro" description="Mantenha seu nome atualizado.">
          <form className="pv2-account-form" onSubmit={save}>
            <label htmlFor="pv2-name">Nome completo</label>
            <div className="pv2-input-wrap"><UserRound size={19}/><input id="pv2-name" type="text" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e=>{setName(e.target.value);setSuccess('');}}/></div>
            <label htmlFor="pv2-email">E-mail cadastrado</label>
            <div className="pv2-input-wrap is-readonly"><Bell size={19}/><input id="pv2-email" type="email" value={user?.email||''} readOnly autoComplete="email" aria-describedby="pv2-email-desc"/></div>
            <p className="pv2-form-note" id="pv2-email-desc"><LockKeyhole size={15}/> Seu e-mail permanece protegido e não pode ser alterado nesta versão.</p>
            {error&&<p className="pv2-message is-error" role="alert">{error}</p>}
            {success&&<p className="pv2-message is-success" role="status"><CheckCircle2 size={17}/>{success}</p>}
            <button className="pv2-primary-action pv2-submit" type="submit" disabled={!dirty||!valid||busy}>
              <Save size={17}/>{busy?'Salvando…':'Salvar alterações'}
            </button>
          </form>
        </Panel>
        <Panel eyebrow="LOGIN" title="Segurança da conta" description="Confira os métodos usados para acessar o VANO.">
          <div className="pv2-connection">
            <span className="pv2-item-icon"><ShieldCheck size={19}/></span>
            <div><b>Entrar com Google</b><small>{user?.googleLinked?'Sua conta Google está vinculada.':'Conecte usando o mesmo e-mail do cadastro.'}</small></div>
            {user?.googleLinked?<span className="pv2-status"><Check size={15}/> Conectado</span>:
              googleReady?<a href="/api/auth/google/start?link=1" className="pv2-small-button">Conectar <ExternalLink size={14}/></a>:
              <span className="pv2-status is-muted">Indisponível</span>}
          </div>
        </Panel>
      </div>
      <div className="pv2-stack">
        <Panel eyebrow="PRIVACIDADE" title="Você no controle" description="Gerencie seus dados com transparência.">
          <p className="pv2-body-copy">Você pode baixar uma cópia das informações vinculadas à sua conta. Mantenha esse arquivo em um lugar privado.</p>
          <button type="button" className="pv2-secondary-action pv2-full-action" disabled={busy} onClick={exportData}><Download size={18}/> Baixar meus dados <ArrowRight size={17}/></button>
          <Link to="/privacidade" className="pv2-secondary-action pv2-full-action"><LockKeyhole size={18}/> Política de privacidade <ArrowRight size={17}/></Link>
        </Panel>
        <Panel eyebrow="OPÇÕES ADICIONAIS" title="Gerenciar conta">
          <button type="button" aria-expanded={advancedOpen} className="pv2-expand-trigger" onClick={()=>setAdvancedOpen(v=>!v)}>
            <span><Trash2 size={18}/> Exclusão de conta</span><ChevronRight size={18} className={advancedOpen?'is-open':''}/>
          </button>
          {advancedOpen&&<div className="pv2-advanced-content"><p>Esta é uma ação permanente. Para sua segurança, a confirmação permanece na página atual da conta.</p><Link to="/conta" className="pv2-secondary-action">Abrir gerenciamento de conta <ArrowUpRight size={16}/></Link></div>}
        </Panel>
      </div>
    </div>
  </PreviewShell>;
}
function SettingChoice({label,description,icon:Icon,options,value,onChoose,disabled=false}){
  return <div className="pv2-setting-line">
    <span className="pv2-item-icon"><Icon size={20}/></span>
    <div className="pv2-setting-copy"><b>{label}</b><small>{description}</small></div>
    <div className="pv2-segment" role="group" aria-label={label}>
      {options.map(option=><button key={option.value} type="button" disabled={disabled} className={value===option.value?'is-selected':''} aria-pressed={value===option.value} onClick={()=>onChoose(option.value)}>{option.label}</button>)}
    </div>
  </div>;
}
function SettingToggle({label,description,icon:Icon,checked,onChange,disabled=false}){
  return <div className="pv2-setting-line">
    <span className="pv2-item-icon"><Icon size={20}/></span>
    <div className="pv2-setting-copy"><b>{label}</b><small>{description}</small></div>
    <button type="button" className={'pv2-switch'+(checked?' is-on':'')} role="switch" aria-label={label} aria-checked={!!checked} disabled={disabled} onClick={()=>onChange(!checked)}><span/></button>
  </div>;
}
function SettingsView(){
  const {user,preferences:pref={},savePreference,setToast}=useVano();
  const [busyKey,setBusyKey]=useState('');
  const [error,setError]=useState('');
  async function change(key,value){
    if(busyKey||pref[key]===value)return;
    setBusyKey(key);setError('');
    try{await savePreference({[key]:value});}
    catch(e){const message=e?.message||'Não foi possível salvar esta preferência.';setError(message);setToast(message);}
    finally{setBusyKey('');}
  }
  return <PreviewShell section="settings" title="Configurações" subtitle="Ajuste sua experiência para navegar do seu jeito.">
    <div className="pv2-stack pv2-settings-stack">
      <Panel eyebrow="NAVEGAÇÃO" title="Seu jeito de ir" description="Essas preferências são usadas ao procurar uma rota.">
        <div className="pv2-setting-list">
          <SettingChoice icon={CarFront} label="Veículo principal" description="Como você costuma se deslocar" options={[{value:'carro',label:'Carro'},{value:'moto',label:'Moto'}]} value={pref.vehicle||'carro'} disabled={Boolean(busyKey)} onChoose={value=>change('vehicle',value)}/>
          <SettingChoice icon={Route} label="Rota preferida" description="Prioridade durante o planejamento" options={[{value:'safe',label:'Segura'},{value:'fast',label:'Rápida'}]} value={pref.preferredRoute||'safe'} disabled={Boolean(busyKey)} onChoose={value=>change('preferredRoute',value)}/>
          <SettingToggle icon={Ticket} label="Evitar pedágios" description="Quando houver alternativa viável" checked={pref.avoidTolls} disabled={Boolean(busyKey)} onChange={value=>change('avoidTolls',value)}/>
        </div>
      </Panel>
      <Panel eyebrow="APARÊNCIA" title="Interface e idioma" description="Defina como o VANO aparece neste aparelho.">
        <div className="pv2-setting-list">
          <SettingChoice icon={Palette} label="Tema" description="Escolha o contraste da interface" options={[{value:'light',label:'Claro'},{value:'dark',label:'Escuro'},{value:'system',label:'Auto'}]} value={pref.theme||'light'} disabled={Boolean(busyKey)} onChoose={value=>change('theme',value)}/>
          <div className="pv2-setting-line">
            <span className="pv2-item-icon"><Globe2 size={20}/></span>
            <div className="pv2-setting-copy"><b>Idioma</b><small>Idioma dos textos do aplicativo</small></div>
            <label className="pv2-language"><span className="pv2-sr-only">Idioma do aplicativo</span><select value={pref.language||'pt-BR'} disabled={Boolean(busyKey)} onChange={e=>change('language',e.target.value)}>{LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.native}</option>)}</select></label>
          </div>
        </div>
      </Panel>
      <Panel eyebrow="AVISOS" title="Alertas e notificações" description="Controle os avisos mostrados pelo VANO.">
        <div className="pv2-setting-list"><SettingToggle icon={Bell} label="Alertas no aplicativo" description="Informações de ocorrências durante o uso" checked={pref.alerts} disabled={Boolean(busyKey)} onChange={value=>change('alerts',value)}/></div>
      </Panel>
      {error&&<p className="pv2-message is-error" role="alert">{error}</p>}
      <div className="pv2-settings-note"><ShieldCheck size={18}/><p>{user?'Alterações são salvas automaticamente na sua conta.':'Como visitante, suas preferências ficam ligadas à sessão deste navegador.'} GPS, mapas e rotas dependem das permissões e da conexão disponíveis.</p></div>
      <div className="pv2-settings-links">
        <ItemLink to={PREVIEW_ACCOUNT} icon={UserRound} title="Dados da conta" desc="Cadastro, acesso e privacidade"/>
        <ItemLink to="/ajuda" icon={CircleHelp} title="Central de ajuda" desc="Respostas para as principais dúvidas"/>
      </div>
    </div>
  </PreviewShell>;
}
export default function ProfilePreviewPage({section='profile'}){
  if(section==='account')return <AccountView/>;
  if(section==='settings')return <SettingsView/>;
  return <ProfileView/>;
}
