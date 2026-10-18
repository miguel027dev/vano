import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/Brand';
import {useVano} from '../context';
import './entry-city.css';

// The original landing-page hero, ported without changing its geometry or motion.
const buildings=[];
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  if((col===0&&row>4)||(row===4&&col<4)||(col===3&&row<5)||(row===1&&col>3)||(col+row)%4===0)continue;
  buildings.push({x:col*100+19,y:row*100+20,h:12+((col*17+row*13)%27),sage:(col+row)%3===0});
}
function WelcomeCity({t}){
  const scene=useRef(null),city=useRef(null);
  const gridId=React.useId().replace(/:/g,'');
  useEffect(()=>{
    const element=scene.current;
    let inView=true;
    const sync=()=>{element.dataset.paused=String(document.hidden||!inView)};
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync()}):null;
    observer?.observe(element);document.addEventListener('visibilitychange',sync);sync();
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const move=e=>{
      if(media.matches||e.pointerType!=='mouse')return;
      const b=element.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;
      city.current.style.transform=`rotateX(${44-y*7}deg) rotateZ(${-34+x*5}deg) translate(${x*12}px,${y*12}px)`;
    };
    const reset=()=>{city.current.style.transform=''};
    element.addEventListener('pointermove',move);element.addEventListener('pointerleave',reset);media.addEventListener?.('change',reset);
    return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',sync);element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',reset);media.removeEventListener?.('change',reset)};
  },[]);
  return <div className="entry-city" ref={scene} aria-hidden="true">
    <div className="scene-label"><span className="scene-dot"/>{t('UM NOVO OLHAR PARA O SEU TRAJETO')}</div>
    <div className="orb"/>
    <div className="city-wrap" ref={city}>
      <svg className="city" viewBox="0 0 800 800" focusable="false">
        <defs><pattern id={gridId} width="100" height="100" patternUnits="userSpaceOnUse"><rect x="8" y="8" width="84" height="84" rx="10" fill="#d6dbcf"/><path d="M0 0H100V100" fill="none" stroke="#fffdf5" strokeWidth="12"/></pattern></defs>
        <rect width="800" height="800" rx="20" fill={`url(#${gridId})`}/>
        <path d="M0 650Q190 570 240 380T800 100" fill="none" stroke="#9fbfb2" strokeWidth="62"/>
        <path d="M0 650Q190 570 240 380T800 100" fill="none" stroke="#bad2c5" strokeWidth="45"/>
        <g>{buildings.map(({x,y,h,sage},i)=><g key={i}><path d={`M${x} ${y}h52v52h-52Z`} fill="#b8c0ac"/><path d={`M${x+52} ${y}l${h} -${h}v52l-${h} ${h}Z`} fill="#c1c8b5"/><path d={`M${x} ${y}l${h} -${h}h52l-${h} ${h}Z`} fill="#f4f2e6"/><rect x={x+h} y={y-h} width="52" height="52" rx="3" fill={sage?'#bec9af':'#e8e9d9'}/></g>)}</g>
        <g strokeLinejoin="round" strokeLinecap="round" fill="none">
          <path className="alt-route" d="M100 700V500H400V200H700" stroke="#fffdf7" strokeWidth="26"/>
          <path className="main-route route-shadow" d="M100 700V500H400V200H700" stroke="#b14b22" strokeWidth="25"/>
          <path className="v5-entry-line main-route" d="M100 700V500H400V200H700" stroke="#ed672e" strokeWidth="18"/>
          <path className="route-dash main-route" d="M100 700V500H400V200H700" stroke="#ffd6ad" strokeWidth="3"/>
        </g>
        <circle cx="700" cy="200" r="24" fill="#252e27" stroke="#fffdf7" strokeWidth="8"/><circle cx="700" cy="200" r="6" fill="#fff"/>
        <g transform="translate(400 390)"><circle r="36" fill="#fdfaf1"/><circle className="gps-pulse" r="45" fill="none" stroke="#f47a31" strokeWidth="2"/><path d="M0-23L18 17 0 10-18 17Z" fill="#ed672e"/></g>
        <text x="480" y="680" className="map-text">SÃO PAULO</text>
      </svg>
    </div>
    <div className="turn-card floating"><span className="scene-turn-icon">↱</span><div><small>{t('SEU PRÓXIMO MOVIMENTO')}</small><strong>{t('Vá do seu jeito.')}</strong></div><span className="live-dot"/></div>
    <div className="destination floating"><span>◎</span><div><small>{t('PRÓXIMA PARADA')}</small><strong>{t('Novas possibilidades.')}</strong></div><span>↗</span></div>
    <div className="coordinate">23°33′ S &nbsp; 46°38′ W <span>{t('FEITO PARA SE MOVER')}</span></div>
    <div className="art-caption">{t('Visual ilustrativo • não representa uma rota real')}</div>
  </div>;
}

export default function EntryPage(){
  const navigate=useNavigate(),{t}=useVano();
  const explore=()=>{try{localStorage.setItem('vano-v2-intro-seen','1');}catch{}navigate('/mapa')};
  return <main className="entry-welcome">
    <header className="entry-welcome-header"><Brand to="/inicio"/><Link to="/entrar" className="entry-header-login">{t('Entrar')} <ArrowUpRight size={15}/></Link></header>
    <section className="entry-welcome-main" aria-label={t('Bem-vindo ao VANO Maps')}>
      <div className="entry-welcome-heading"><span className="entry-welcome-kicker">{t('Seu caminho começa aqui.')}</span><h1>{t('O caminho certo')}<br/><em>{t('é o seu.')}</em></h1></div>
      <WelcomeCity t={t}/>
      <div className="entry-welcome-actions"><p>{t('Escolha como chegar. A VANO encontra alternativas de rota para o seu dia.')}</p><div className="entry-welcome-buttons"><Link className="entry-create" to="/cadastro">{t('Criar conta')} <ArrowRight size={20}/></Link><Link className="entry-login" to="/entrar">{t('Entrar')}</Link></div><button type="button" className="entry-explore" onClick={explore}>{t('Explorar sem conta')} <ArrowUpRight size={16}/></button></div>
    </section>
    <footer className="entry-welcome-footer"><Link to="/privacidade">{t('Privacidade')}</Link><span aria-hidden="true">·</span><Link to="/termos">{t('Termos')}</Link></footer>
  </main>;
}
