import React,{useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {ArrowRight,BookOpen,Check,ChevronDown,ChevronUp,Compass,ExternalLink,FileText,LifeBuoy,MapPin,ShieldCheck} from 'lucide-react';
import {PUBLIC_PAGES,pageForPath} from '../../seo/catalog.mjs';
import '../public-pages.css';
const categories=[...new Set(PUBLIC_PAGES.map(p=>p.category))];
function usePublicMetadata(page){useEffect(()=>{if(!page)return;document.title=`${page.title} | VANO Maps`;const meta=document.querySelector('meta[name="description"]');if(meta)meta.setAttribute('content',page.description);return()=>{document.title='VANO Maps — o melhor caminho é o seu';if(meta)meta.setAttribute('content','VANO Maps — navegação inteligente para sua cidade.');}},[page]);}
function AnchorIcon({kind}){return kind==='Legal'?<ShieldCheck size={18}/>:kind==='Suporte'?<LifeBuoy size={18}/>:kind==='Alternativas'?<Compass size={18}/>:<BookOpen size={18}/>}
export function PublicLandingPage({slug}){
  const location=useLocation();const page=pageForPath(slug||location.pathname);const [faqOpen,setFaqOpen]=useState(0);usePublicMetadata(page);
  if(!page)return <main className="content-page"><h1>Conteúdo não encontrado</h1><Link to="/ajuda">Central de ajuda</Link></main>;
  const others=PUBLIC_PAGES.filter(x=>x.path!==page.path&&x.category===page.category).slice(0,3);
  return <main className="v3-public" id="conteudo" role="main">
    <div className="v3-public-wrap"><nav className="v3-public-crumb" aria-label="Você está aqui"><Link to="/inicio">VANO</Link><span>/</span><span>{page.category}</span></nav>
      <header className="v3-public-hero"><span className="v3-public-eyebrow"><AnchorIcon kind={page.category}/>{page.category} · VANO Maps</span><h1>{page.title}</h1><p>{page.lead}</p><div className="v3-public-hero-actions"><Link className="v3-public-cta" to={page.ctaHref||'/mapa'}>{page.cta||'Abrir VANO'} <ArrowRight size={19}/></Link><Link className="v3-public-secondary" to="/ajuda">Central de ajuda</Link></div></header>
      <div className="v3-public-columns"><div className="v3-public-article"><div className="v3-public-article-top"><span>GUIA VANO</span><span>Leitura e informação</span></div>{page.sections.map(([heading,body],i)=><section key={heading} className="v3-public-section"><span className="v3-section-index">{String(i+1).padStart(2,'0')}</span><div><h2>{heading}</h2><p>{body}</p></div></section>)}{page.faq?.length>0&&<section className="v3-public-faq"><h2>Perguntas frequentes</h2>{page.faq.map(([q,a],i)=><div className="v3-public-faq-item" key={q}><button type="button" onClick={()=>setFaqOpen(o=>o===i?-1:i)} aria-expanded={faqOpen===i}>{q}{faqOpen===i?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>{faqOpen===i&&<p>{a}</p>}</div>)}</section>}</div>
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
