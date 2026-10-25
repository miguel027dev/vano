import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_PAGES,pageForPath,CANONICAL_PATHS} from './catalog.mjs';

const source=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');
test('legacy information routes resolve to one canonical page',()=>{
 for(const [oldPath,target] of Object.entries({
  '/about':'/sobre','/o-que-e-vano-maps':'/sobre','/help':'/ajuda',
  '/terms':'/termos-de-uso','/termos':'/termos-de-uso',
  '/privacy':'/politica-de-privacidade','/privacidade':'/politica-de-privacidade',
  '/seguranca':'/seguranca-na-navegacao','/termos-de-seguranca':'/seguranca-na-navegacao'
 }))assert.equal(pageForPath(oldPath)?.path,target,oldPath);
 assert.ok(!CANONICAL_PATHS.includes('/o-que-e-vano-maps'));
});
test('public writing avoids unsupported feature claims and unexplained marketing jargon',()=>{
 for(const page of PUBLIC_PAGES.filter(p=>p.path!=='/benchmark-de-rotas')){
  const copy=[page.title,page.description,page.lead,...page.sections.flat(),...(page.faq||[]).flat()].join(' ');
  assert.doesNotMatch(copy,/\bRota\s*Spark\b|micro-rotas|\bETA\b/i,page.path);
 }
 const faq=pageForPath('/ajuda')?.faq||[];
 assert.ok(faq.length>=10,'Central de ajuda needs practical answers');
 assert.ok(faq.some(([question])=>/GPS/.test(question)));
 assert.ok(faq.some(([question])=>/conta/.test(question)));
});
test('accessible FAQ search and responsive CSS are included',()=>{
 const info=source('../src/pages/InfoPages.jsx');
 const css=source('../src/public-pages.css');
 assert.match(info,/type="search"/);
 assert.match(info,/aria-expanded/);
 assert.match(info,/aria-controls/);
 assert.match(info,/aria-labelledby/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\[data-theme="dark"\] \.v3-public/);
 assert.match(css,/prefers-reduced-motion/);
});
test('search and install icons point to real brand assets',()=>{
 const html=source('../index.html');
 const manifest=JSON.parse(source('../public/manifest.webmanifest'));
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/vano-mark\.svg"/);
 assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
 assert.match(html,/rel="apple-touch-icon"/);
 assert.equal(manifest.name,'VANO Maps');
 for(const icon of manifest.icons)assert.ok(source('../public'+icon.src).length>100,icon.src);
 const server=source('../server/index.mjs');
 assert.match(server,/requestPath!==publicPage\.path/);
 assert.match(server,/writeHead\(301/);
 assert.match(server,/application\/manifest\+json/);
});
