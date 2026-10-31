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
const indexing=process.env.VANO_SEO_INDEXABLE==='1';
function body(page){
 if(page.path==='/benchmark-resultados'){
  return '<main class="v3-public" id="conteudo"><div class="v3-public-wrap"><nav class="v3-public-crumb"><a href="/mapa">VANO</a> / Transparência</nav><header class="v3-public-hero"><span class="v3-public-eyebrow">VANO PERFORMANCE LAB</span><h1>Resultados públicos de benchmark de rotas</h1><p>Uma rota melhor precisa de dados, não de promessas. Histórico público com duração prevista, distância, categoria, horário e proveniência. Nenhum resultado fictício.</p><div class="v3-public-hero-actions"><a class="v3-public-cta" href="/api/benchmark/v1/results">Consultar JSON de resultados →</a><a class="v3-public-secondary" href="/benchmark-de-rotas">Executar benchmark</a></div></header><section class="v3-public-article" aria-label="Histórico verificável"><h2>Rota padrão versus VANO</h2><p>Nenhum teste validado e publicado no histórico público até esta versão. O laboratório não persiste resultados automaticamente.</p><table><caption>Campos do histórico quando houver testes publicados</caption><thead><tr><th>Origem e destino</th><th>Data</th><th>Fonte de referência</th><th>ETA referência</th><th>ETA VANO</th><th>Distância</th><th>Diferença</th></tr></thead><tbody></tbody></table><h2>Metodologia</h2><p>A referência interna VANO Fastest não é Google Maps. Valores positivos em diferenças de ETA representam apenas menor tempo previsto, não chegada observada. Consultas para diferentes horários ou provedores não são diretamente comparáveis.</p></section></div></main>';
 }
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
 const breadcrumb={'@type':'BreadcrumbList','@id':canonical+'#breadcrumb',itemListElement:[{'@type':'ListItem',position:1,name:'VANO Maps',item:site+'/mapa'},{'@type':'ListItem',position:2,name:page.title,item:canonical}]};
 const structured={'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':canonical,name:page.title,description:page.description,url:canonical,inLanguage:'pt-BR',breadcrumb:{'@id':canonical+'#breadcrumb'},isPartOf:{'@id':site+'/#website'}},{'@type':'WebSite','@id':site+'/#website',name:'VANO Maps',url:site,publisher:{'@id':site+'/#organization'}},breadcrumb,{'@type':'Organization','@id':site+'/#organization',name:'VANO Maps',url:site,logo:site+'/vano-logo-original.webp'},...(faqLd?[faqLd]:[])]};
 if(page.path==='/benchmark-resultados'){
  structured['@graph'].push({'@type':'Dataset','@id':canonical+'#dataset',name:'Resultados públicos dos benchmarks VANO Maps',url:canonical,inLanguage:'pt-BR',isAccessibleForFree:true,
    description:'Medições de rotas publicadas e verificadas, quando disponíveis. Fontes, ETA, distância, horários e limitações de comparação.',
    creator:{'@id':site+'/#organization'},variableMeasured:['ETA (minutos)','Distância (km)','Latência (ms)','Fonte e horário da comparação'],
    distribution:[{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:site+'/api/benchmark/v1/results'}]});
 }
 const safeJson=JSON.stringify(structured).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 const metas=`<meta name="robots" content="${indexing?'index, follow, max-image-preview:large':'noindex, follow'}"/><meta property="og:type" content="article"/><meta property="og:locale" content="pt_BR"/><meta name="twitter:card" content="summary"/><meta name="twitter:title" content="${esc(page.title)} | VANO Maps"/><meta name="twitter:description" content="${esc(page.description)}"/><meta name="twitter:image" content="${site}/vano-logo-original.webp"/><meta property="og:image" content="${site}/vano-logo-original.webp"/><meta property="og:image:alt" content="Símbolo do VANO Maps"/><meta property="og:site_name" content="VANO Maps"/><meta property="og:title" content="${esc(page.title)} | VANO Maps"/><meta property="og:description" content="${esc(page.description)}"/><meta property="og:url" content="${esc(canonical)}"/><link rel="canonical" href="${esc(canonical)}"/><script type="application/ld+json">${safeJson}</script>`;
 return template.replace(/<title>[^<]*<\/title>/,`<title>${esc(page.title)} | VANO Maps</title>`).replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${esc(page.description)}"/>`).replace('</head>',metas+'</head>').replace(/<div id="root">(?:<main class="v42-preboot"[\s\S]*?<\/main>)?<\/div>/,`<div id="root">${body(page)}</div>`);
}
function entryHtml({title,description,canonicalPath,heading,bodyText,ctaHref,ctaText}){
 const canonical=site+canonicalPath;
 const structured={'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':site+'/#organization',name:'VANO Maps',url:site,logo:site+'/vano-logo-original.webp'},{'@type':'WebSite','@id':site+'/#website',name:'VANO Maps',url:site,publisher:{'@id':site+'/#organization'}},{'@type':'WebPage','@id':canonical,url:canonical,name:title,description,inLanguage:'pt-BR',isPartOf:{'@id':site+'/#website'}},...((canonicalPath==='/mapa')?[{'@type':'WebApplication','@id':site+'/mapa#app',name:'VANO Maps',url:canonical,applicationCategory:'NavigationApplication',operatingSystem:'Web',description,publisher:{'@id':site+'/#organization'}}]:[])]};
 const safeJson=JSON.stringify(structured).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 const metas=`<meta name="robots" content="${indexing?'index, follow, max-image-preview:large':'noindex, follow'}"/><link rel="canonical" href="${esc(canonical)}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="VANO Maps"/><meta property="og:locale" content="pt_BR"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${esc(canonical)}"/><meta property="og:image" content="${site}/vano-logo-original.webp"/><meta property="og:image:alt" content="Símbolo do VANO Maps"/><meta name="twitter:card" content="summary"/><meta name="twitter:title" content="${esc(title)}"/><meta name="twitter:description" content="${esc(description)}"/><meta name="twitter:image" content="${site}/vano-logo-original.webp"/><script type="application/ld+json">${safeJson}</script>`;
 const visible=`<main id="conteudo" class="v3-public"><div class="v3-public-wrap"><header class="v3-public-hero"><span class="v3-public-eyebrow">VANO Maps · navegação</span><h1>${esc(heading)}</h1><p>${esc(bodyText)}</p><div class="v3-public-hero-actions"><a class="v3-public-cta" href="${esc(ctaHref)}">${esc(ctaText)} →</a><a class="v3-public-secondary" href="/sobre">Conheça o VANO</a></div></header><nav aria-label="Guias de navegação do VANO"><h2>Explore mapas, GPS e rotas</h2><ul><li><a href="/o-que-e-vano-maps">O que é VANO Maps</a></li><li><a href="/comparar-rotas">Como comparar rotas</a></li><li><a href="/rotas-para-evitar-transito">Como evitar trânsito</a></li><li><a href="/rotas-em-sao-paulo">Rotas em São Paulo</a></li><li><a href="/gps-online">GPS online</a></li><li><a href="/alternativa-ao-waze">Alternativa ao Waze</a></li><li><a href="/ajuda">Central de ajuda</a></li></ul></nav></div></main>`;
 return template.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`).replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${esc(description)}"/>`).replace('</head>',metas+'</head>').replace(/<div id="root">(?:<main class="v42-preboot"[\s\S]*?<\/main>)?<\/div>/,`<div id="root">${visible}</div>`);
}
const home=entryHtml({title:'VANO Maps — mapas e rotas para seu caminho',description:'Explore o VANO Maps para buscar lugares, comparar rotas, acompanhar o trajeto e conhecer opções para evitar trânsito.',canonicalPath:'/mapa',heading:'Escolha seu caminho com mais contexto',bodyText:'Busque destinos, compare duração e distância das rotas disponíveis e abra o mapa para planejar seu próximo trajeto.',ctaHref:'/mapa',ctaText:'Abrir mapa'});
fs.writeFileSync(path.join(dist,'index.html'),home);
fs.mkdirSync(path.join(dist,'inicio'),{recursive:true});
fs.writeFileSync(path.join(dist,'inicio','index.html'),home);
const mapHtml=entryHtml({title:'Mapa VANO — planeje e compare rotas',description:'Abra o mapa VANO para pesquisar endereços, comparar caminhos e planejar sua navegação de carro ou moto.',canonicalPath:'/mapa',heading:'Mapa e rotas VANO',bodyText:'Pesquise um destino, confira trajetos alternativos e compare tempo e distância antes de iniciar a navegação.',ctaHref:'/o-que-e-vano-maps',ctaText:'Entenda como funciona'});
fs.mkdirSync(path.join(dist,'mapa'),{recursive:true});
fs.writeFileSync(path.join(dist,'mapa','index.html'),mapHtml);
for(const route of PUBLIC_PATHS){
 const page=pageForPath(route);
 if(!/^\/[a-z0-9-]+$/.test(route))throw Error(`Invalid public path: ${route}`);
 const target=path.join(dist,route.slice(1),'index.html');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,htmlFor(page,route));
}
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${xml(site+'/mapa')}</loc></url>\n${CANONICAL_PATHS.map(p=>`  <url><loc>${xml(site+p)}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap);
const hidden=['/api/','/admin','/entrar','/cadastro','/recuperar-senha','/redefinir-senha','/personalizar','/perfil','/conta','/atividade','/favoritos','/rotinas','/configuracoes','/relatar'];
fs.writeFileSync(path.join(dist,'robots.txt'),`User-agent: *\nAllow: /\nAllow: /api/benchmark/v1/results\n${hidden.map(r=>`Disallow: ${r}`).join('\n')}\n\nSitemap: ${site}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist,'llms.txt'),`# VANO Maps\n\nSite oficial: ${site}\n\nVANO é um projeto de navegação para planejar trajetos, comparar caminhos e consultar mapas.\nOs cálculos e índices de segurança dependem de integrações ativas; nenhuma rota é garantia de ausência de risco.\n\n## Páginas públicas\n${PUBLIC_PAGES.map(p=>`- ${p.title}: ${site+p.path} — ${p.description}`).join('\n')}\n\nNão tente acessar sessões, contas, dados de localização privados ou o painel administrativo.\n`);
console.log(`VANO SEO: ${PUBLIC_PATHS.length} HTML routes, ${CANONICAL_PATHS.length} canonicals, sitemap, robots and llms.txt. Indexable=${indexing}`);
