import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CornerUpRight } from 'lucide-react';
import { Brand } from '../components/Brand';
import {useVano} from '../context';
import './entry-city.css';

// Project a small, fixed illustration once. No tiles, WebGL, network or frame loop.
const project=(x,y,z=0)=>[320+(x-y)*.72,38+(x+y)*.36-z];
const points=vertices=>vertices.map(([x,y,z])=>project(x,y,z).join(',')).join(' ');
const blocks=[];
for(let row=0;row<6;row++)for(let col=0;col<6;col++){
  const x=col*70+11,y=row*70+11;
  blocks.push({x,y,park:(row+col)%4===0,height:17+(row*13+col*9)%27});
}
const route=points([[70,350],[70,280],[280,280],[280,70],[350,70]]);
const start=project(70,350),end=project(350,70);

function WelcomeCity({t}){
  const scene=useRef(null);
  useEffect(()=>{
    const element=scene.current;
    let inView=true;
    const sync=()=>{element.dataset.paused=String(document.hidden||!inView)};
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync()}):null;
    observer?.observe(element);
    document.addEventListener('visibilitychange',sync);sync();
    return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',sync)};
  },[]);
  return <div className="entry-city" ref={scene} aria-hidden="true">
    <div className="entry-city-halo"/>
    <svg className="entry-city-art" viewBox="0 0 640 370" fill="none" focusable="false">
      <path d={`M${points([[0,0],[420,0],[420,420],[0,420]])}Z`} fill="var(--city-edge)" transform="translate(0 7)"/>
      <path d={`M${points([[0,0],[420,0],[420,420],[0,420]])}Z`} fill="var(--city-ground)"/>
      <path d={`M${points([[0,205],[420,205],[420,231],[0,231]])}Z`} fill="var(--city-water)"/>
      {blocks.map(({x,y,park})=><path key={`lot-${x}-${y}`} d={`M${points([[x-5,y-5],[x+53,y-5],[x+53,y+53],[x-5,y+53]])}Z`} fill={park?'var(--city-park)':'var(--city-lot)'}/>)}
      {[0,70,140,210,280,350,420].map(n=><g key={`road-${n}`} stroke="var(--city-street)" strokeWidth="7"><polyline points={points([[n,0],[n,420]])}/><polyline points={points([[0,n],[420,n]])}/></g>)}
      <polyline points={route} stroke="var(--city-street)" strokeWidth="17" strokeLinejoin="round"/>
      <polyline className="v5-entry-line entry-city-route" points={route} pathLength="1" stroke="var(--city-orange)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline className="entry-city-flow" points={route} pathLength="1" stroke="#ffdfba" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      {blocks.map(({x,y,park,height},i)=>park?<g key={`park-${i}`}>
        {[0,22,42].map((offset,j)=>{const [cx,cy]=project(x+offset,y+22,7);return <g key={j}><ellipse cx={cx+3} cy={cy+9} rx="9" ry="3" fill="var(--city-shadow)"/><path d={`M${cx} ${cy+3}v8`} stroke="var(--city-tree-trunk)" strokeWidth="2"/><ellipse cx={cx} cy={cy} rx="6" ry="9" fill="var(--city-tree)"/></g>})}
      </g>:<g key={`building-${i}`}>
        <path d={`M${points([[x,y+40],[x+38,y+40],[x+38,y+40,height],[x,y+40,height]])}Z`} fill="var(--city-building-front)"/>
        <path d={`M${points([[x+38,y],[x+38,y+40],[x+38,y+40,height],[x+38,y,height]])}Z`} fill="var(--city-building-side)"/>
        <path d={`M${points([[x,y,height],[x+38,y,height],[x+38,y+40,height],[x,y+40,height]])}Z`} fill="var(--city-building-top)"/>
        <path d={`M${points([[x+7,y+7,height+2],[x+30,y+7,height+2],[x+30,y+31,height+2],[x+7,y+31,height+2]])}Z`} stroke="var(--city-roof)" strokeWidth="2"/>
      </g>)}
      <g transform={`translate(${end[0]} ${end[1]})`}><ellipse cy="2" rx="13" ry="6" fill="var(--city-shadow)"/><path d="M0 0C-4-6-13-14-13-22a13 13 0 0 1 26 0C13-14 4-6 0 0Z" fill="var(--city-orange)" stroke="var(--city-street)" strokeWidth="3"/><circle cy="-22" r="4" fill="white"/></g>
      <g transform={`translate(${start[0]} ${start[1]})`}><ellipse className="entry-city-pulse" rx="27" ry="16" stroke="var(--city-orange)"/><ellipse rx="24" ry="14" fill="var(--city-orange)" opacity=".13"/><g className="entry-city-pointer"><path d="M0-20L13 9 0 4-13 9Z" fill="var(--city-orange)" stroke="var(--city-street)" strokeWidth="4" strokeLinejoin="round"/></g></g>
    </svg>
    <div className="entry-city-guidance"><CornerUpRight size={24} strokeWidth={2.6}/><span>{t('Vá do seu jeito.')}</span></div>
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
