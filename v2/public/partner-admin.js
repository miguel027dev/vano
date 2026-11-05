const result=document.querySelector('#result'),keys=document.querySelector('#keys');
const scopeOptions=document.querySelector('#scope-options');
let csrf='',scopeCatalog=[];
async function call(url,method='GET',body){
 const r=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-VANO-CSRF':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw Error(data.error?.message||data.error||'Falha na operação.');return data;
}
function renderScopes(catalog,defaults){
 scopeOptions.replaceChildren();scopeCatalog=Array.isArray(catalog)?catalog:[];
 const defaultSet=new Set(defaults||[]);
 for(const item of scopeCatalog){
  const option=document.createElement('label');option.className='scope-option';
  const box=document.createElement('input');box.type='checkbox';box.name='scope';box.value=item.id;box.checked=defaultSet.has(item.id);
  const body=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');
  name.textContent=item.label;description.textContent=item.description;
  body.append(name,description);option.append(box,body);scopeOptions.append(option);
 }
}
function selectedScopes(){return [...scopeOptions.querySelectorAll('input[name="scope"]:checked')].map(x=>x.value);}
async function load(){
 const bootstrap=await call('/api/bootstrap');csrf=bootstrap.csrfToken;
 const response=await call('/api/admin/partner-keys');
 if(!scopeOptions.childElementCount)renderScopes(response.data.scope_catalog,response.data.default_scopes);
 const scopeNames=new Map(scopeCatalog.map(item=>[item.id,item.label]));
 keys.replaceChildren();
 for(const k of response.data.items){
  const row=document.createElement('article'),name=document.createElement('strong'),info=document.createElement('p'),permissions=document.createElement('p');
  name.textContent=k.name+' — '+(k.active?'ativa':'revogada');
  info.textContent=k.id+' · '+k.origins.join(', ');
  permissions.className='key-scopes';permissions.textContent='Autorizado: '+k.scopes.map(id=>scopeNames.get(id)||id).join(' · ');
  row.append(name,info,permissions);
  if(k.active)for(const [label,method,suffix]of [['Revogar','DELETE',''],['Substituir chave','POST','/rotate']]){
   const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=async()=>{
    if(!confirm(label+' de '+k.name+'? Sessões e referências antigas deixarão de funcionar.'))return;
    b.disabled=true;try{const r=await call('/api/admin/partner-keys/'+k.id+suffix,method);result.textContent=r.data.api_key?'Copie agora. A chave não será exibida novamente:\n'+r.data.api_key:'Chave revogada.';await load();}catch(e){result.textContent=e.message;b.disabled=false;}
   };row.append(b);
  }keys.append(row);
 }
}
document.querySelector('#key-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
 try{
  const name=document.querySelector('#name').value,origin=document.querySelector('#origin').value.trim(),scopes=selectedScopes();
  if(!scopes.length)throw Error('Selecione pelo menos uma permissão para a chave.');
  const r=await call('/api/admin/partner-keys','POST',{name,origins:[origin],scopes});
  result.textContent='Copie e entregue por canal privado. A chave aparece uma única vez:\n'+r.data.api_key;
  event.target.reset();await load();
 }catch(e){result.textContent=e.message;}finally{button.disabled=false;}
});
load().catch(e=>{result.textContent=e.message;});
