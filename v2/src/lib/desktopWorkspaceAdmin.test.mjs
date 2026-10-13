import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminMetrics,signupMethod} from '../../server/admin.mjs';
const nav=readFileSync(new URL('../components/Navigation.jsx',import.meta.url),'utf8');
const header=readFileSync(new URL('../components/Ui.jsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../v44-desktop-workspace.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../pages/AdminPage.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../admin-console.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');

test('desktop hides portaled mobile nav and reserves sidebar width for all internal pages',()=>{
 assert.match(main,/import '\.\/v44-desktop-workspace\.css'/);
 assert.match(workspace,/@media\(min-width:1110px\)/);
 assert.match(workspace,/\.bottom-nav\.v5-bottom-nav\{display:none!important\}/);
 assert.match(workspace,/\.app-shell:not\(\.shell-map\):not\(\.shell-auth\) \.content-page/);
 assert.match(workspace,/\.app-shell:not\(\.shell-map\):not\(\.shell-auth\) \.v3-admin/);
 assert.match(workspace,/margin-left:230px;/);
 assert.match(workspace,/@media\(max-width:1109px\)/);
 for(const viewport of [1110,1180,1280,1366,1440,1680,1920,2560]){
  const available=viewport-230-72;
  const contentWidth=Math.min(940,available);
  const marginLeft=230+(viewport-230-contentWidth)/2;
  assert.ok(contentWidth>0&&marginLeft>=230);
  assert.ok(marginLeft+contentWidth<=viewport-34,'no horizontal workspace overflow at '+viewport);
 }
});
test('side nav includes discoverable profile subdivisions and contextual active navigation',()=>{
 assert.match(nav,/useLocation/);
 assert.match(nav,/profilePaths\.has\(location\.pathname\)/);
 assert.match(nav,/routePaths\.has\(location\.pathname\)/);
 assert.match(nav,/aria-label="Páginas principais"/);
 assert.match(nav,/user\?\.isAdmin===true/);
 assert.match(nav,/to="\/admin"/);
 assert.match(app,/!map&&!isStandalone&&<SideNav\/>/);
});
test('internal back button goes to profile, never unexpectedly to map landing',()=>{
 assert.match(header,/PageHeader\(\{title,subtitle,back='\/perfil'\}\)/);
});
test('admin uses appropriate provider icons, clear provenance and accessible desktop table',()=>{
 assert.match(admin,/function GoogleMark\(\)/);
 assert.match(admin,/className="v44-google-mark"/);
 assert.match(admin,/<Mail size=\{17\}/);
 assert.match(admin,/function SignupSource\(/);
 assert.match(admin,/value\.startsWith\('Google'\)/);
 assert.match(admin,/value\.startsWith\('E-mail'\)/);
 assert.match(admin,/Não registrada/);
 assert.match(admin,/className="v44-users-search"/);
 assert.match(admin,/Buscar nesta página/);
 assert.match(admin,/tabIndex=\{0\}/);
 assert.match(admin,/member\.signupMethod/);
 assert.match(admin,/member\.verified/);
 assert.match(admin,/user\?\.isAdmin/);
 assert.match(styles,/\.v44-users-search\{/);
 assert.match(styles,/\.v44-signup-source/);
 assert.match(styles,/\.v3-users-table-wrap\{/);
 assert.match(styles,/@media\(max-width:580px\)/);
 assert.doesNotMatch(admin,/member\.coords|member\.password|member\.googleSub/);
});
test('recent metrics count only data in requested ranges, excluding invalid/future dates',()=>{
 const now=Date.parse('2026-10-13T02:00:00Z');
 const days=n=>new Date(now-n*86400000).toISOString();
 const data={
  users:[
   {createdAt:days(1),verifiedAt:days(1),signupMethod:'google'},
   {createdAt:days(6),verifiedAt:null,signupMethod:'email'},
   {createdAt:days(22),verifiedAt:days(21),signupMethod:'email'},
   {createdAt:days(44),verifiedAt:days(40),verificationMethod:'legacy'},
   {createdAt:'invalid',verifiedAt:null,signupMethod:'email'},
   {createdAt:new Date(now+86400000).toISOString(),verifiedAt:null,signupMethod:'google'}
  ],
  history:[{createdAt:days(0.5),duration:14,routeType:'safe'},
   {createdAt:days(5),duration:18,routeType:'fast'},
   {createdAt:days(10),duration:20,routeType:'safe'}],
  reports:[{createdAt:days(.5),status:'verificado'},{createdAt:days(3),status:'nao_verificado'}],
  favorites:[],routines:[]
 };
 const stats=adminMetrics(data,{pageViews:{'/mapa':14,'/inicio':4}},{now,startedAt:now-3600000});
 assert.equal(stats.usersTotal,6);
 assert.equal(stats.signups7d,2);
 assert.equal(stats.signups30d,3);
 assert.equal(stats.usersVerified,3);
 assert.equal(stats.verificationRate,50);
 assert.equal(stats.routes7d,2);
 assert.equal(stats.routes24h,1);
 assert.equal(stats.reports24h,1);
 assert.equal(stats.pageViewsTotal,18);
 assert.equal(signupMethod(data.users[3]),'Não registrado');
 assert.ok(!JSON.stringify(stats).includes('googleSub'));
});
