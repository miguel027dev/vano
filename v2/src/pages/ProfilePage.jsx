import React,{useEffect,useState} from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { UserRound,Settings2,Navigation,MapPin,Clock3,LogOut,ArrowUpRight,Route,LockKeyhole,CircleHelp,CarFront,Bike,Mail,SlidersHorizontal,ArrowRight,ShieldCheck,Plus,Compass,ChevronRight,History,Check } from 'lucide-react';
import { useVano } from '../context';
import { Brand } from '../components/Brand';
import { BottomNav } from '../components/Navigation';
import { fmtKm,fmtTime,timeAgo,api } from '../lib/api';

function Action({icon:Icon, title,subtitle,to,value}){
  const {t}=useVano();
  return <Link className="v4-action-row" to={to}>
    <span className="v4-action-icon"><Icon size={20} strokeWidth={1.9}/></span>
    <span className="v4-action-copy"><strong>{t(title)}</strong>{subtitle&&<small>{t(subtitle)}</small>}</span>
    {value&&<span className="v4-action-value">{value}</span>}
    <ChevronRight size={18} className="v4-row-chevron"/>
  </Link>;
}

export default function ProfilePage(){
  const {user,history=[],favorites=[],preferences={},logout,t,language}=useVano();
  const navigate=useNavigate();
  const [health,setHealth]=useState(null);
  useEffect(()=>{api('/health').then(setHealth).catch(()=>setHealth(null));},[]);
  const trips=history.length;
  const kilometers=history.reduce((total,record)=>total+Number(record.distance||0),0);
  const initials=(user?.name||'V').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const firstName=user?.name?.trim()?.split(/\s+/)[0]||'Visitante';
  const isMoto=preferences.vehicle==='moto';
  const routeLabel=t(preferences.preferredRoute==='fast'?'Mais rápida':'Mais segura');
  const recent=history.slice(0,2);
  async function signOut(){try{await logout();navigate('/inicio');}catch{}}
  return <main className="content-page v4-profile">
    <header className="v4-profile-top">
      <Brand small to="/mapa"/>
      <div className="v4-profile-header-right"><span>{t('MEU ESPAÇO')}</span><Link to="/configuracoes" className="v4-icon-button" aria-label="Abrir configurações"><Settings2 size={20}/></Link></div>
    </header>
    <section className="v4-profile-intro">
      <div className="v4-identity-avatar" aria-hidden="true">{initials}</div>
      <div className="v4-intro-name"><span className="v4-overline">{t(user?'SUA CONTA VANO':'MODO VISITANTE')}</span><h1>{user?t('Olá, {name}.',{name:firstName}):t('Seu espaço VANO.')}</h1><p>{user?.email||t('Salve seus destinos e deixe tudo do seu jeito.')}</p></div>
      {user&&<Link className="v4-edit-link" to="/conta" aria-label="Editar seu perfil"><ArrowUpRight size={20}/></Link>}
    </section>
    <section className="v4-stat-strip" aria-label="Resumo do histórico de trajetos">
      <div><span>{t('ROTAS INICIADAS')}</span><strong>{trips.toLocaleString(language)}</strong><small>{t('neste dispositivo')}</small></div>
      <div><span>{t('DISTÂNCIA ESTIMADA')}</span><strong>{fmtKm(kilometers,language)}</strong><small>{t('rotas planejadas')}</small></div>
      <div><span>{t('LUGARES SALVOS')}</span><strong>{favorites.length}</strong><small>{t('seus atalhos')}</small></div>
    </section>
    {!user&&<section className="v4-signup-note"><span className="v4-note-mark"><UserRound size={24}/></span><div><strong>{t('Seu caminho merece um lugar.')}</strong><p>{t('Crie sua conta para guardar suas preferências.')}</p></div><Link to="/cadastro">{t('Criar conta')} <ArrowRight size={17}/></Link></section>}
    <section className="v4-route-feature">
      <div className="v4-route-feature-text"><span className="v4-overline"><span className="v4-small-dot"/> {t('PERSONALIZAÇÃO')}</span><h2>{t('Seu jeito')}<br/>{t('de navegar.')}</h2><p>{t(isMoto?'Moto':'Carro')} · {routeLabel}</p><Link to="/personalizar" className="v4-feature-link">{t('Ajustar preferências')} <ArrowRight size={17}/></Link></div>
      <div className="v4-route-feature-image"><img src={isMoto?'/vehicle-moto.webp':'/vehicle-car-cutout.png'} alt={isMoto?'Motocicleta selecionada':'Carro selecionado'} loading="lazy"/></div>
      <img className="v4-route-feature-art" src="/vano-trip-line.svg" alt="" aria-hidden="true"/>
    </section>
    <section className="v4-profile-section">
      <div className="v4-profile-section-heading"><div><span className="v4-overline">{t('ATALHOS')}</span><h2>{t('Para onde vamos?')}</h2></div><Link to="/favoritos">{t('Ver todos')} <ArrowUpRight size={17}/></Link></div>
      {favorites.length?<div className="v4-place-shortcuts">{favorites.slice(0,3).map(place=><Link to={`/mapa?destination=${encodeURIComponent(place.id)}`} key={place.id} className="v4-place-chip"><MapPin size={18}/>{place.name}</Link>)}<Link to="/favoritos" className="v4-place-chip v4-add-place"><Plus size={18}/>Adicionar</Link></div>:<Link className="v4-empty-link" to="/favoritos"><span><MapPin size={19}/></span><div><strong>{t('Adicione um lugar frequente')}</strong><small>{t('Casa, trabalho e seus destinos favoritos')}</small></div><ArrowRight size={18}/></Link>}
    </section>
    <div className="v4-profile-columns">
      <section className="v4-profile-section"><div className="v4-profile-section-heading"><div><span className="v4-overline">{t('PREFERÊNCIAS')}</span><h2>{t('Sua experiência')}</h2></div></div><div className="v4-action-list"><Action icon={UserRound} title="Dados da conta" subtitle="Nome e informações" to="/conta"/><Action icon={SlidersHorizontal} title="Configurações" subtitle="Rotas, tema e notificações" to="/configuracoes"/><Action icon={ShieldCheck} title="Segurança e privacidade" subtitle="Controle dos seus dados" to="/privacidade"/></div></section>
      <section className="v4-profile-section"><div className="v4-profile-section-heading"><div><span className="v4-overline">{t('HISTÓRICO')}</span><h2>{t('Seus trajetos')}</h2></div><Link to="/rotas">{t('Ver todos')} <ArrowUpRight size={17}/></Link></div>{recent.length?<div className="v4-recent-list">{recent.map(item=><div className="v4-recent-trip" key={item.id}><span className="v4-recent-icon"><Navigation size={18}/></span><div><strong>{item.destination?.name||t('Destino')}</strong><small>{timeAgo(item.createdAt,language)} · {fmtTime(item.duration)} · {fmtKm(item.distance,language)}</small></div></div>)}</div>:<Link className="v4-empty-link" to="/mapa"><span><Route size={19}/></span><div><strong>{t('Seu primeiro trajeto começa aqui')}</strong><small>{t('Escolha um destino no mapa')}</small></div><ArrowRight size={18}/></Link>}</section>
    </div>
    <section className="v4-profile-bottom"><Link to="/ajuda"><CircleHelp size={18}/> {t('Ajuda e suporte')} <ChevronRight size={17}/></Link><span className="v4-backend-caption"><span className={health?.v1BridgeConfigured?'is-linked':''}/> {health?.v1BridgeConfigured?'Motor VANO V1 configurado':'Motor V1 não conectado; rotas convencionais'}</span></section>
    {user&&<button type="button" className="v4-signout" onClick={signOut}><LogOut size={17}/> {t('Sair da conta')}</button>}
    <BottomNav/>
  </main>;
}
