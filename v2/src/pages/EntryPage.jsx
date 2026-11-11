import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ShieldCheck, Zap, MapPin } from 'lucide-react';
import { Brand } from '../components/Brand';
import {useVano} from '../context';

/** One-screen entry. The route motif is brand geometry, not a pretend app preview. */
export default function EntryPage(){
  const navigate=useNavigate(),{t}=useVano();
  const explore=()=>{try{localStorage.setItem('vano-v2-intro-seen','1');}catch{}navigate('/mapa')};
  return <main className="v5-landing">
    <header className="v5-entry-header">
      <Brand to="/inicio" />
      <Link to="/entrar" className="v5-entry-signin">{t('Entrar')} <ArrowUpRight size={16}/></Link>
    </header>
    <section className="v5-entry-main" aria-label={t('Bem-vindo ao VANO Maps')}>
      <div className="v5-entry-copy">
        <span className="v5-kicker"><span className="v5-kicker-dot"/> VANO MAPS</span>
        <h1>{t('O caminho certo')}<br/><em>{t('é o seu.')}</em></h1>
        <p>{t('Escolha como chegar. A VANO encontra alternativas de rota para o seu dia.')}</p>
        <div className="v5-entry-buttons">
          <Link className="v5-primary" to="/cadastro">{t('Começar agora')} <ArrowRight size={19}/></Link>
          <Link className="v5-secondary" to="/entrar">{t('Já tenho uma conta')}</Link>
        </div>
        <button type="button" className="v5-explore" onClick={explore}>{t('Explorar sem conta')} <ArrowUpRight size={16}/></button>
      </div>
      <div className="v5-entry-symbol" aria-label="Traço abstrato de trajeto">
        <svg viewBox="0 0 560 250" fill="none" aria-hidden="true" focusable="false">
          <path d="M-15 182H121C155 182 167 166 167 134V114C167 80 188 66 217 66H340C378 66 390 86 390 117V151C390 183 412 194 447 194H580" stroke="#ECE7DD" strokeWidth="39" strokeLinecap="round"/>
          <path className="v5-entry-line" d="M-15 182H121C155 182 167 166 167 134V114C167 80 188 66 217 66H340C378 66 390 86 390 117V151C390 183 412 194 447 194H580" stroke="#E55E24" strokeWidth="6" strokeLinecap="round"/>
          <circle cx="73" cy="182" r="16" fill="#fff" stroke="#E55E24" strokeWidth="5"/><circle cx="73" cy="182" r="5" fill="#E55E24"/>
          <circle cx="492" cy="194" r="18" fill="#E55E24" stroke="#fff" strokeWidth="5"/>
        </svg>
        <div className="v5-route-caption"><span><Zap size={16}/> {t('Mais rápida')}</span><span><ShieldCheck size={16}/> {t('Mais segura')}</span></div>
      </div>
    </section>
    <footer className="v5-entry-footer">
      <span>{t('Seu caminho começa aqui.')}</span>
      <div><Link to="/privacidade">{t('Privacidade')}</Link><Link to="/termos">{t('Termos')}</Link></div>
    </footer>
  </main>;
}
