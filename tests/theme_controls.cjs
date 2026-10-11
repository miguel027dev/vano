'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/vano-theme.js', 'utf8');
const boot = fs.readFileSync('templates/_theme_boot.html', 'utf8').split('<script>')[1].split('</script>')[0];
const KEY = 'vano.theme.mode.v200';
function run(saved = {}, blocked = false) {
  const data = new Map(Object.entries(saved)), events = [], handlers = {}, docHandlers = {};
  const root = {dataset:{},style:{}};
  const node = () => ({attrs:{},dataset:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;}});
  const controls = Array.from({length:7},node), meta=node(), state={}, timezone={};
  const document = {documentElement:root,body:{dataset:{}},
    querySelector:() => meta,
    querySelectorAll:s => ({'[data-vano-theme-toggle]':controls,'[data-theme-state]':[state],'[data-theme-timezone]':[timezone]})[s] || [],
    addEventListener:(type,fn) => {docHandlers[type]=fn;}};
  const storage = {getItem:k=>{if(blocked)throw Error('Storage blocked');return data.get(k)||null;},
    setItem:(k,v)=>{if(blocked)throw Error('Storage blocked');data.set(k,v);},
    removeItem:k=>{if(blocked)throw Error('Storage blocked');data.delete(k);}};
  const window = {dispatchEvent:e=>events.push(e),addEventListener:(type,fn)=>{handlers[type]=fn;}};
  const context=vm.createContext({document,window,localStorage:storage,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}}});
  vm.runInContext(boot,context);
  const firstPaint=root.dataset.vanoTheme;
  vm.runInContext(source,context);
  const click = i=>docHandlers.click({target:{closest:s=>s==='[data-vano-theme-toggle]'?controls[i]:null},preventDefault(){}});
  return {data,root,controls,meta,events,handlers,docHandlers,window,firstPaint,click,state,timezone};
}
for(const mode of ['light','black']) {
  const p=run({[KEY]:mode,'vano.theme.mode.v60':mode==='black'?'light':'black'});
  assert.equal(p.firstPaint,mode,'Saved theme must be applied before the first paint');
  assert.equal(p.root.dataset.vanoTheme,mode);
  assert.equal(p.root.style.colorScheme,mode==='black'?'dark':'light');
  for(let i=0;i<7;i++) {
    const expected=p.root.dataset.vanoTheme==='black'?'light':'black';
    p.click(i);
    assert.equal(p.root.dataset.vanoTheme,expected,'Every variant must toggle the same preference');
    assert.equal(p.data.get(KEY),expected);
    for(const control of p.controls) {
      assert.equal(control.attrs['aria-pressed'],expected==='black'?'true':'false');
      assert.equal(control.attrs['aria-label'], expected==='black'?'Ativar tema claro':'Ativar tema escuro');
    }
    assert.equal(p.events.at(-1).detail.reason,'manual');
    assert.equal(run(Object.fromEntries(p.data)).firstPaint,expected,'Next navigation must retain the preference');
  }
  assert.equal(p.data.has('vano.theme.mode.v60'),false,'Legacy preference cannot override a saved choice');
}
const legacy=run({'vano.theme.mode.v60':'black'});
assert.equal(legacy.firstPaint,'black');
assert.equal(legacy.root.dataset.vanoTheme,'black');
assert.equal(run({[KEY]:'invalid','vano.theme.mode.v60':'black'}).firstPaint,'black');
const blocked=run({},true);
blocked.click(0);
blocked.docHandlers.DOMContentLoaded();
blocked.handlers.pageshow();
assert.equal(blocked.window.VANOTheme.getMode(),'black','Storage failure must not reset the active choice');
const tabs=run();
tabs.data.set(KEY,'black'); tabs.handlers.storage({key:KEY});
assert.equal(tabs.root.dataset.vanoTheme,'black','Other tabs must synchronize');
assert.equal(tabs.events.at(-1).detail.reason,'storage');
tabs.data.clear(); tabs.handlers.storage({key:null});
assert.equal(tabs.root.dataset.vanoTheme,'light','Clearing saved settings must synchronize');
tabs.data.set(KEY,'black'); tabs.handlers.pageshow();
assert.equal(tabs.root.dataset.vanoTheme,'black','Back/forward restoration must refresh');
for (const filename of ['vano-map.js','vano-map-fallback.js']) {
  const mapSource=fs.readFileSync('static/'+filename,'utf8');
  const functionSource=mapSource.match(/function moodFromConditions\(weather\)\{[\s\S]*?\n\}/)[0];
  for (const mode of ['black','light']) {
    const context=vm.createContext({window:{VANOTheme:{get:()=>mode}},
      document:{documentElement:{dataset:{vanoTheme:mode}}},
      mapThemeOverride:mode==='black'?'day':'night',MAP_STYLE_MODE:'night',REACTIVE_BLACK_ALLOWED:true});
    vm.runInContext(functionSource,context);
    const expected=mode==='light'?'day':filename==='vano-map.js'?'black':'night';
    assert.equal(vm.runInContext('moodFromConditions({is_day:0,rainy:true})',context),expected,
      'Map must retain the selected theme after weather updates and obsolete overrides');
  }
}
console.log('PASS: seven theme variants, first paint, navigation, storage, accessibility and failure fallback');
