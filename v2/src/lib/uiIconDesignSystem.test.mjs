import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const profile=read('../pages/ProfilePage.jsx');
const account=read('../pages/SettingsPage.jsx');
const legal=read('../pages/LegalPages.jsx');
const legalStyle=read('../legal-pages.css');
const accountStyle=read('../v92-profile-mavi.css');
const mapPage=read('../pages/MapPage.jsx');
const themeStyle=read('../v49-map-appearance.css');
const admin=read('../pages/IntelligencePage.jsx');

test('prominent interface icons describe actions, not generic AI decoration',()=>{
 assert.doesNotMatch(profile,/<Sparkles\b/);
 assert.ok(profile.includes('v92-mavi-profile-mark"><Route size={24}'));
 assert.doesNotMatch(admin,/<Sparkles\b/);
 assert.ok(admin.includes('<Clock3 size={15}/> Rápido'));
 assert.ok(account.includes('<SunMoon size={21}/>'));
 assert.ok(account.includes('<Route size={21}/>'));
 assert.ok(account.includes('<Ticket size={21}/>'));
});

test('theme control has one meaningful glyph without affecting map POI sources',()=>{
 assert.ok(mapPage.includes("selectedAppearance==='dark'?<Sun size={21}"));
 assert.ok(mapPage.includes(':<Moon size={21}'));
 assert.doesNotMatch(mapPage,/v49-glyph-sun|v49-glyph-moon/);
 assert.match(themeStyle,/\.v49-theme-glyph svg\{position:static/);
 assert.doesNotMatch(themeStyle,/rotate\(-55deg\)|rotate\(60deg\)/);
 assert.match(mapPage,/<VanoMap poiVisible=\{preferences\?\.poiVisible\}/);
});

test('legal pages retain the four destinations and display selected state',()=>{
 for(const destination of ['/termos-de-uso','/politica-de-privacidade','/seguranca-na-navegacao','/excluir-conta'])assert.ok(legal.includes(destination));
 assert.match(legal,/aria-current=\{page\.path===path\?'page':undefined\}/);
 assert.match(legal,/const HeroIcon=currentDocument\?\.icon/);
 assert.doesNotMatch(legal,/v51-legal-hero-mark/);
 assert.match(legalStyle,/\.v51-legal-tab\.is-current\{border-color:var\(--legal-accent\)/);
 assert.doesNotMatch(legalStyle,/radial-gradient\(circle,rgba\(247,160,104/);
 assert.match(legalStyle,/@media\(max-width:470px\)/);
});

test('privacy and account removal remain functional and have quiet surfaces',()=>{
 assert.match(account,/remove\('\/profile',\{password\}\)/);
 assert.match(account,/aria-label="Confirmar exclusão de conta"/);
 assert.ok(account.includes('<Trash2 size={20}/>'));
 assert.match(account,/onClick=\{\(\)=>\{setDeleteOpen\(true\);setError\(''\);\}\}/);
 assert.match(accountStyle,/\.v92-account-danger\{border-color:var\(--border\);background:var\(--panel\)\}/);
 assert.doesNotMatch(accountStyle,/\.v92-mavi-profile\{[^\n]*linear-gradient/);
});
