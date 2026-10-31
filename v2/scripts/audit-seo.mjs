/** Deterministic release audit for publicly crawlable pages (no external requests). */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {PUBLIC_PAGES,PUBLIC_PATHS,pageForPath} from '../seo/catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const prod=process.env.VANO_SEO_INDEXABLE==='1';
const site=(process.env.VANO_SEO_ORIGIN||'https://vanomaps.online').replace(/\/$/,'');
const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const robots=fs.readFileSync(path.join(dist,'robots.txt'),'utf8');
const machine=fs.readFileSync(path.join(dist,'llms.txt'),'utf8');
assert.equal(new Set(PUBLIC_PATHS).size,PUBLIC_PATHS.length,'duplicate public routes');
assert.equal(new Set(PUBLIC_PAGES.map(p=>p.title)).size,PUBLIC_PAGES.length,'duplicate titles');
assert.ok(robots.includes('Sitemap:'));assert.ok(machine.includes('# VANO Maps'));
for(const [route,canonical,heading] of [['','/mapa','Escolha seu caminho com mais contexto'],['inicio','/mapa','Escolha seu caminho com mais contexto'],['mapa','/mapa','Mapa e rotas VANO']]){
 const content=fs.readFileSync(path.join(dist,route,'index.html'),'utf8');
 assert.ok(content.includes('<h1>'+heading+'</h1>'),'Missing crawlable entry: '+route);
 assert.ok(content.includes('rel="canonical" href="'+site+canonical+'"'),'Bad entry canonical: '+route);
 assert.ok(content.includes(prod?'content="index, follow, max-image-preview:large"':'content="noindex, follow"'),'Bad entry robots: '+route);
}
assert.ok(!sitemap.includes('<loc>'+site+'/</loc>'),'Redirecting root must not be listed in sitemap');
assert.ok(sitemap.includes('<loc>'+site+'/mapa</loc>'),'Missing map in sitemap');
const sitemapURLs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
assert.deepEqual(sitemapURLs,[site+'/mapa',...PUBLIC_PAGES.map(p=>site+p.path)],'Sitemap must list unique canonical non-redirecting URLs');
const mapHtml=fs.readFileSync(path.join(dist,'mapa','index.html'),'utf8');
assert.ok(mapHtml.includes('href="/comparar-rotas"')&&mapHtml.includes('href="/rotas-em-sao-paulo"'),'Map should link to useful guides');
assert.ok(mapHtml.includes('property="og:image"')&&mapHtml.includes('name="twitter:image"'),'Map must have sharing metadata');
assert.ok(mapHtml.includes('"@type":"WebApplication"'),'Map must identify its app in structured data');
for(const page of PUBLIC_PAGES){
 assert.ok(page.title.length>=12&&page.title.length<=70,'Poor title: '+page.path);
 assert.ok(page.description.length>=60&&page.description.length<=170,'Poor description: '+page.path);
 assert.ok(sitemap.includes('<loc>'+site+page.path+'</loc>'),'Missing sitemap entry: '+page.path);
 for(const route of [page.path,...(page.aliases||[])]){
  const content=fs.readFileSync(path.join(dist,route.slice(1),'index.html'),'utf8');
  assert.ok(content.includes('<h1>'+page.title+'</h1>'),'Missing unique H1: '+route);
  assert.ok(content.includes('rel="canonical" href="'+site+page.path+'"'),'Bad canonical: '+route);
  assert.ok(content.includes('name="description" content="'+page.description+'"'),'Missing description: '+route);
  assert.ok(content.includes(prod?'content="index, follow, max-image-preview:large"':'content="noindex, follow"'),'Unexpected robots policy: '+route);
  assert.ok(content.includes('application/ld+json'),'Missing structured data: '+route);
  assert.ok(content.includes('property="og:image"')&&content.includes('name="twitter:card"'),'Missing sharing metadata: '+route);
  assert.ok(content.includes('"@type":"Organization"'),'Missing publisher data: '+route);
  assert.ok(content.includes('href="/termos-de-uso"'),'Missing legal navigation: '+route);
  assert.equal(pageForPath(route)?.path,page.path);
 }
}
for(const sensitive of ['/admin','/entrar','/perfil','/conta','/api/','/rotinas'])
 assert.ok(robots.includes('Disallow: '+sensitive),'Private robots exclusion: '+sensitive);
for(const unsafe of [/api_key\s*[=:]/i,/client_secret\s*[=:]/i,/VANO_SECURITY_SECRET\s*[=:]/i])
 assert.ok(!unsafe.test(machine),'Secret-looking data in llms.txt');
console.log('SEO AUDIT OK: '+PUBLIC_PAGES.length+' canonical pages, '+PUBLIC_PATHS.length+' direct HTML URLs, '+(prod?'production indexable':'staging noindex'));
