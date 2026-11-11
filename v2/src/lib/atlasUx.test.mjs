import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=path=>readFileSync(resolve(root,path),'utf8');

test('logo original e ilustrações de rota acompanham a interface',()=>{
  for(const path of ['public/vano-logo-original.webp','public/vano-city-lines.svg','public/vano-trip-line.svg','public/vehicle-car.webp','public/vehicle-moto.webp'])assert.equal(existsSync(resolve(root,path)),true,`Asset ausente: ${path}`);
  assert.match(source('src/pages/EntryPage.jsx'),/v5-entry-line/);
  assert.doesNotMatch(source('src/pages/EntryPage.jsx'),/v4-visual-card/);
});

test('perfil abandonou o cartão preto legado e usa dados do histórico',()=>{
  const profile=source('src/pages/ProfilePage.jsx');
  assert.doesNotMatch(profile,/v2-profile-hero/);
  assert.match(profile,/history\.reduce/);
  assert.match(profile,/DISTÂNCIA ESTIMADA/);
  assert.match(profile,/v4-route-feature/);
});

test('favoritos abrem o mapa com destino preservado',()=>{
  const profile=source('src/pages/ProfilePage.jsx');
  const places=source('src/pages/PlacesPage.jsx');
  assert.match(profile,/\/mapa\?destination=/);
  assert.match(places,/\/mapa\?destination=/);
});

test('modo reduzido e acesso LAN têm configuração explícita',()=>{
  assert.match(source('src/v4-design.css'),/prefers-reduced-motion:reduce/);
  assert.match(source('vite.config.js'),/5174/);
  assert.match(source('iniciar-v2.sh'),/--rede/);
  assert.match(source('iniciar-v2.sh'),/\$PROTO:\/\/\$LAN_IP:5174/);
  assert.match(source('iniciar-v2.sh'),/--https/);
  assert.match(source('vite.config.js'),/VANO_DEV_HTTPS/);
});


test('endpoints do mapa são interativos e as opções abrem busca pela API',()=>{
  const page=source('src/pages/MapPage.jsx');
  assert.match(page,/swapPoints/);
  assert.match(page,/onClick=\{swapPoints\}/);
  assert.match(page,/aria-label=\"Opções da origem\"/);
  assert.match(page,/aria-label=\"Opções do destino\"/);
  assert.match(page,/editorQuery/);
  assert.match(page,/api\(\`\/search\?q=/);
  assert.doesNotMatch(page,/origin-switch/);
});
test('imagem do perfil removeu fundo sem alterar as imagens aprovadas do onboarding',()=>{
  assert.equal(existsSync(resolve(root,'public/vehicle-car-cutout.png')),true);
  assert.match(source('src/pages/ProfilePage.jsx'),/vehicle-car-cutout\.png/);
  assert.match(source('src/pages/AuthPage.jsx'),/vehicle-car-cutout\.png/);
  assert.match(source('src/pages/AuthPage.jsx'),/vehicle-moto\.webp/);
});


test('navbar fica fora de containers animados via portal, com botões focáveis',()=>{
  const nav=source('src/components/Navigation.jsx');
  assert.match(nav,/createPortal/);
  assert.match(nav,/document\.body/);
  assert.match(nav,/favoritos/);
  assert.match(source('src/v5-refinement.css'),/\.v5-bottom-nav/);
});
