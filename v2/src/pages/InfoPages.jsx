import React,{useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowRight,BookOpen,Check,ChevronDown,ChevronUp,Compass,ExternalLink,FileText,LifeBuoy,MapPin,ShieldCheck,Search} from 'lucide-react';
import {PUBLIC_PAGES,pageForPath} from '../../seo/catalog.mjs';
import '../public-pages.css';
import {LegalDocumentPage} from './LegalPages.jsx';
const categories=[...new Set(PUBLIC_PAGES.map(p=>p.category))];
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
export function PublicLandingPage({slug}){
  const location=useLocation();const page=pageForPath(slug||location.pathname);const [faqOpen,setFaqOpen]=useState(-1);const [faqQuery,setFaqQuery]=useState('');usePublicMetadata(page);
  useEffect(()=>{setFaqOpen(-1);setFaqQuery('')},[page?.path]);
  const visibleFaq=(page?.faq||[]).map(([question,answer],index)=>({question,answer,index})).filter(({question,answer})=>(question+' '+answer).toLocaleLowerCase('pt-BR').includes(faqQuery.trim().toLocaleLowerCase('pt-BR')));
  if(!page)return <main className="content-page"><h1>Conteúdo não encontrado</h1><Link to="/ajuda">Central de ajuda</Link></main>;
  if(page.category==='Legal'||page.path==='/seguranca-na-navegacao')return <LegalDocumentPage page={page}/>;
  const others=PUBLIC_PAGES.filter(x=>x.path!==page.path&&x.category===page.category).slice(0,3);
  return <main className="v3-public" id="conteudo" role="main">
    <div className="v3-public-wrap"><nav className="v3-public-crumb" aria-label="Você está aqui"><Link to="/inicio">VANO</Link><span>/</span><span>{page.category}</span></nav>
      <header className="v3-public-hero"><span className="v3-public-eyebrow"><AnchorIcon kind={page.category}/>{page.category} · VANO Maps</span><h1>{page.title}</h1><p>{page.lead}</p><div className="v3-public-hero-actions"><Link className="v3-public-cta" to={page.ctaHref||'/mapa'}>{page.cta||'Abrir VANO'} <ArrowRight size={19}/></Link><Link className="v3-public-secondary" to="/ajuda">Central de ajuda</Link></div></header>
      <div className="v3-public-columns"><div className="v3-public-article"><div className="v3-public-article-top"><span>GUIA VANO</span><span>Leitura e informação</span></div>{page.sections.map(([heading,body],i)=><section key={heading} className="v3-public-section"><span className="v3-section-index">{String(i+1).padStart(2,'0')}</span><div><h2>{heading}</h2><p>{body}</p></div></section>)}{page.faq?.length>0&&<section className="v3-public-faq" aria-labelledby="v3-faq-title">
 <div className="v3-public-faq-heading"><div><span>AJUDA RÁPIDA</span><h2 id="v3-faq-title">Perguntas frequentes</h2></div><small>{visibleFaq.length} de {page.faq.length} respostas</small></div>
 <label className="v3-public-faq-search"><Search size={19} aria-hidden="true"/><span className="sr-only">Buscar nas perguntas frequentes</span><input type="search" value={faqQuery} onChange={e=>setFaqQuery(e.target.value)} placeholder="Pesquise sua dúvida" aria-label="Buscar nas perguntas frequentes"/></label>
 <div className="v3-public-faq-list">{visibleFaq.length?visibleFaq.map(({question,answer,index})=><div className="v3-public-faq-item" key={question}>
  <h3><button type="button" id={'v3-faq-question-'+index} onClick={()=>setFaqOpen(o=>o===index?-1:index)} aria-expanded={faqOpen===index} aria-controls={'v3-faq-answer-'+index}>{question}{faqOpen===index?<ChevronUp size={19} aria-hidden="true"/>:<ChevronDown size={19} aria-hidden="true"/>}</button></h3>
  {faqOpen===index&&<div id={'v3-faq-answer-'+index} role="region" aria-labelledby={'v3-faq-question-'+index}><p>{answer}</p></div>}
 </div>):<p className="v3-public-faq-empty">Nenhuma resposta encontrada. Tente outra palavra.</p>}</div>
 </section>}</div>
        <aside className="v3-public-aside"><span>EXPLORAR</span><h3>Encontre seu caminho.</h3><p>Conheça mais sobre o VANO, suas possibilidades e seus limites.</p><div className="v3-public-mini-links">{(others.length?others:PUBLIC_PAGES.filter(p=>['/ajuda','/sobre','/termos-de-uso'].includes(p.path))).map(p=><Link key={p.path} to={p.path}>{p.title}<ArrowRight size={15}/></Link>)}</div><div className="v3-public-map-card"><MapPin size={21}/><strong>Uma rota começa com um destino.</strong><Link to="/mapa">Ir ao mapa <ExternalLink size={14}/></Link></div></aside>
      </div>
      <footer className="v3-public-footer"><strong>VANO Maps</strong><span>Mapas com clareza. Decisões com contexto.</span><div><Link to="/sobre">Sobre</Link><Link to="/politica-de-privacidade">Privacidade</Link><Link to="/termos-de-uso">Termos</Link><Link to="/contato">Contato</Link></div></footer>
    </div>
  </main>;
}
export const HelpPage=()=> <PublicLandingPage slug="/ajuda"/>;
export const TermsPage=()=> <PublicLandingPage slug="/termos-de-uso"/>;
export const PrivacyPage=()=> <PublicLandingPage slug="/politica-de-privacidade"/>;
export const AboutPage=()=> <PublicLandingPage slug="/sobre"/>;
