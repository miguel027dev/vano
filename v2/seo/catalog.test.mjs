import test from 'node:test';import assert from 'node:assert/strict';
import {PUBLIC_PAGES,PUBLIC_PATHS,CANONICAL_PATHS,pageForPath} from './catalog.mjs';
test('all original legal institutional and search routes survive',()=>{
 const legacy=['/help','/about','/sobre','/contato','/imprensa','/testar','/politica-de-privacidade','/privacy','/termos-de-uso','/terms','/o-que-e-vano-maps','/rotas-para-evitar-transito','/alternativa-ao-waze','/rota-mais-rapida','/alternativa-ao-google-maps','/gps-para-moto','/benchmark-de-rotas','/excluir-conta'];
 for(const s of legacy)assert.ok(PUBLIC_PATHS.includes(s),`Missing ${s}`);
});
test('unique paths and descriptive pages',()=>{assert.equal(new Set(PUBLIC_PATHS).size,PUBLIC_PATHS.length);for(const p of PUBLIC_PAGES){assert.ok(p.description.length>45);assert.ok(p.sections.length>=3);assert.ok(p.sections.every(s=>s.length===2));assert.equal(pageForPath(p.path),p);}});
test('aliases have canonical pages',()=>{for(const p of PUBLIC_PAGES)for(const a of p.aliases||[])assert.equal(pageForPath(a)?.path,p.path);assert.equal(CANONICAL_PATHS.length,PUBLIC_PAGES.length);});
test('private pages excluded from catalog',()=>{for(const p of ['/admin','/conta','/perfil','/entrar','/mapa','/api/health'])assert.equal(pageForPath(p),null);});
