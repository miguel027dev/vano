import React,{useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,ChevronDown,ChevronUp,Compass,ExternalLink,FileText,LifeBuoy,LockKeyhole,MapPin,Moon,ShieldCheck,Sun} from 'lucide-react';
import {useVano} from '../context';
import {PUBLIC_PAGES,pageForPath} from '../../seo/catalog.mjs';
import '../public-pages.css';

const legalPaths=['/termos-de-uso','/politica-de-privacidade','/seguranca-na-navegacao','/excluir-conta'];
const legalLabels={'/termos-de-uso':'Termos de uso','/politica-de-privacidade':'Privacidade','/seguranca-na-navegacao':'Segurança','/excluir-conta':'Excluir conta'};
function usePublicMetadata(page){
 useEffect(()=>{
  if(!page)return;
  const previousTitle=document.title;
  const meta=document.querySelector('meta[name="description"]');
  const previousDescription=meta?.getAttribute('content')||'';
  const canonical=document.querySelector('link[rel="canonical"]');
  const createdCanonical=!canonical;
  const element=canonical||document.createElement('link');
  const previousHref=element.getAttribute('href');
  const canonicalOrigin=(()=>{try{return new URL(previousHref||'https://vanomaps.online').origin;}catch{return 'https://vanomaps.online';}})();
  if(createdCanonical){element.rel='canonical';document.head.appendChild(element);}
  document.title=page.title+' | VANO Maps';
  if(meta)meta.setAttribute('content',page.description);
  element.href=canonicalOrigin+page.path;
  const changes=[];
  for(const [property,value] of [['og:title',page.title+' | VANO Maps'],['og:description',page.description],['og:url',canonicalOrigin+page.path]]){
   let tag=document.querySelector('meta[property="'+property+'"]');
   const created=!tag;
   if(!tag){tag=document.createElement('meta');tag.setAttribute('property',property);document.head.appendChild(tag);}
   const previous=tag.getAttribute('content');
   tag.setAttribute('content',value);
   changes.push({tag,created,previous});
  }
  return()=>{
   document.title=previousTitle;
   if(meta)meta.setAttribute('content',previousDescription);
   if(createdCanonical)element.remove();
   else if(previousHref!==null)element.setAttribute('href',previousHref);
   for(const {tag,created,previous} of changes){
    if(created)tag.remove();else if(previous!==null)tag.setAttribute('content',previous);
   }
  };
 },[page]);
}
function AnchorIcon({kind}){return kind==='Legal'?<ShieldCheck size={18}/>:kind==='Suporte'?<LifeBuoy size={18}/>:kind==='Alternativas'?<Compass size={18}/>:<BookOpen size={18}/>}

function ThemeControl(){
 const {preferences,savePreference}=useVano();
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia?.('(prefers-color-scheme: dark)')?.matches===true);
 useEffect(()=>{
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  if(!media)return;
  const change=()=>setSystemDark(media.matches);
  media.addEventListener?.('change',change);
  return()=>media.removeEventListener?.('change',change);
 },[]);
 const dark=preferences?.theme==='dark'||(preferences?.theme==='system'&&systemDark);
 return <button type="button" className="v3-public-theme" aria-label={dark?'Ativar modo claro':'Ativar modo escuro'} title={dark?'Ativar modo claro':'Ativar modo escuro'} onClick={()=>savePreference({theme:dark?'light':'dark'})}>
   {dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?'Claro':'Escuro'}</span>
 </button>;
}
function LegalTabs({path}){
 return <nav className="v3-public-legal-tabs" aria-label="Documentos e segurança">
   {legalPaths.map(href=><Link key={href} to={href} aria-current={path===href?'page':undefined} className={path===href?'is-current':''}>
    {href==='/termos-de-uso'?<FileText size={16}/>:href==='/politica-de-privacidade'?<LockKeyhole size={16}/>:href==='/seguranca-na-navegacao'?<ShieldCheck size={16}/>:<CheckCircle2 size={16}/>}
    <span>{legalLabels[href]}</span>
   </Link>)}
 </nav>;
}
export function PublicLandingPage({slug}){
 const location=useLocation();const page=pageForPath(slug||location.pathname);
 const [faqOpen,setFaqOpen]=useState(0);
 usePublicMetadata(page);
 useEffect(()=>{setFaqOpen(0);},[page?.path]);
 if(!page)return <main className="content-page"><h1>Conteúdo não encontrado</h1><Link to="/ajuda">Central de ajuda</Link></main>;
 const legal=page.category==='Legal'||page.path==='/seguranca-na-navegacao';
 const others=PUBLIC_PAGES.filter(x=>x.path!==page.path&&(legal?legalPaths.includes(x.path):x.category===page.category)).slice(0,3);
 const menu=others.length?others:PUBLIC_PAGES.filter(p=>['/ajuda','/sobre','/termos-de-uso'].includes(p.path));
 return <main className={'v3-public'+(legal?' v3-public-is-legal':'')} id="conteudo" role="main">
  <div className="v3-public-wrap">
   <div className="v3-public-topbar">
    <Link className="v3-public-home" to="/inicio" aria-label="Voltar ao início do VANO"><span className="v3-public-mark" aria-hidden="true">V</span><span>VANO<span className="v3-public-home-sub">MAPS</span></span></Link>
    <div className="v3-public-top-actions"><Link to="/mapa" className="v3-public-back"><MapPin size={16}/> <span>Mapa</span></Link><ThemeControl/></div>
   </div>
   <nav className="v3-public-crumb" aria-label="Você está aqui"><Link to="/inicio">Início</Link><span aria-hidden="true">/</span><span>{page.category}</span><span aria-hidden="true">/</span><span aria-current="page">{page.title}</span></nav>
   {legal&&<LegalTabs path={page.path}/>}
   <header className="v3-public-hero">
    <span className="v3-public-eyebrow"><AnchorIcon kind={page.category}/>{legal?'DOCUMENTOS E TRANSPARÊNCIA':page.category.toUpperCase()}</span>
    <h1>{page.title}</h1>
    <p>{page.lead}</p>
    <div className="v3-public-hero-actions"><a className="v3-public-cta" href="#secoes">Explorar conteúdo <ArrowRight size={18}/></a><Link className="v3-public-secondary" to={page.ctaHref||'/mapa'}>{page.cta||'Abrir VANO'} <ExternalLink size={15}/></Link></div>
   </header>
   <div className="v3-public-columns" id="secoes">
    <article className="v3-public-article" aria-label={page.title}>
     <div className="v3-public-article-top"><span><FileText size={15}/>{legal?'Documento informativo':'GUIA VANO'}</span><span>{page.sections.length} {page.sections.length===1?'seção':'seções'}</span></div>
     {page.sections.map(([heading,body],i)=><section id={'secao-'+(i+1)} key={heading} className="v3-public-section">
      <span className="v3-section-index" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>
      <div><h2>{heading}</h2><p>{body}</p></div>
     </section>)}
     {page.faq?.length>0&&<section className="v3-public-faq"><h2>Perguntas frequentes</h2>{page.faq.map(([q,a],i)=><div className="v3-public-faq-item" key={q}>
      <button type="button" onClick={()=>setFaqOpen(o=>o===i?-1:i)} aria-expanded={faqOpen===i} aria-controls={'v3-faq-answer-'+i}>{q}{faqOpen===i?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
      <div id={'v3-faq-answer-'+i} hidden={faqOpen!==i}>{faqOpen===i&&<p>{a}</p>}</div>
     </div>)}</section>}
     <div className="v3-public-document-foot"><ShieldCheck size={19}/><span>Precisa de mais informações? Consulte os documentos relacionados ou a <Link to="/ajuda">Central de ajuda</Link>.</span></div>
    </article>
    <aside className="v3-public-aside" aria-label="Navegação auxiliar">
     <div className="v3-public-toc"><span className="v3-public-aside-label">NESTA PÁGINA</span><nav aria-label="Índice de seções">{page.sections.map(([heading],i)=><a key={heading} href={'#secao-'+(i+1)}><span>{String(i+1).padStart(2,'0')}</span>{heading.replace(/^\d+\.\s*/, '')}</a>)}</nav></div>
     <div className="v3-public-related"><span className="v3-public-aside-label">CONTINUE EXPLORANDO</span><div className="v3-public-mini-links">{menu.map(p=><Link key={p.path} to={p.path}>{p.path==='/seguranca-na-navegacao'?'Segurança na navegação':p.title}<ArrowRight size={15}/></Link>)}</div></div>
     <div className="v3-public-map-card"><span className="v3-public-map-icon"><MapPin size={20}/></span><strong>Informação para seguir com confiança.</strong><p>Consulte as orientações e volte ao mapa quando precisar.</p><Link to="/mapa">Abrir mapa <ArrowRight size={15}/></Link></div>
    </aside>
   </div>
   <footer className="v3-public-footer"><Link to="/inicio" className="v3-public-footer-logo">VANO Maps</Link><span>Clareza para cada caminho.</span><div><Link to="/sobre">Sobre</Link><Link to="/politica-de-privacidade">Privacidade</Link><Link to="/termos-de-uso">Termos</Link><Link to="/seguranca-na-navegacao">Segurança</Link><Link to="/contato">Contato</Link></div><a className="v3-public-to-top" href="#conteudo" aria-label="Voltar ao topo">Topo <ArrowLeft size={14}/></a></footer>
  </div>
 </main>;
}
export const HelpPage=()=> <PublicLandingPage slug="/ajuda"/>;
export const TermsPage=()=> <PublicLandingPage slug="/termos-de-uso"/>;
export const PrivacyPage=()=> <PublicLandingPage slug="/politica-de-privacidade"/>;
export const AboutPage=()=> <PublicLandingPage slug="/sobre"/>;
