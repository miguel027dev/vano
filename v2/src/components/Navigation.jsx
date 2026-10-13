import React from 'react';
import { createPortal } from 'react-dom';
import { NavLink,useLocation } from 'react-router-dom';
import { Map, Route, Bookmark, UserRound, CircleHelp, Settings, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import {useVano} from '../context';
const tabs=[{to:'/mapa',label:'Mapa',icon:Map},{to:'/rotas',label:'Rotas',icon:Route},{to:'/favoritos',label:'Salvos',icon:Bookmark},{to:'/perfil',label:'Perfil',icon:UserRound}];
export function BottomNav(){const {t}=useVano();const navigation=<nav className="bottom-nav v5-bottom-nav" aria-label="Navegação principal">{tabs.map(x=><NavLink key={x.to} to={x.to} end={x.to==='/mapa'} className={({isActive})=>`nav-tab ${isActive?'active':''}`}><x.icon size={20} strokeWidth={1.95}/><span>{t(x.label)}</span></NavLink>)}</nav>;return typeof document==='undefined'?navigation:createPortal(navigation,document.body);}
export function SideNav(){
 const {t,user}=useVano(),location=useLocation();
 const profilePaths=new Set(['/perfil','/conta','/privacidade']);
 const routePaths=new Set(['/rotas','/atividade','/rotinas']);
 return <aside className="side-nav" aria-label="Menu lateral">
   <Brand/>
   <span className="v44-side-heading">NAVEGAÇÃO</span>
   <nav aria-label="Páginas principais" className="v44-side-group">
     {tabs.map(x=>{
       const active=x.to==='/perfil'?profilePaths.has(location.pathname):
         x.to==='/rotas'?routePaths.has(location.pathname):x.to===location.pathname;
       return <NavLink key={x.to} to={x.to} end className={`side-link ${active?'active':''}`} aria-current={active?'page':undefined}><x.icon size={19}/>{t(x.label)}</NavLink>;
     })}
   </nav>
   <hr/>
   <span className="v44-side-heading">SUA CONTA</span>
   <nav aria-label="Conta e suporte" className="v44-side-group">
     <NavLink className={({isActive})=>`side-link ${isActive?'active':''}`} to="/relatar"><ShieldCheck size={19}/>{t('Alertas')}</NavLink>
     <NavLink className={({isActive})=>`side-link ${isActive?'active':''}`} to="/configuracoes"><Settings size={19}/>{t('Configurações')}</NavLink>
     <NavLink className={({isActive})=>`side-link ${isActive?'active':''}`} to="/ajuda"><CircleHelp size={19}/>{t('Ajuda')}</NavLink>
     {user?.isAdmin===true&&<NavLink className={({isActive})=>`side-link ${isActive?'active':''}`} to="/admin"><ShieldCheck size={19}/>Admin</NavLink>}
   </nav>
   <p className="side-foot">VANO <span>·</span> MAPS</p>
 </aside>;
}
