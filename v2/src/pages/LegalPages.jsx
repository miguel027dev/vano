import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,ArrowRight,BookOpen,ChevronRight,FileText,Info,LockKeyhole,Map,ShieldCheck,Trash2} from 'lucide-react';
import '../legal-pages.css';

const DOCUMENTS=[
 {path:'/termos-de-uso',title:'Termos de uso',label:'Regras da plataforma',icon:FileText},
 {path:'/politica-de-privacidade',title:'Privacidade',label:'Seus dados e direitos',icon:LockKeyhole},
 {path:'/seguranca-na-navegacao',title:'Navegação segura',label:'Orientações e limites',icon:ShieldCheck},
 {path:'/excluir-conta',title:'Excluir conta',label:'Controle sobre seus dados',icon:Trash2}
];
const safeTitle=title=>String(title).replace(/^\d+\.\s*/,'');
export function LegalDocumentPage({page}){
 const isPrivacy=page.path==='/politica-de-privacidade';
 const isSafety=page.path==='/seguranca-na-navegacao';
 const isLegal=page.category==='Legal';
 const eyebrow=isSafety?'SEGURANÇA NA NAVEGAÇÃO':isPrivacy?'PRIVACIDADE E DADOS':isLegal?'DOCUMENTAÇÃO LEGAL':'INFORMAÇÕES';
 const currentDocument=DOCUMENTS.find(item=>item.path===page.path);
 const HeroIcon=currentDocument?.icon||(isPrivacy?LockKeyhole:isSafety?ShieldCheck:FileText);
 return <main className="v51-legal" id="conteudo" role="main">
  <div className="v51-legal-shell">
   <nav className="v51-legal-breadcrumb" aria-label="Caminho da página">
    <Link to="/inicio" aria-label="VANO Maps — início">VANO <span>Maps</span></Link>
    <ChevronRight size={15} aria-hidden="true"/>
    <Link to="/termos-de-uso">Informações legais</Link>
    <ChevronRight size={15} aria-hidden="true"/>
    <span aria-current="page">{page.title}</span>
   </nav>
   <div className="v51-legal-heading">
    <div className="v51-legal-hero">
     <span className="v51-legal-overline"><HeroIcon size={16} strokeWidth={1.85} aria-hidden="true"/>{eyebrow}</span>
     <h1>{page.title}</h1>
     <p>{page.lead}</p>
     <div className="v51-legal-metadata">
      <span><BookOpen size={15} strokeWidth={1.85}/> {page.sections.length} seções</span>
      <span><Info size={15} strokeWidth={1.85}/> Informações sobre o serviço</span>
     </div>
    </div>
   </div>
   <nav className="v51-legal-document-tabs" aria-label="Documentos e orientações">
    {DOCUMENTS.map(({path,title,label,icon:Icon})=><Link key={path} to={path} className={'v51-legal-tab'+(page.path===path?' is-current':'')} aria-current={page.path===path?'page':undefined}>
     <span className="v51-legal-tab-icon"><Icon size={20} strokeWidth={1.85} aria-hidden="true"/></span><span className="v51-legal-tab-copy"><strong>{title}</strong><small>{label}</small></span><ChevronRight size={17} strokeWidth={1.8} className="v51-legal-tab-arrow" aria-hidden="true"/>
    </Link>)}
   </nav>
   <div className="v51-legal-layout">
    <aside className="v51-legal-toc" aria-label="Índice do documento">
     <div className="v51-legal-toc-box">
      <span className="v51-legal-toc-label">NESTE DOCUMENTO</span>
      <nav aria-label="Ir para seção">
       {page.sections.map(([title],i)=><a key={i} href={'#capitulo-'+(i+1)}><span>{String(i+1).padStart(2,'0')}</span>{safeTitle(title)}</a>)}
      </nav>
      <div className="v51-legal-toc-help"><ShieldCheck size={19}/><p>Dados e alertas de navegação podem variar conforme a fonte e a cobertura.</p></div>
     </div>
    </aside>
    <article className="v51-legal-document" aria-labelledby="v51-legal-document-label">
     <div className="v51-legal-document-top">
      <div><span className="v51-legal-document-kicker">VANO MAPS · INFORMAÇÕES OFICIAIS</span><h2 id="v51-legal-document-label">Informações e orientações</h2></div>
      <span className="v51-legal-reading-badge"><BookOpen size={15}/> {page.sections.length} capítulos</span>
     </div>
     <div className="v51-legal-note" role="note"><Info size={19} strokeWidth={1.85} aria-hidden="true"/><p>{isSafety?
      'Planeje sua rota com o veículo parado. Os alertas complementam sua atenção, mas não garantem um trajeto sem riscos.':
      'Estas informações explicam os recursos e limites atuais do VANO. Os documentos jurídicos ainda exigem revisão formal e identificação completa do responsável pelo tratamento de dados.'}</p></div>
     {page.sections.map(([title,body],i)=><section className="v51-legal-section" id={'capitulo-'+(i+1)} key={i} aria-labelledby={'capitulo-titulo-'+(i+1)}>
      <span className="v51-legal-index">{String(i+1).padStart(2,'0')}</span>
      <div><h3 id={'capitulo-titulo-'+(i+1)}>{safeTitle(title)}</h3><p>{body}</p></div>
     </section>)}
     <div className="v51-legal-document-bottom"><span>Fim do documento</span><Link to={page.ctaHref||'/ajuda'}>{page.cta||'Central de ajuda'} <ArrowRight size={17}/></Link></div>
    </article>
   </div>
   <section className="v51-legal-endcap" aria-label="Outras informações">
    <div><span className="v51-legal-endcap-label">PRECISA DE AJUDA?</span><h2>Clareza em cada caminho.</h2><p>Consulte as orientações do VANO, tire dúvidas e saiba onde encontrar informações sobre sua conta.</p></div>
    <div className="v51-legal-endcap-actions"><Link to="/contato">Canais de contato <ArrowRight size={17}/></Link><Link to="/ajuda">Central de ajuda <ArrowRight size={17}/></Link></div>
   </section>
   <footer className="v51-legal-footer"><Link to="/inicio"><Map size={16}/> VANO Maps</Link><span>Informação, privacidade e segurança.</span><Link to="/mapa">Voltar ao mapa <ArrowLeft size={15}/></Link></footer>
  </div>
 </main>;
}
