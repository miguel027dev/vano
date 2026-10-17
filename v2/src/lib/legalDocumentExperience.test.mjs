import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_PATHS,pageForPath} from '../../seo/catalog.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const jsx=()=>read('../pages/InfoPages.jsx');
const css=()=>read('../public-pages.css');
test('terms, privacy, safety and account deletion keep public routes and real content',()=>{
 for(const p of ['/termos-de-uso','/politica-de-privacidade','/seguranca-na-navegacao','/excluir-conta']){
  assert.ok(PUBLIC_PATHS.includes(p));
  assert.ok(pageForPath(p).sections.length>=3);
  assert.ok(jsx().includes("'"+p+"'"),'legal navigation missing '+p);
 }
 assert.match(jsx(),/page\.sections\.map/);
 assert.match(jsx(),/page\.faq\?\.length>0/);
 assert.match(jsx(),/usePublicMetadata\(page\)/);
});
test('document layout supports large screens and small phones without hidden sections',()=>{
 const doc=jsx(),style=css();
 for(const key of ['v3-public-legal-tabs','v3-public-columns','v3-public-toc','v3-public-section','v3-public-aside','v3-public-footer','v3-public-theme']){
  assert.ok(doc.includes(key),'missing semantic component '+key);
  assert.ok(style.includes(key),'missing styles for '+key);
 }
 assert.match(doc,/aria-label="Documentos e segurança"/);
 assert.match(doc,/aria-current=\{path===href\?'page':undefined\}/);
 assert.match(doc,/id=\{'secao-'\+\(i\+1\)\}/);
 assert.match(style,/@media\(max-width:800px\)/);
 assert.match(style,/@media\(max-width:480px\)/);
 assert.match(style,/grid-template-columns:1fr/);
 assert.match(style,/overflow-x:auto/);
 assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(style,/\.v3-public a:focus-visible/);
});
test('light dark and system theme use central user preference without hardcoded document colors',()=>{
 const style=css(),component=jsx(),app=read('../App.jsx');
 assert.match(style,/:root\[data-theme='dark'\] \.v3-public/);
 assert.match(style,/--doc-bg:/);
 assert.match(style,/--doc-ink:/);
 assert.match(style,/--doc-body:/);
 assert.match(style,/background:var\(--doc-bg\)/);
 assert.match(component,/savePreference\(\{theme:dark\?'light':'dark'\}\)/);
 assert.match(component,/preferences\?\.theme==='system'&&systemDark/);
 assert.match(app,/if\(theme==='system'\)media\?\.addEventListener\?\.\('change',update\)/);
 assert.match(read('../pages/SettingsPage.jsx'),/to="\/seguranca-na-navegacao"/);
});
test('radar popups are informative only; other points retain destination actions',()=>{
 const overlay=read('./mapPublicOverlay.js');
 assert.match(overlay,/if\(item\.type!=='radar'&&item\.type!=='relato-radar'&&typeof onSelect==='function'/);
 assert.match(overlay,/title\.textContent=item\.name/);
 assert.match(overlay,/source\.textContent='Fonte: '/);
 assert.match(overlay,/label\.textContent='Ir para este destino'/);
 assert.match(overlay,/onSelect\(\)/);
 assert.match(overlay,/if\(getNavigation\(\)\)return/);
});
