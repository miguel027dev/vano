/** Only short-lived map tokens may enter browser bundles. */
export function createPartnerSessionClient({token,baseURL,fetcher=fetch,onRenew=()=>{},onExpired=null}){
 if(typeof token!=='string'||!token||token.startsWith('vp_'))throw Error('Use browser_token de map-sessions, nunca a chave permanente.');
 const base=new URL(baseURL);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('API exige HTTPS.');
 let current=token,renewal=null,closed=false;
 async function request(path,{method='GET',body,signal}={}){
  if(closed)throw Error('Mapa encerrado.');
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw Error('Endpoint inválido.');
  const response=await fetcher(base.href.replace(/\/$/,'')+path,{method,credentials:'omit',signal,headers:{Authorization:'Bearer '+current,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();
  if(!response.ok){const e=new Error(payload.error?.message||'Não foi possível consultar o VANO.');e.status=response.status;e.code=payload.error?.code;e.requestId=payload.meta?.request_id;throw e;}
  return payload.data;
 }
 async function renew(){
  if(renewal)return renewal;
  renewal=(async()=>{try{const next=await request('/map-sessions/renew',{method:'POST'});current=next.browser_token;onRenew(next);return next;}
   catch(e){if((e.status===410||e.status===401)&&onExpired){const next=await onExpired();if(next?.browser_token&&!next.browser_token.startsWith('vp_')){current=next.browser_token;onRenew(next);return next;}}throw e;}
  })().finally(()=>{renewal=null;});return renewal;
 }
 return {request,renew,close(){closed=true;},async overlayRequest(path,options={}){
  const u=new URL(path,'https://map.invalid');const query=new URLSearchParams({service:u.pathname.replace(/^\/api\//,''),bbox:u.searchParams.get('bbox')||''});
  const data=await request('/map-data?'+query,{signal:options.signal});return {ok:true,status:200,json:async()=>data};
 }};
}
