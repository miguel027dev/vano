import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_PATHS,pageForPath} from '../../seo/catalog.mjs';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('legal routes and safety terms resolve to actual documents',()=>{
 for(const path of ['/termos','/termos-de-uso','/terms','/privacidade','/politica-de-privacidade',
  '/privacy','/seguranca-na-navegacao','/seguranca','/termos-de-seguranca','/excluir-conta']){
  assert.ok(PUBLIC_PATHS.includes(path),path+' should be registered');
  assert.ok(pageForPath(path)?.sections?.length>=3,'not a blank placeholder: '+path);
 }
 assert.equal(pageForPath('/termos-de-seguranca').path,'/seguranca-na-navegacao');
 assert.ok(!pageForPath('/politica-de-privacidade').sections.some(([,body])=>body.includes('armazenamento de teste')));
});
test('legal shell has section table of contents, document links and theme via app preferences',()=>{
 const page=source('../pages/LegalPages.jsx'),info=source('../pages/InfoPages.jsx');
 const css=source('../legal-pages.css'),app=source('../App.jsx');
 assert.match(info,/page\.category==='Legal'\|\|page\.path==='\/seguranca-na-navegacao'/);
 assert.match(page,/DOCUMENTS\.map/);
 assert.match(page,/aria-label="Índice do documento"/);
 assert.match(page,/aria-label="Ir para seção"/);
 assert.match(page,/id=\{'capitulo-'\+\(i\+1\)\}/);
 assert.match(page,/aria-labelledby=\{'capitulo-titulo-'\+\(i\+1\)\}/);
 assert.match(page,/role="note"/);
 assert.match(css,/\[data-theme='dark'\] \.v51-legal/);
 assert.match(css,/@media\(max-width:790px\)/);
 assert.match(css,/@media\(max-width:470px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(app,/document\.documentElement\.dataset\.theme/);
});
test('radars never show destination action; place cards still can',()=>{
 const overlay=source('../lib/mapPublicOverlay.js');
 assert.match(overlay,/!\['radar','relato-radar'\]\.includes\(item\.type\)&&typeof onSelect==='function'/);
 assert.match(overlay,/label\.textContent='Ir para este destino'/);
 assert.match(overlay,/onPickPlace\(\{id:item\.id/);
 assert.match(overlay,/getNavigation\(\)\)return/);
});
