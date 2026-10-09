'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/vano-onboarding.js','utf8');
function section(from,to){
  const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
  assert.ok(a>=0&&b>a,'Missing onboarding function boundary');
  return source.slice(a,b);
}
const errorNodes=[];
const makeNode=()=>({
  classList:{remove(value){errorNodes.push(['class',value])}},
  removeAttribute(value){errorNodes.push(['attribute',value])},
  remove(){errorNodes.push(['element','removed'])}
});
const errors={
  '.ob-invalid-v340':[makeNode(),makeNode()],
  '[aria-invalid="true"]':[makeNode(),makeNode()],
  '.ob-inline-error-v340':[makeNode(),makeNode()]
};
let onContinue=null,invalidCalls=0;
const stepButton={addEventListener(event,fn){if(event==='click')onContinue=fn}};
const ctx={
  form:{}, current:1,
  $$:(selector)=>selector==='[data-ob-next]'?[stepButton]:(errors[selector]||[]),
  $:()=>null,
  name:{value:'Pessoa Teste'},
  age:{value:'16'},
  sexInputs:[{checked:true,value:'prefer_not_say'}],
  routeInputs:[{checked:true,value:'balanced'}],
  mapInputs:[{checked:true,value:'auto'}],
  localeInputs:[{checked:true,value:'pt-BR'}],
  selected:inputs=>inputs.find(i=>i.checked)?.value||'',
  invalidate:()=>{invalidCalls++;return false},
  setStep:n=>{ctx.current=n}
};
vm.createContext(ctx);
const clearSource=section('function clearErrors(){','function invalidate(');
const validateSource=section('function validateStep(','function updateProfile(');
vm.runInContext(clearSource+'\n'+validateSource,ctx);
const start=source.indexOf("$$('[data-ob-next]',form).forEach(");
assert.ok(start>=0,'Continue click handler missing');
const end=source.indexOf("}));",start)+4;
assert.ok(end>start,'Continue click handler incomplete');
vm.runInContext(source.slice(start,end),ctx);
assert.equal(typeof onContinue,'function','Continue button has no click handler');
onContinue();
assert.equal(ctx.current,2,'Continue should advance from Perfil to Preferências');
assert.equal(errorNodes.length,12,'All invalid markers must be cleared at each step');
onContinue();
assert.equal(ctx.current,3,'Continue should advance from Preferências to Revisão');
ctx.current=1;ctx.name.value='';
onContinue();
assert.equal(ctx.current,1,'Invalid profile must not advance');
assert.equal(invalidCalls,1,'Invalid profile must display feedback');
console.log('PASS: first-run Continue button advances, clears errors and validates bad data');
