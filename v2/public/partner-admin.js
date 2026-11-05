const result=document.querySelector('#result'),keys=document.querySelector('#keys');
let csrf='';
async function call(url,method='GET',body){
 const r=await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-VANO-CSRF':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw Error(data.error?.message||data.error||'Falha na operação.');return data;
}
async function load(){
 const bootstrap=await call('/api/bootstrap');csrf=bootstrap.csrfToken;
 const response=await call('/api/admin/partner-keys');keys.replaceChildren();
 for(const k of response.data.items){
  const row=document.createElement('article'),name=document.createElement('strong'),info=document.createElement('p');
  name.textContent=k.name+' — '+(k.active?'ativa':'revogada');info.textContent=k.id+' · '+k.origins.join(', ');row.append(name,info);
  if(k.active)for(const [label,method,suffix]of [['Revogar','DELETE',''],['Substituir chave','POST','/rotate']]){
   const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=async()=>{
    if(!confirm(label+' de '+k.name+'? Sessões e referências antigas deixarão de funcionar.'))return;
    b.disabled=true;try{const r=await call('/api/admin/partner-keys/'+k.id+suffix,method);result.textContent=r.data.api_key?'Copie agora. A chave não será exibida novamente:\n'+r.data.api_key:'Chave revogada.';await load();}catch(e){result.textContent=e.message;b.disabled=false;}
   };row.append(b);
  }keys.append(row);
 }
}
document.querySelector('#key-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
 try{const name=document.querySelector('#name').value,origin=document.querySelector('#origin').value.trim();const r=await call('/api/admin/partner-keys','POST',{name,origins:[origin]});result.textContent='Copie e entregue por canal privado. A chave aparece uma única vez:\n'+r.data.api_key;await load();}catch(e){result.textContent=e.message;}finally{button.disabled=false;}
});
load().catch(e=>{result.textContent=e.message;});
