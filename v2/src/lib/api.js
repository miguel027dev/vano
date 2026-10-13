import {readOffline,writeOffline,cachedBootstrap} from './offlineStore.js';
import { formatTravelTime } from './formatTime.mjs';
const BASE = import.meta.env.VITE_API_URL || '/api';
let csrfToken = '';
let csrfBootstrap = null;
async function initializeCsrf(){
  if (csrfToken) return csrfToken;
  if (!csrfBootstrap) csrfBootstrap = fetch(`${BASE}/bootstrap`, { credentials:'include' }).then(async r => {
    if (!r.ok) throw new Error('Falha na inicialização da sessão segura.');
    const data = await r.json(); csrfToken = data.csrfToken || ''; return csrfToken;
  }).finally(()=>{csrfBootstrap=null;});
  return csrfBootstrap;
}
export async function api(path, opts = {}) {
  const write = Boolean(opts.method && opts.method.toUpperCase() !== 'GET');
  if (write){try{await initializeCsrf();}catch(cause){const failure=new Error('Este recurso precisa de conexão. Seu trajeto atual continua salvo.');failure.offline=true;throw failure;}}
  const init = { credentials:'include', ...opts, headers: { ...(opts.body ? {'Content-Type':'application/json'} : {}), ...(write ? {'X-VANO-CSRF':csrfToken} : {}), ...opts.headers } };
  if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
  let res;
  try{res=await fetch(`${BASE}${path}`,init);}catch(error){
    if(!write&&['/bootstrap','/places'].includes(path)){const cached=await readOffline(path.slice(1));if(cached)return path==='/bootstrap'?{...cached,offline:true}:cached;}
    const failure=new Error('Este recurso precisa de conexão. Seu trajeto atual continua salvo.');failure.offline=true;throw failure;
  }
  if(!write&&res.status>=500&&['/bootstrap','/places'].includes(path)){const cached=await readOffline(path.slice(1));if(cached)return path==='/bootstrap'?{...cached,offline:true}:cached;}
  const data = await res.json().catch(()=>({ error: 'O servidor retornou uma resposta inválida.' }));
  if (data.csrfToken) csrfToken = data.csrfToken;
  if(res.ok&&!write&&['/bootstrap','/places'].includes(path))await writeOffline(path.slice(1),path==='/bootstrap'?cachedBootstrap(data):data);
  if (!res.ok) { if(res.status === 403 && String(data.error || '').includes('segurança')) csrfToken=''; throw new Error(data.error || `Erro ${res.status}`); }
  return data;
}
export const post = (path,body) => api(path, { method:'POST',body });
export const patch = (path,body) => api(path, { method:'PATCH',body });
export const remove = (path,body = {}) => api(path, {method:'DELETE',body});
export function timeAgo(iso,locale='pt-BR') { const d=Date.now()-new Date(iso).getTime(), mins=Math.max(0,Math.floor(d/60000)); if(mins<1)return locale==='fr-FR'?'à l’instant':locale==='en-US'?'just now':'agora'; if(mins<60)return locale==='fr-FR'?`il y a ${mins} min`:locale==='en-US'?`${mins} min ago`:`há ${mins} min`; if(mins<1440)return locale==='fr-FR'?`il y a ${Math.floor(mins/60)} h`:locale==='en-US'?`${Math.floor(mins/60)} h ago`:`há ${Math.floor(mins/60)} h`; return new Date(iso).toLocaleDateString(locale); }
export const fmtKm = (n,locale='pt-BR') => `${Number(n || 0).toLocaleString(locale,{maximumFractionDigits:1})} km`;
export const fmtTime = formatTravelTime;
