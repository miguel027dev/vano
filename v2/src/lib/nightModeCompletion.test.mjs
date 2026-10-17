import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=file('../v50-night-system.css');
const map=file('../pages/MapPage.jsx');
const profile=file('../pages/ProfilePage.jsx');
const entry=file('../main.jsx');
const app=file('../App.jsx');
function rgb(hex){
 const s=hex.replace('#','');
 return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
}
function ratio(a,b){
 const l=x=>rgb(x).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const [hi,lo]=[l(a),l(b)].sort((x,y)=>y-x);
 return (hi+.05)/(lo+.05);
}
test('final complete dark-mode sheet overrides every earlier light stylesheet',()=>{
 const a=entry.indexOf("import './v49-map-appearance.css';");
 const b=entry.indexOf("import './v50-night-system.css';");
 assert.ok(a>=0&&b>a,'v50 must load after v49');
 assert.equal(entry.slice(b+"import './v50-night-system.css';".length).includes("import './"),false);
});
test('profile dark theme covers rendered buttons, account cards and headings',()=>{
 for(const component of ['v4-profile-intro','v4-route-feature','v4-action-row',
  'v4-stat-strip','v4-empty-link','v4-icon-button','v4-place-chip','v4-recent-trip']){
  assert.ok(profile.includes(component),'profile does not contain '+component);
  assert.ok(css.includes(component),'night theme lacks '+component);
 }
 assert.match(css,/\.v4-route-feature-image img\{[\s\S]*?mix-blend-mode:normal/);
 assert.match(css,/\[data-theme='dark'\] \.side-nav\{[\s\S]*?!important/);
 assert.match(css,/\.bottom-nav\.v5-bottom-nav/);
});
test('search, profile link, results, clear/search buttons remain readable at night',()=>{
 for(const component of ['v31-search','v31-profile-button','v32-results','v32-suggestion',
   'v32-result-icon','v5-editor','v5-point-popover','v5-point-label']){
  assert.ok(map.includes(component),'map UI changed: '+component);
  assert.ok(css.includes(component),'dark map missing '+component);
 }
 assert.ok(css.includes('-webkit-text-fill-color:var(--v50-text)'));
 assert.ok(css.includes("caret-color:#ffb080"));
 assert.ok(css.includes('@media(max-width:375px)'));
});
test('navigation and route alternatives use one night palette without altering calculation',()=>{
 for(const component of ['route-option','v47-route-vehicle-switch','v37-nav-bottom',
   'v36-nav-road-pill','v28-nav-copy','v37-nav-arrival']){
  assert.ok(map.includes(component),'map lacks '+component);
  assert.ok(css.includes(component),'dark route sheet lacks '+component);
 }
 assert.match(map,/onClick=\{toggleMapAppearance\}/);
 assert.match(map,/savePreference\(\{theme:next\}\)/);
 assert.match(app,/document\.documentElement\.dataset\.theme=theme/);
 assert.ok(!css.includes('display:none!important'));
 assert.ok(!css.includes('pointer-events:none'));
});
test('night palette meets minimum WCAG AA contrast for small text',()=>{
 assert.ok(ratio('#eaf2f5','#1e2c33')>=7);
 assert.ok(ratio('#b4c4cc','#1e2c33')>=4.5);
 assert.ok(ratio('#eaf2f5','#26363e')>=7);
 assert.ok(ratio('#aebdc6','#10171b')>=4.5);
});
