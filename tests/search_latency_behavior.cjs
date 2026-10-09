'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/vano-map.js','utf8');
function extract(a,b){const x=source.indexOf(a),y=source.indexOf(b,x+a.length);assert.ok(x>=0&&y>x,a);return source.slice(x,y)}
const queueSrc=extract('function queueSearch(input,kind){','async function searchPlaces(');
const placeSrc=extract('async function searchPlaces(q,kind){','const VANO_MAP_ICONS=');

let task=null, delayMs=0, searches=0, aborts=0, hidden=0, invalidated=0;
const queueContext={
  searchTimer:null,searchRefineTimer:null,searchRequestId:4,
  searchController:{abort(){aborts++}},fastSearchController:{abort(){aborts++}},
  SEARCH_FAST_MIN:3,SEARCH_FAST_DELAY:210,
  activeSearchKind:'destination',
  clearTimeout(){task=null},
  setTimeout(fn,ms){task=fn;delayMs=ms;return 1},
  invalidateSelectedPoint(){invalidated++},
  hideResults(){hidden++},
  clientSearchIntent(q){return q.replace(/\D/g,'').length===8?'cep':'street'},
  searchPlaces(){searches++}
};
vm.createContext(queueContext);vm.runInContext(queueSrc,queueContext);
function type(value){vm.runInContext('queueSearch({value: '+JSON.stringify(value)+'},"destination")',queueContext)}
type('Rua A');assert.equal(delayMs,210);assert.equal(searches,0);
assert.equal(queueContext.searchRequestId,5,'Typing invalidates old requests immediately');
type('Rua Ave');assert.equal(searches,0,'Rapid typing does not fire providers');
assert.equal(queueContext.searchRequestId,6);
task();assert.equal(searches,1,'Only the last debounced search runs');
type('05659');assert.equal(task,null,'Incomplete CEP does not cause a request');
type('05659000');assert.equal(delayMs,100,'Complete CEP gets shorter debounce');
task();assert.equal(searches,2);
assert.ok(aborts>=6&&invalidated>=4&&hidden>=1);

(async()=>{
  let fastResolved=false,painted=[],written=[];
  const search={
    SEARCH_FAST_MIN:3,searchRequestId:20,searchController:null,fastSearchController:null,
    activeSearchKind:'destination',results:{innerHTML:'',classList:{add(){}}},
    performance:{now:()=>50},
    searchBias:()=>null,clientSearchIntent:()=> 'street',getClientSearch:()=>null,
    setSearchOpen(){},requestAnimationFrame(){},syncSearchResultsPlacement(){},
    AbortController,URLSearchParams,
    fastGlobalAddressSearch:()=>new Promise(resolve=>{search.resolveFast=(list)=>{fastResolved=true;resolve(list)}}),
    vanoFetchJSON:async()=>({r:{ok:true},d:{results:[{lat:-23.6,lon:-46.7,label:'Rua correta'}]}}),
    mergeSearchLists:(backend,fast)=>[...backend,...fast],
    setClientSearch:(q,bias,list)=>written.push(list),
    paintSearchList:(kind,list)=>{painted.push(list);return true},
    productTelemetry(){},
    console:{debug(){}}
  };
  vm.createContext(search);vm.runInContext(placeSrc,search);
  await Promise.race([
    vm.runInContext('searchPlaces("Rua correta","destination")',search),
    new Promise((_,reject)=>setTimeout(()=>reject(Error('Backend result blocked by optional fast provider')),400))
  ]);
  assert.equal(painted.length,1,'Backend should paint while fast provider is pending');
  assert.equal(painted[0][0].label,'Rua correta');
  assert.equal(fastResolved,false);
  search.resolveFast([{lat:-23.7,lon:-46.8,label:'Busca tardia'}]);
  await Promise.resolve();await Promise.resolve();
  assert.equal(painted.length,1,'Late fast results must not overwrite backend');
  assert.equal(written.length,1);
  console.log('PASS: input debounce, incomplete CEP, stale cancellation, nonblocking results');
})().catch(err=>{console.error(err);process.exitCode=1});
