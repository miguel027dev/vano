import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/Brand';
import { useVano } from '../context';
import CityMapIntro from '../components/CityMapIntro';

/**
 * /inicio — public welcome page.
 * Auth and guest navigation remain connected to the existing application.
 */
export default function EntryPage(){
  const navigate=useNavigate();
  const {t}=useVano();
  const explore=()=>{
    try{localStorage.setItem('vano-v2-intro-seen','1');}catch{}
    navigate('/mapa');
  };
  return <main className="vhome">
    <header className="vhome-header">
      <Brand to="/inicio"/>
    </header>
    <div className="vhome-wrap">
      <section className="vhome-hero" aria-labelledby="vhome-title">
        <div className="vhome-intro">
          <p className="vhome-eyebrow">{t('Seu caminho começa aqui').replace(/\.$/,'').toLocaleUpperCase('pt-BR')}</p>
          <h1 id="vhome-title">{t('O caminho')}<br/>{t('certo')}<br/><span>{t('é o seu.')}</span></h1>
        </div>
        <CityMapIntro/>
      </section>
      <section className="vhome-bottom" aria-label={t('Comece a explorar o VANO Maps')}>
        <p className="vhome-description">{t('Escolha como chegar.')}<br/>{t('A VANO mostra os caminhos.')}</p>
        <nav className="vhome-actions" aria-label={t('Acesso ao VANO')}>
          <Link to="/cadastro" className="vhome-primary">{t('Criar conta')} <ArrowRight aria-hidden="true" size={23}/></Link>
          <Link to="/entrar" className="vhome-secondary">{t('Entrar')}</Link>
          <button type="button" className="vhome-explore" onClick={explore}>{t('Explorar sem conta')} <ArrowUpRight aria-hidden="true" size={20}/></button>
        </nav>
        <footer className="vhome-footer"><Link to="/privacidade">{t('Privacidade')}</Link><span aria-hidden="true">·</span><Link to="/termos">{t('Termos')}</Link></footer>
      </section>
    </div>
  </main>;
}
