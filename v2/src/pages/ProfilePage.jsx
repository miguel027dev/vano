import React from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { UserRound,Settings2,Navigation,MapPin,LogOut,ArrowUpRight,Route,ArrowRight,Plus } from 'lucide-react';
import { useVano } from '../context';
import { Brand } from '../components/Brand';
import { BottomNav } from '../components/Navigation';
import {groupedHistory,historyDistanceLabel} from '../lib/historyPresentation.mjs';
import {measuredKilometers} from '../lib/travelDistance';
import { fmtKm,fmtTime,timeAgo } from '../lib/api';

export default function ProfilePage(){
  const {user,history=[],favorites=[],preferences={},logout,setToast,t,language}=useVano();
  const navigate=useNavigate();
  const trips=history.length;
  const kilometers=history.reduce((total,record)=>total+measuredKilometers(record),0);
  const initials=(user?.name||'V').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const firstName=user?.name?.trim()?.split(/\s+/)[0]||'Visitante';
  const isMoto=preferences.vehicle==='moto';
  const routeLabel=t(preferences.preferredRoute==='fast'?'Mais rápida':'Mais segura');
  const recent=groupedHistory(history).slice(0,2).map(group=>group.latest);
  async function signOut(){try{await logout();navigate('/inicio');}catch(error){setToast(error?.message||'Não foi possível sair da conta. Tente novamente.');}}
  return <main className="content-page v4-profile">
    <header className="v4-profile-top">
      <Brand small to="/mapa"/>
      <div className="v4-profile-header-right"><span>{t('MEU ESPAÇO')}</span><Link to="/configuracoes" className="v4-icon-button" aria-label="Abrir configurações"><Settings2 size={20}/></Link></div>
    </header>
    <section className="v4-profile-intro v92-profile-hero">
      <div className="v4-identity-avatar" aria-hidden="true">{initials}</div>
      <div className="v4-intro-name"><h1>{user?t('Olá, {name}.',{name:firstName}):t('Seu espaço VANO.')}</h1><p>{user?.email||t('Salve seus destinos e deixe tudo do seu jeito.')}</p></div>
      {user&&<Link className="v4-edit-link" to="/conta" aria-label="Editar seu perfil"><ArrowUpRight size={20}/></Link>}
    </section>
    <section className="v4-stat-strip" aria-label="Resumo do histórico de trajetos">
      <div><span>{t('ROTAS INICIADAS')}</span><strong>{trips.toLocaleString(language)}</strong><small>{t(user?'na sua conta':'neste navegador')}</small></div>
      <div><span>{t('DISTÂNCIA PERCORRIDA')}</span><strong>{fmtKm(kilometers,language)}</strong><small>{t('durante a navegação')}</small></div>
      <div><span>{t('LUGARES SALVOS')}</span><strong>{favorites.length}</strong><small>{t('seus atalhos')}</small></div>
    </section>
    {!user&&<section className="v4-signup-note"><span className="v4-note-mark"><UserRound size={24}/></span><div><strong>{t('Seu caminho merece um lugar.')}</strong><p>{t('Crie sua conta para guardar suas preferências.')}</p></div><Link to="/cadastro">{t('Criar conta')} <ArrowRight size={17}/></Link></section>}
    <section className="v4-route-feature">
      <div className="v4-route-feature-text"><span className="v4-overline"><span className="v4-small-dot"/> {t('PERSONALIZAÇÃO')}</span><h2>{t('Seu jeito')}<br/>{t('de navegar.')}</h2><p>{t(isMoto?'Moto':'Carro')} · {routeLabel} · {preferences.avoidTolls?'Sem pedágios, quando possível':'Pedágios permitidos'}</p><Link to="/personalizar" className="v4-feature-link">{t('Ajustar preferências')} <ArrowRight size={17}/></Link></div>
      <div className="v4-route-feature-image v92-route-cutout"><img src={isMoto?'/vehicle-moto-cutout.svg':'/vehicle-car-cutout.png'} alt={isMoto?'Motocicleta selecionada':'Carro selecionado'} loading="lazy"/></div>
      <img className="v4-route-feature-art" src="/vano-trip-line.svg" alt="" aria-hidden="true"/>
    </section>
    <section className="v4-profile-section">
      <div className="v4-profile-section-heading"><div><span className="v4-overline">{t('ATALHOS')}</span><h2>{t('Para onde vamos?')}</h2></div><Link to="/favoritos">{t('Ver todos')} <ArrowUpRight size={17}/></Link></div>
      {favorites.length?<div className="v4-place-shortcuts">{favorites.slice(0,3).map(place=><Link to={`/mapa?destination=${encodeURIComponent(place.id)}`} key={place.id} className="v4-place-chip"><MapPin size={18}/>{place.name}</Link>)}<Link to="/favoritos" className="v4-place-chip v4-add-place"><Plus size={18}/>Adicionar</Link></div>:<Link className="v4-empty-link" to="/favoritos"><span><MapPin size={19}/></span><div><strong>{t('Adicione um lugar frequente')}</strong><small>{t('Casa, trabalho e seus destinos favoritos')}</small></div><ArrowRight size={18}/></Link>}
    </section>
      <section className="v4-profile-section"><div className="v4-profile-section-heading"><div><h2>{t('Seus trajetos')}</h2></div><Link to="/rotas">{t('Ver todos')} <ArrowUpRight size={17}/></Link></div>{recent.length?<div className="v4-recent-list">{recent.map(item=><div className="v4-recent-trip" key={item.id}><span className="v4-recent-icon"><Navigation size={18}/></span><div><strong>{item.destination?.name||t('Destino')}</strong><small>{timeAgo(item.createdAt,language)} · {fmtTime(item.duration)} estimados · {historyDistanceLabel(item,language)}</small></div></div>)}</div>:<Link className="v4-empty-link" to="/mapa"><span><Route size={19}/></span><div><strong>{t('Seu primeiro trajeto começa aqui')}</strong><small>{t('Escolha um destino no mapa')}</small></div><ArrowRight size={18}/></Link>}</section>
    {user&&<button type="button" className="v4-signout v96-profile-signout" onClick={signOut}><span className="v96-signout-icon" aria-hidden="true"><LogOut size={19}/></span><span>{t('Sair da conta')}</span></button>}
    <BottomNav/>
  </main>;
}
