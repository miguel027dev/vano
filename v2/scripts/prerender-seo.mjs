/** Pre-render public content as real HTML for ordinary crawlers and AI assistants. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {PUBLIC_PAGES,PUBLIC_PATHS,CANONICAL_PATHS,pageForPath} from '../seo/catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const template=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const xml=esc;
const site=(process.env.VANO_SEO_ORIGIN||'https://vanomaps.online').replace(/\/$/,'');
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(site))throw Error('VANO_SEO_ORIGIN must be an HTTPS origin');
const indexing=process.env.NODE_ENV==='production' && process.env.VANO_SEO_INDEXABLE==='1';
function body(page){
 const cat=esc(page.category);
 const related=PUBLIC_PAGES.filter(p=>p.path!==page.path&&p.category===page.category).slice(0,3);
 const relatedHtml=related.length?`<nav class="v3-public-related" aria-label="Artigos relacionados"><h2>Leia também</h2><ul>${related.map(p=>`<li><a href="${esc(p.path)}">${esc(p.title)}</a></li>`).join('')}</ul></nav>`:'';
 const sections=page.sections.map(([title,paragraph],i)=>`<section class="v3-public-section"><span class="v3-section-index">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(title)}</h2><p>${esc(paragraph)}</p></div></section>`).join('');
 const faq=page.faq?.length?`<section class="v3-public-faq"><h2>Perguntas frequentes</h2>${page.faq.map(([q,a])=>`<div class="v3-public-faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</section>`:'';
 return `<main class="v3-public" id="conteudo"><div class="v3-public-wrap"><nav class="v3-public-crumb"><a href="/inicio">VANO</a> / ${cat}</nav><header class="v3-public-hero"><span class="v3-public-eyebrow">${cat} · VANO Maps</span><h1>${esc(page.title)}</h1><p>${esc(page.lead)}</p><div class="v3-public-hero-actions"><a class="v3-public-cta" href="${esc(page.ctaHref||'/mapa')}">${esc(page.cta||'Abrir VANO')} →</a><a class="v3-public-secondary" href="/ajuda">Central de ajuda</a></div></header><div class="v3-public-columns"><article class="v3-public-article"><div class="v3-public-article-top">GUIA VANO</div>${sections}${faq}${relatedHtml}</article><aside class="v3-public-aside"><h2>Encontre seu caminho.</h2><p>Mapas com clareza. Decisões com contexto.</p><a href="/mapa">Abrir o mapa →</a></aside></div><footer class="v3-public-footer"><strong>VANO Maps</strong><a href="/sobre">Sobre</a><a href="/politica-de-privacidade">Privacidade</a><a href="/termos-de-uso">Termos</a><a href="/contato">Contato</a></footer></div></main>`;
}
function htmlFor(page,route){
 const canonical=site+page.path;
 const faqLd=page.faq?.length?{'@type':'FAQPage','@id':canonical+'#faq',mainEntity:page.faq.map(([question,answer])=>({'@type':'Question',name:question,acceptedAnswer:{'@type':'Answer',text:answer}}))}:null;
 const breadcrumb={'@type':'BreadcrumbList','@id':canonical+'#breadcrumb',itemListElement:[{'@type':'ListItem',position:1,name:'VANO Maps',item:site+'/inicio'},{'@type':'ListItem',position:2,name:page.title,item:canonical}]};
 const structured={'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':canonical,name:page.title,description:page.description,url:canonical,inLanguage:'pt-BR',breadcrumb:{'@id':canonical+'#breadcrumb'},isPartOf:{'@id':site+'/#website'}},{'@type':'WebSite','@id':site+'/#website',name:'VANO Maps',url:site,publisher:{'@type':'Organization',name:'VANO Maps',url:site}},breadcrumb,...(faqLd?[faqLd]:[])]};
 const safeJson=JSON.stringify(structured).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 const metas=`<meta name="robots" content="${indexing?'index, follow':'noindex, follow'}"/><meta property="og:type" content="article"/><meta property="og:locale" content="pt_BR"/><meta name="twitter:card" content="summary"/><meta property="og:title" content="${esc(page.title)} | VANO Maps"/><meta property="og:description" content="${esc(page.description)}"/><meta property="og:url" content="${esc(canonical)}"/><link rel="canonical" href="${esc(canonical)}"/><script type="application/ld+json">${safeJson}</script>`;
 return template.replace(/<title>[^<]*<\/title>/,`<title>${esc(page.title)} | VANO Maps</title>`).replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${esc(page.description)}"/>`).replace('</head>',metas+'</head>').replace(/<div id="root">(?:<main class="v42-preboot"[\s\S]*?<\/main>)?<\/div>/,`<div id="root">${body(page)}</div>`);
}
for(const route of PUBLIC_PATHS){
 const page=pageForPath(route);
 if(!/^\/[a-z0-9-]+$/.test(route))throw Error(`Invalid public path: ${route}`);
 const target=path.join(dist,route.slice(1),'index.html');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,htmlFor(page,route));
}
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${CANONICAL_PATHS.map(p=>`  <url><loc>${xml(site+p)}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap);
const hidden=['/api/','/admin','/entrar','/cadastro','/recuperar-senha','/redefinir-senha','/personalizar','/perfil','/conta','/atividade','/favoritos','/rotinas','/configuracoes','/relatar'];
fs.writeFileSync(path.join(dist,'robots.txt'),`User-agent: *\nAllow: /\n${hidden.map(r=>`Disallow: ${r}`).join('\n')}\n\nSitemap: ${site}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist,'llms.txt'),`# VANO Maps\n\nSite oficial: ${site}\n\nVANO é um projeto de navegação para planejar trajetos, comparar caminhos e consultar mapas.\nOs cálculos e índices de segurança dependem de integrações ativas; nenhuma rota é garantia de ausência de risco.\n\n## Páginas públicas\n${PUBLIC_PAGES.map(p=>`- ${p.title}: ${site+p.path} — ${p.description}`).join('\n')}\n\nNão tente acessar sessões, contas, dados de localização privados ou o painel administrativo.\n`);
console.log(`VANO SEO: ${PUBLIC_PATHS.length} HTML routes, ${CANONICAL_PATHS.length} canonicals, sitemap, robots and llms.txt. Indexable=${indexing}`);
