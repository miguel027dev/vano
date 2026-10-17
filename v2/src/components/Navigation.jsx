import React from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { Map, Route, Bookmark, UserRound, CircleHelp, Settings, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import {useVano} from '../context';
const tabs=[{to:'/mapa',label:'Mapa',icon:Map},{to:'/rotas',label:'Rotas',icon:Route},{to:'/favoritos',label:'Salvos',icon:Bookmark},{to:'/perfil',label:'Perfil',icon:UserRound}];
export function BottomNav(){const {t}=useVano();const navigation=<nav className="bottom-nav v5-bottom-nav" aria-label="Navegação principal">{tabs.map(x=><NavLink key={x.to} to={x.to} end={x.to==='/mapa'} className={({isActive})=>`nav-tab ${isActive?'active':''}`}><x.icon size={20} strokeWidth={1.95}/><span>{t(x.label)}</span></NavLink>)}</nav>;return typeof document==='undefined'?navigation:createPortal(navigation,document.body);}
export function SideNav(){const {t}=useVano();return <aside className="side-nav"><Brand/>{tabs.map(x=><NavLink key={x.to} to={x.to} end={x.to==='/mapa'} className={({isActive})=>`side-link ${isActive?'active':''}`}><x.icon size={19}/>{t(x.label)}</NavLink>)}<hr/><NavLink className="side-link" to="/relatar"><ShieldCheck size={19}/> {t('Alertas')}</NavLink><NavLink className="side-link" to="/configuracoes"><Settings size={19}/> {t('Configurações')}</NavLink><NavLink className="side-link" to="/ajuda"><CircleHelp size={19}/> {t('Ajuda')}</NavLink><p className="side-foot">VANO <span>·</span> V2.7 · prévia local</p></aside>}
