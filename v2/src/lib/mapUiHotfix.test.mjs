import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
const navigation=readFileSync(new URL('../components/Navigation.jsx',import.meta.url),'utf8');
const map=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
const base=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const search=readFileSync(new URL('../planner-v3.css',import.meta.url),'utf8');
const night=readFileSync(new URL('../v50-night-system.css',import.meta.url),'utf8');
const credit=readFileSync(new URL('../v40-public-map.css',import.meta.url),'utf8');

test('V2 preview URLs redirect to unchanged original account pages',()=>{
 assert.doesNotMatch(app,/const ProfilePreviewPage=lazy/);
 for(const [from,to] of [['perfil-preview','perfil'],['conta-preview','conta'],['configuracoes-preview','configuracoes']]){
  assert.ok(app.includes('<Route path="/v2/'+from+'" element={<Navigate to="/'+to+'" replace/>}/>'));
 }
 assert.ok(navigation.includes("to:'/perfil',label:'Perfil'"));
 assert.ok(navigation.includes('to="/configuracoes"'));
 assert.doesNotMatch(navigation,/v2\/perfil-preview|v2\/conta-preview|v2\/configuracoes-preview/);
 assert.equal((map.match(/to="\/perfil"/g)||[]).length,2);
 assert.doesNotMatch(map,/to="\/v2\/perfil-preview"/);
});
test('search trigger overrides generic 33px map button without changing its fullscreen behavior',()=>{
 assert.match(base,/\.map-search button\{[^}]*width:33px;height:33px/);
 assert.match(search,/\.map-page \.map-search\.v31-search > \.v3-search-open-button\{[\s\S]*?width:auto;[\s\S]*?height:auto;[\s\S]*?text-align:left;[\s\S]*?text-overflow:ellipsis;/);
 assert.match(map,/className="v3-search-open-button" onClick=\{\(\)=>setSearchOpen\(true\)\}/);
 assert.doesNotMatch(night,/\.map-search\.v31-search>button\{[^}]*flex:0 0 34px/);
 assert.match(night,/\.map-search\.v31-search>button:not\(\.v3-search-open-button\)\{/);
 assert.match(night,/\.map-search\.v31-search>\.v3-search-open-button\{[\s\S]*?flex:1 1 0;[\s\S]*?width:auto;/);
});
test('OSM badge sits below idle location card, remains visible and linked',()=>{
 assert.match(credit,/\.map-page:not\(\.in-navigation\):not\(\.has-sheet\) \.v31-location-card\{[\s\S]*?bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 29px\)/);
 assert.match(credit,/\.map-page:not\(\.in-navigation\):not\(\.has-sheet\) \.v40-map-credit:not\(\.v40-tomtom-credit\)\{[\s\S]*?right:auto;[\s\S]*?bottom:calc\(env\(safe-area-inset-bottom,0px\) \+ 5px\)/);
 assert.doesNotMatch(credit,/\.v40-map-credit\[hidden\]\{display:block/);
});
