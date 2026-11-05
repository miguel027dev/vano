import {mountPartnerMap} from './partner-map-app.js';
const parameters=new URLSearchParams(location.hash.slice(1)),token=parameters.get('session');
const destination=parameters.get('destination')||parameters.get('address')||parameters.get('query')||parameters.get('q')||undefined;
history.replaceState(null,'',location.pathname);
const container=document.querySelector('#vano-map');
if(!token)container.textContent='Sessão ausente. Reabra o mapa pela integração.';
else{container.replaceChildren();void mountPartnerMap(container,{token,apiBase:location.origin+'/api/partner/v1',shadow:false,destination});}
