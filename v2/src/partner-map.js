import {mountPartnerMap} from './partner-map-app.js';
const token=new URLSearchParams(location.hash.slice(1)).get('session');
history.replaceState(null,'',location.pathname);
const container=document.querySelector('#vano-map');
if(!token)container.textContent='Sessão ausente. Reabra o mapa pela integração.';
else{container.replaceChildren();void mountPartnerMap(container,{token,apiBase:location.origin+'/api/partner/v1',shadow:false});}
