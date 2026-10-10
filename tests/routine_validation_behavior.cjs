'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('static/vano-routine.js','utf8');
function between(a,b){const start=code.indexOf(a),end=code.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return code.slice(start,end);}
const cls={add(){},remove(){},toggle(){}};
const box={classList:{add(){this.show=true},remove(){this.show=false},show:false},innerHTML:''};
let selected={dataset:{lat:'',lon:''},classList:cls,querySelector(sel){
  if(sel==='[data-routine-address]')return {value:'Rua Augusta, 100'};
  if(sel==='[data-routine-time]')return {value:'12:00'};
  if(sel==='[data-routine-results]')return box;
  if(sel==='[data-routine-use]')return {disabled:true,classList:cls};
  if(sel==='.vano-routine-address-wrap')return {classList:cls};
  return null;
}};
let pendingFetch,fetchCalls=0;
const c={
  empty:()=>Array.from({length:7},(_,weekday)=>({weekday,label:'',lat:null,lon:null,time:'',enabled:true})),
  searchAbort:null,searchTimer:0,searchRevision:0,
  row:()=>selected,
  mapBridge:()=>null,
  sheet:{classList:{contains:()=>true}},
  URLSearchParams,AbortController,Number,String,Array,Math,
  fetch:()=>{fetchCalls++;return new Promise(resolve=>{pendingFetch=resolve})},
  esc:s=>String(s),window:{lucide:null},lucide:null,
};
vm.createContext(c);
vm.runInContext(between('  let days=empty()','  function toast('),c);
vm.runInContext(between('  function normalize(','  function localLoad('),c);
vm.runInContext(between('  function rowHtml(','  function renderRows('),c);
vm.runInContext(between('  function clearRowCoords(','  function bindRows('),c);
vm.runInContext(between('  function placeFromRow(','  function useRow('),c);
vm.runInContext(between('  function collect(','  async function save('),c);

assert.equal(c.validCoordinate(null,null),false);
assert.equal(c.validCoordinate('',''),false);
assert.equal(c.validCoordinate('0','0'),false);
assert.equal(c.validCoordinate(-23.55,-46.63),true);
assert.equal(c.validCoordinate(92,45),false);
assert.equal(c.validCoordinate(-23.55,202),false);
const data=c.normalize([{weekday:0,label:'Rua sem coordenada',lat:null,lon:null},{weekday:1,label:'Rua válida',lat:-23.55,lon:-46.63}]);
assert.equal(data[0].lat,null,'Unselected destination must not become latitude 0');
assert.equal(data[0].lon,null);
assert.equal(data[1].lat,-23.55);
assert.equal(c.placeFromRow(0).lat,null,'Empty dataset.lat must stay null');
assert.equal(c.placeFromRow(0).lon,null,'Empty dataset.lon must stay null');
assert.equal(c.collect(),null,'Cannot save a typed address without selecting a suggestion');
selected.dataset.lat='-23.55';selected.dataset.lon='-46.63';
const chosen=c.placeFromRow(0);assert.equal(chosen.lat,-23.55);assert.equal(chosen.lon,-46.63);
assert.equal(c.collect().length,7,'Selected valid destination may be saved');
selected.dataset.lat='';selected.dataset.lon='';

(async()=>{
  const promise=c.searchAddress(0,'Rua Augusta');
  assert.equal(fetchCalls,1);
  assert.equal(box.classList.show,true);
  c.clearRowCoords(0);
  assert.equal(box.classList.show,false,'Changing input hides stale suggestion list immediately');
  pendingFetch({ok:true,json:async()=>({results:[{label:'Endereço antigo',lat:-23.55,lon:-46.63}]})});
  await promise;
  assert.equal(box.classList.show,false,'Stale results cannot return after text edit');
  assert.ok(!box.innerHTML.includes('Endereço antigo'));
  const short=c.searchAddress(0,'12');
  await short;assert.equal(fetchCalls,1,'Short/erased query does not call backend');
  console.log('PASS: routine coordinates, valid saves, stale search cancellation and short query');
})().catch(e=>{console.error(e);process.exitCode=1});
