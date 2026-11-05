/** Partner boundary. Keys are persisted hashed; geographic references are sealed,
 * short-lived requests, never stored provider snapshots. Single-instance like app_state. */
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {pointOK} from './routing.mjs';
import {createLimiter,cleanText,reportPublic} from './security.mjs';
import {parseBBox} from './map-public-data.mjs';
import {isReportType,reportType,publicReportsInBBox,recordReportFeedback,metersApart} from '../src/lib/communityReports.js';
import {partnerOpenAPI} from './partner-openapi.mjs';
import {partnerPlace,partnerAddress} from '../src/lib/partnerInputs.mjs';

export const PARTNER_BASE='/api/partner/v1';
export const PARTNER_SCOPES=['map:read','places:read','routes:read','traffic:read','pois:read','context:read','benchmarks:read','transit:read','reports:read','reports:write'];
export const DEFAULT_PARTNER_SCOPES=PARTNER_SCOPES.filter(x=>x!=='reports:write');
const MODES={car:'carro',motorcycle:'moto',walking:'a-pe'};
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const TTL=300_000;
export class PartnerError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new PartnerError(status,code,message);};
const object=x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x));
function fields(b,allowed){if(!object(b)||Object.keys(b).some(k=>!allowed.includes(k)))fail(422,'INVALID_FIELDS','Confira os campos enviados.');}
function int(x,min,max,fallback){const n=x??fallback;if(!Number.isInteger(n)||n<min||n>max)fail(422,'INVALID_LIMIT','Número fora do limite.');return n;}
function point(x){if(!object(x)||!pointOK([x.lng,x.lat]))fail(422,'INVALID_COORDINATES','Envie coordenadas numéricas válidas em lat e lng.');return [x.lng,x.lat];}
function text(x,min,max){if(typeof x!=='string'||x.trim().length<min||x.length>max||/[\u0000-\u001f\u007f]/.test(x))fail(422,'INVALID_TEXT','Texto inválido.');return cleanText(x,max);}
export function partnerOrigin(x,production=true){
 try{const u=new URL(x);return u.origin===x&&!u.username&&!u.password&&(u.protocol==='https:'||!production&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{return false;}
}
export function parsePartnerRoute(b){
 fields(b,['origin','destination','mode','profile','alternatives','waypoints','avoid','departure_at','language']);
 const origin=point(b.origin),destination=point(b.destination),mode=b.mode??'car',profile=b.profile??'fastest';
 if(!Object.hasOwn(MODES,mode)||!['fastest','safe'].includes(profile)||mode==='walking'&&profile==='safe')fail(422,'UNSUPPORTED_PROFILE','Modo ou perfil não suportado.');
 if(b.waypoints!==undefined&&(!Array.isArray(b.waypoints)||b.waypoints.length))fail(422,'UNSUPPORTED_WAYPOINTS','Pontos intermediários ainda não são suportados.');
 if(b.departure_at!==undefined&&b.departure_at!=='now')fail(422,'UNSUPPORTED_DEPARTURE','Use departure_at igual a now.');
 const avoid=b.avoid??[];
 if(!Array.isArray(avoid)||avoid.length>3||new Set(avoid).size!==avoid.length||avoid.some(x=>!['tolls','ferries','unpaved'].includes(x))||mode==='walking'&&avoid.some(x=>x!=='ferries'))fail(422,'UNSUPPORTED_AVOID','Preferência de exclusão indisponível para esse modo.');
 if(b.language!==undefined&&b.language!=='pt-BR')fail(422,'UNSUPPORTED_LANGUAGE','Esta versão usa pt-BR.');
 return {origin,destination,mode,profile,alternatives:int(b.alternatives,0,2,1),avoid};
}
async function readBody(req){
 if((req.headers['content-type']||'').toLowerCase().split(';')[0].trim()!=='application/json')fail(415,'JSON_REQUIRED','Envie Content-Type application/json.');
 let size=0,chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>16384)fail(413,'BODY_TOO_LARGE','Corpo limitado a 16 KiB.');chunks.push(chunk);}
 try{const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!object(b))throw Error();return b;}catch{fail(400,'INVALID_JSON','JSON inválido.');}
}
export function createPartnerAPI({db,persist,secret,origin,production=false,persistent=false,headers={},services={},admin=()=>false,csrfGuard=()=>false,clock=Date.now,enabled=true}){
 db.partnerKeys??=[];
 const limiter=createLimiter(),encryptionKey=createHash('sha256').update('vano-partner-v1:'+secret).digest();
 let inFlight=0,writeQueue=Promise.resolve();
 const active=k=>k&&k.active===true;
 const publicKey=k=>({id:k.id,name:k.name,origins:k.origins,scopes:k.scopes,active:k.active,created_at:k.createdAt,version:k.version});
 function seal(payload){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',encryptionKey,iv);const enc=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),enc]).toString('base64url');}
 function open(raw,type){
  if(typeof raw!=='string'||raw.length>6000||!/^[A-Za-z0-9_-]+$/.test(raw))fail(404,'REFERENCE_NOT_FOUND','Referência inválida.');
  let b;try{const buf=Buffer.from(raw,'base64url'),c=createDecipheriv('aes-256-gcm',encryptionKey,buf.subarray(0,12));c.setAuthTag(buf.subarray(12,28));b=JSON.parse(Buffer.concat([c.update(buf.subarray(28)),c.final()]).toString('utf8'));}catch{fail(404,'REFERENCE_NOT_FOUND','Referência inválida.');}
  if(b.type!==type)fail(404,'REFERENCE_NOT_FOUND','Referência inválida.');
  if(b.expires<=clock())fail(410,'REFERENCE_EXPIRED','Referência expirada. Solicite novamente.');
  const k=db.partnerKeys.find(x=>x.id===b.partner);
  if(!active(k)||k.version!==b.version)fail(401,'CREDENTIAL_REVOKED','Credencial revogada.');
  return {body:b,key:k};
 }
 const ref=(k,type,data)=>seal({type,partner:k.id,version:k.version,expires:clock()+TTL,...data});
 async function resolvePlace(k,value,proximity=null){
  const direct=partnerPlace(value);if(direct)return direct;
  if(typeof value?.place_id==='string'){scope(k,'places:read');return partnerPlace(own(value.place_id,'place',k).place);}
  const query=partnerAddress(value);if(!query)fail(422,'INVALID_COORDINATES','Envie coordenadas, place_id ou endereço.');
  scope(k,'places:read');quota('places:'+k.id,120);
  const result=await services.search(query,'pt-BR',proximity,{limit:10});const first=result.map(partnerPlace).find(Boolean);
  if(!first)fail(422,'ADDRESS_NOT_FOUND','Endereço não encontrado. Inclua número, bairro e cidade.');
  return {...first,resolved:true};
 }
 function own(raw,type,k){const x=open(raw,type);if(x.key.id!==k.id)fail(404,'REFERENCE_NOT_FOUND','Referência inválida.');return x.body;}
 function scope(k,s){if(!k.scopes.includes(s))fail(403,'SCOPE_REQUIRED','Permissão não concedida: '+s);}
 function quota(name,max){const result=limiter(name,max,60000);if(!result.allowed){const e=new PartnerError(429,'RATE_LIMITED','Limite temporário atingido.');e.retryAfter=result.retryAfter;throw e;}}
 function authenticate(req){
  const bearer=String(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
  if(bearer&&!bearer.startsWith('vp_')){
   const {body:b,key:k}=open(bearer,'map');
   const from=req.headers.origin;
   if(from&&from!==origin&&!(k.origins.includes(from)&&(!b.allowed_origin||b.allowed_origin===from)))fail(403,'ORIGIN_NOT_REGISTERED','Origem não cadastrada para esta sessão.');
   if(!from&&req.headers['sec-fetch-site']==='cross-site')fail(403,'ORIGIN_REQUIRED','Origem da integração ausente.');
   quota('browser:'+hash(bearer).slice(0,24),180);quota('browser-partner:'+k.id,1800);
   req.vanoPartnerSession=b;
   return {...k,scopes:k.scopes.filter(s=>s.endsWith(':read'))};
  }
  // Permanent keys are intentionally server-to-server only. CORS is not authorization.
  if(req.headers.origin||req.headers['sec-fetch-site'])fail(403,'SERVER_TO_SERVER_ONLY','No navegador use browser_token de POST /map-sessions ou o SDK. A chave permanente fica no backend.');
  const raw=String(req.headers.authorization||'').match(/^Bearer (vp_[a-f0-9]{16}_[a-f0-9]{64})$/)?.[1];
  const id=raw?.split('_')[1],k=id&&db.partnerKeys.find(x=>x.id===id);
  if(!active(k)||!equal(k.keyHash,hash(raw)))fail(401,'INVALID_API_KEY','Credencial inválida.');
  quota('partner:'+k.id,60);return k;
 }
 async function write(work){
  const task=writeQueue.catch(()=>{}).then(work);writeQueue=task;return task;
 }
 function payload(res,status,data,requestId,extra={}){
  res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Request-ID':requestId,'X-Robots-Tag':'noindex, nofollow',...extra});
  res.end(JSON.stringify({data,meta:{request_id:requestId,api_version:'v1',generated_at:new Date(clock()).toISOString()}}));
 }
 async function calculated(k,spec,{choice=null}={}){
  scope(k,'routes:read');quota('routes:'+k.id,10);quota('routes:global',60);
  if(inFlight>=2)fail(429,'ROUTER_BUSY','Motor ocupado. Aguarde alguns segundos.');
  inFlight++;
  try{
   const result=await services.directions(spec.origin,spec.destination,MODES[spec.mode],{},'pt-BR',{
    adaptive:false,variantBudget:2,skipCandidateProbes:true,safeComparison:true,
    avoidTolls:spec.avoid.includes('tolls'),avoidFerries:spec.avoid.includes('ferries'),avoidUnpaved:spec.avoid.includes('unpaved')
   });
   if(!result||result.source==='demonstracao')fail(503,'REAL_PROVIDER_REQUIRED','Provedor real indisponível.');
   const valid=(result.routes||[]).filter(r=>Number.isFinite(r.distance)&&r.distance>0&&Number.isFinite(r.duration)&&r.duration>0&&r.geometry?.type==='LineString'&&r.geometry.coordinates?.length>=2&&r.geometry.coordinates.length<=50000&&r.geometry.coordinates.every(pointOK));
   const preferred=choice|| (spec.profile==='safe'?'safe':'fast');
   const first=valid.find(r=>r.id===preferred);
   if(!first)fail(422,'NO_ROUTE','Não foi encontrada uma rota para esse perfil.');
   const selected=choice?[first]:[first,...valid.filter(r=>r!==first)].filter((r,i,a)=>a.findIndex(x=>JSON.stringify(x.geometry)===JSON.stringify(r.geometry))===i).slice(0,1+spec.alternatives);
   return {routes:selected.map(r=>({
    route_id:ref(k,'route',{spec,choice:r.id}),distance_m:Math.round(r.distance*1000),duration_s:Math.round(r.duration*60),
    profile:r.id==='safe'?'safe':'fastest',geometry:r.geometry,
    steps:(r.steps||[]).slice(0,700).map(s=>({instruction:cleanText(s.instruction,300),distance_m:Number.isFinite(s.distance)?Math.round(s.distance):null,...(pointOK(s.location)?{location:s.location}:{})})),
    traffic_status:'unknown',verified_safety:r.verifiedSafety===true,warnings:[...(r.verifiedSafety===true?[]:['SAFETY_NOT_VERIFIED']),'ETA_ESTIMATE'],
    expires_at:new Date(clock()+TTL).toISOString()
   })),provider:cleanText(result.source,80),notice:'ETA estimada. A recuperação por route_id executa novo cálculo; o trajeto pode mudar.'};
  }finally{inFlight--;}
 }
 function page(res,title,body,extra={}){
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',...extra});
  res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+body+'</html>');
 }
 async function handle(req,res,url){
  const u=url||new URL(req.url,'http://localhost'),p=u.pathname;
  if(!(p.startsWith(PARTNER_BASE+'/')||p===PARTNER_BASE||p.startsWith('/api/admin/partner-keys')||p==='/integracoes'||p.startsWith('/embed/')||p==='/sdk/vano-map.js'))return false;
  const requestId=randomBytes(12).toString('hex');
  try{
   if(!enabled)fail(503,'API_DISABLED','API de parceiros temporariamente desativada.');
   const from=req.headers.origin;
   if(from&&p.startsWith(PARTNER_BASE+'/')&&db.partnerKeys.some(k=>active(k)&&k.origins.includes(from))){
    res.setHeader('Access-Control-Allow-Origin',from);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Expose-Headers','X-Request-ID, Retry-After');
   }
   if(req.method==='OPTIONS'){
    if(!res.getHeader('Access-Control-Allow-Origin'))fail(403,'ORIGIN_NOT_REGISTERED','Origem não cadastrada.');
    res.writeHead(204,{'Cache-Control':'no-store'});res.end();return true;
   }
   if(p==='/sdk/vano-map.js'&&req.method==='GET'){
    res.writeHead(302,{'Location':origin+services.sdkPath(),'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','Cache-Control':'no-store'});res.end();return true;
   }
   if(p==='/integracoes'){
    if(!admin(req))fail(403,'ADMIN_REQUIRED','Entre na conta administrativa do VANO para gerenciar integrações.');
    if(req.method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Método não permitido.');
    page(res,'VANO Integrações','<link rel="stylesheet" href="/partner-ui.css"><main><h1>Integrações VANO</h1><p>Crie uma chave por parceiro. Ela aparece uma única vez e deve ficar no backend do parceiro.</p><form id="key-form"><label>Nome do parceiro<input id="name" required minlength="2" maxlength="80"></label><label>Origem HTTPS da rede social<input id="origin" placeholder="https://social.example" required></label><button>Criar chave de leitura</button></form><pre id="result" role="status"></pre><h2>Chaves cadastradas</h2><div id="keys"></div><p><a href="'+PARTNER_BASE+'/docs">Guia da API</a> · <a href="'+PARTNER_BASE+'/openapi.json">OpenAPI</a></p></main><script type="module" src="/partner-admin.js"></script>');return true;
   }
   if(p.startsWith('/api/admin/partner-keys')){
    if(!admin(req))fail(403,'ADMIN_REQUIRED','Acesso administrativo necessário.');
    quota('partner-admin',20);
    if(req.method==='GET'&&p==='/api/admin/partner-keys'){payload(res,200,{items:db.partnerKeys.map(publicKey)},requestId);return true;}
    if(!csrfGuard(req,res))return true;
    if(production&&!persistent)fail(503,'PERSISTENT_STORAGE_REQUIRED','Gestão de chaves exige banco persistente em produção.');
    if(req.method==='POST'&&p==='/api/admin/partner-keys'){
     const b=await readBody(req);fields(b,['name','origins','scopes']);
     const name=text(b.name,2,80),origins=b.origins,scopes=b.scopes??DEFAULT_PARTNER_SCOPES;
     if(!Array.isArray(origins)||origins.length>5||origins.some(x=>!partnerOrigin(x,production)))fail(422,'INVALID_ORIGINS','Use até cinco origens HTTPS exatas.');
     if(!Array.isArray(scopes)||!scopes.length||scopes.length>PARTNER_SCOPES.length||scopes.some(x=>!PARTNER_SCOPES.includes(x)))fail(422,'INVALID_SCOPES','Permissões inválidas.');
     await write(async()=>{
      if(db.partnerKeys.length>=100)fail(409,'KEY_LIMIT','Limite de 100 credenciais atingido.');
      const id=randomBytes(8).toString('hex'),raw='vp_'+id+'_'+randomBytes(32).toString('hex');
      const k={id,name,origins:[...new Set(origins)],scopes:[...new Set(scopes)],active:true,version:1,keyHash:hash(raw),createdAt:new Date(clock()).toISOString()};
      db.partnerKeys.push(k);try{await persist({backup:false});}catch(e){db.partnerKeys.splice(db.partnerKeys.indexOf(k),1);throw e;}
      payload(res,201,{...publicKey(k),api_key:raw},requestId);
     });return true;
    }
    const m=/^\/api\/admin\/partner-keys\/([a-f0-9]{16})(\/rotate)?$/.exec(p);
    if(m&&(req.method==='DELETE'&&!m[2]||req.method==='POST'&&m[2])){
     await write(async()=>{
      const k=db.partnerKeys.find(x=>x.id===m[1]);if(!k)fail(404,'KEY_NOT_FOUND','Chave não encontrada.');
      const before={...k};let raw;
      if(m[2]){if(!k.active)fail(409,'KEY_REVOKED','Crie uma nova credencial.');raw='vp_'+k.id+'_'+randomBytes(32).toString('hex');k.keyHash=hash(raw);k.version++;}
      else{k.active=false;k.version++;}
      try{await persist({backup:false});}catch(e){Object.assign(k,before);throw e;}
      payload(res,200,{...publicKey(k),...(raw?{api_key:raw}:{})},requestId);
     });return true;
    }
    fail(405,'METHOD_NOT_ALLOWED','Método não permitido.');
   }
   if(p.startsWith('/embed/')){
    if(req.method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Método não permitido.');
    const k=db.partnerKeys.find(x=>x.id===p.slice('/embed/'.length));
    if(!active(k)||!k.origins.length)fail(404,'MAP_NOT_FOUND','Mapa indisponível.');
    scope(k,'map:read');
    const baseCsp=headers['Content-Security-Policy']||"default-src 'self'; object-src 'none'; base-uri 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.mapbox.com; connect-src 'self' https://*.mapbox.com; worker-src 'self' blob:";
    const csp=baseCsp.split(';').filter(x=>!x.trim().startsWith('frame-ancestors')).join(';')+'; frame-ancestors '+k.origins.join(' ');
    const custom={...headers,'Content-Security-Policy':csp,'Referrer-Policy':'strict-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(self), payment=()'};
    delete custom['X-Frame-Options'];
    // The main document DENY policy is replaced only for this explicit embed page.
    res.writeHead(200,{...custom,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
    res.end(services.embedHTML());return true;
   }
   if(p===PARTNER_BASE+'/docs'&&req.method==='GET'){
    page(res,'VANO API para parceiros','<link rel="stylesheet" href="/partner-ui.css"><main><h1>API de parceiros VANO Maps</h1><p>Base: <code>'+PARTNER_BASE+'</code>. Credenciais são criadas pelo administrador em <a href="/integracoes">Integrações</a>.</p><h2>Primeiros passos</h2><ol><li>Guarde a chave no backend.</li><li>Consulte GET /capabilities.</li><li>Pesquise com GET /places/search?q=Paulista.</li><li>Calcule com POST /routes.</li><li>Crie POST /map-sessions e carregue embed_url num iframe.</li></ol><p>Use Authorization: Bearer SUA_CHAVE e Content-Type: application/json. A chave permanente não deve ser usada no navegador.</p><pre>{"origin":{"lat":-23.5615,"lng":-46.6557},\n "destination":{"lat":-23.5874,"lng":-46.6597},\n "mode":"car","profile":"fastest","alternatives":1}</pre><p>GeoJSON usa [longitude, latitude]. Distâncias em metros; tempos em segundos. As métricas são convertidas da precisão oferecida pelo motor VANO.</p><h2>Mapa completo no parceiro sem iframe</h2><p>O backend cria POST /map-sessions com allowed_origin igual à origem exata do parceiro. Encaminhe somente data ao navegador. A resposta contém browser_token, sdk_url e api_base. O token temporário permite busca e rotas no navegador com CORS controlado, respeitando as permissões da chave.</p><pre>const session = await fetch("/api/vano/session").then(r =&gt; r.json());\nconst { mount } = await import(session.sdk_url);\nconst mapa = await mount(document.querySelector("#mapa"), { session });\nmapa.setOrigin({ lng: -46.6557, lat: -23.5615, name: "Origem" });</pre><p>O elemento #mapa deve ter altura, por exemplo 600px. O componente exibe o mapa com ícones e camadas do VANO, sem card duplicado por padrão. Envie o endereço digitado no parceiro com await mapa.setDestination(endereco); a origem vem do GPS autorizado ou de mapa.setOrigin(posicao). Use controls:true somente para ativar o painel opcional. O centro do mapa nunca é a localização do usuário. Em iframe, inclua allow="geolocation" e delegue essa permissão na política do parceiro, ou envie a posição por vano:set-origin. POST /routes também aceita destination em texto e origem real. Sem origem retorna LOCATION_REQUIRED. Quem já carrega embed_url recebe o novo mapa ao recarregar com uma sessão válida. A busca também aceita /search?q=...&amp;lat=...&amp;lng=...&amp;limit=30, com items, results, coords e place_id na resposta. Não garante todos os endereços existentes, pois depende da cobertura dos provedores.</p><p>Para SDK nativo, autorize o domínio do VANO em script-src, style-src e connect-src, os serviços públicos Mapbox necessários, workers blob e as origens do parceiro nas restrições do token público Mapbox, se existirem. A chave permanente continua no backend. O SDK renova tokens de 5 minutos até o prazo máximo da sessão de 2 horas; use onSessionExpired para pedir uma nova sessão ao próprio backend depois disso.</p><h2>Validade e limites</h2><p>Referências duram 5 minutos. Recuperar route_id recalcula o trajeto. Limites por parceiro: 60 chamadas/minuto, 10 cálculos/minuto; até 2 cálculos simultâneos no serviço. Consulte capabilities para as condições disponíveis.</p><p>O iframe usa token temporário no fragmento da URL. A chave permanente fica no backend. O token temporário também deve ser protegido. Recrie a sessão após a expiração.</p><p>401: chave inválida. 403: permissão ausente. 410: referência expirada. 422: entrada inválida ou sem rota. 429: respeite Retry-After. 503: provedor indisponível. Preserve meta.request_id ao pedir suporte.</p><p>Trânsito e pontos de interesse dependem dos provedores. Fonte indisponível não significa área sem ocorrências. Voz, contas pessoais e diagnósticos administrativos não fazem parte desta API.</p><p><a href="'+PARTNER_BASE+'/openapi.json">Contrato OpenAPI com todos os endpoints e campos</a></p></main>');return true;
   }
   if(p===PARTNER_BASE+'/openapi.json'&&req.method==='GET'){
    res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'});res.end(JSON.stringify(partnerOpenAPI(origin)));return true;
   }
   if(p===PARTNER_BASE+'/map-session-data'&&req.method==='GET'){
    const k=authenticate(req),b=req.vanoPartnerSession;
    if(!b)fail(403,'BROWSER_SESSION_REQUIRED','Use o token temporário de map-sessions.');
    scope(k,'map:read');quota('map-load:'+k.id,90);
    const route=b.route?await calculated(k,b.route.spec,{choice:b.route.choice}):null;
    payload(res,200,{center:b.center,origin:b.origin||null,destination:b.destination||null,query:b.query||null,controls:b.controls===true,auto_locate:b.auto_locate!==false,zoom:b.zoom,markers:b.markers,theme:b.theme,routes:route?.routes||[],mapbox_public_token:services.mapToken(),expires_at:new Date(b.expires).toISOString(),session_until:b.session_until?new Date(b.session_until).toISOString():new Date(b.expires).toISOString(),allowed_origin:b.allowed_origin||k.origins[0],api_base:origin+PARTNER_BASE,stylesheets:services.stylesheets?.()||[],features:{search:k.scopes.includes('places:read'),directions:k.scopes.includes('routes:read'),icons:true,traffic:true},styles:{light:origin+'/mapbox/vano-atlas-light.json',dark:origin+'/mapbox/vano-atlas-black.json'}},requestId);return true;
   }
   const k=authenticate(req),base=PARTNER_BASE;
   if(p===base+'/map-sessions/renew'&&req.method==='POST'){
    const b=req.vanoPartnerSession;if(!b)fail(403,'BROWSER_SESSION_REQUIRED','Use uma sessão temporária.');
    const until=b.session_until||b.expires;if(until<=clock())fail(410,'SESSION_EXPIRED','Peça uma nova sessão ao backend do parceiro.');
    const expires=Math.min(clock()+TTL,until),next=seal({...b,expires});
    payload(res,200,{browser_token:next,expires_at:new Date(expires).toISOString(),session_until:new Date(until).toISOString()},requestId);return true;
   }
   if(p===base+'/map-data'&&req.method==='GET'){
    scope(k,'map:read');const name=u.searchParams.get('service'),read=services.mapRead?.[name];
    if(typeof read!=='function')fail(404,'MAP_SERVICE_NOT_FOUND','Serviço de mapa não disponível.');
    const bbox=parseBBox(u.searchParams.get('bbox'),.3,.3);if(!bbox)fail(422,'INVALID_BBOX','Área inválida; máximo 0.3 graus.');
    quota('map-feed:'+k.id+':'+name,120);
    payload(res,200,await read(bbox),requestId);return true;
   }
   if(p===base+'/capabilities'&&req.method==='GET'){
    payload(res,200,{partner_id:k.id,scopes:k.scopes,modes:Object.keys(MODES),profiles:{car:['fastest','safe'],motorcycle:['fastest','safe'],walking:['fastest']},
     limits:{requests_per_minute:60,route_calculations_per_minute:10,concurrent_routes_global:2,body_bytes:16384,alternatives:2,waypoints:0,markers:10,reference_ttl_s:300},
     coverage:'Conforme cobertura dos provedores; validar o resultado de cada consulta.',services:Object.keys(services.read||{}),
     departures:['now'],languages:['pt-BR'],storage:'single_instance',route_retrieval:'recalculates',routing_configured:services.routingReady(),
     search_limit:30,browser_sessions:{enabled:true,token_ttl_s:300,max_session_s:7200,requests_per_minute_per_token:180,sdk_url:origin+'/sdk/vano-map.js',renew_endpoint:base+'/map-sessions/renew'},
     excluded:['personal_accounts','voice','admin_diagnostics'],...services.capabilities?.()},requestId);return true;
   }
   if(p===base+'/routes'&&req.method==='POST'){
    scope(k,'routes:read');const body=await readBody(req);
    fields(body,['origin','location','current_location','destination','address','query','destination_address','mode','profile','alternatives','waypoints','avoid','departure_at','language']);
    const inputOrigin=body.origin??body.location??body.current_location??req.vanoPartnerSession?.origin;
    if(!inputOrigin)fail(422,'LOCATION_REQUIRED','Envie a origem real do usuário. O centro do mapa não é usado como localização.');
    const from=await resolvePlace(k,inputOrigin),to=await resolvePlace(k,body.destination??body.address??body.query??body.destination_address,from.coords);
    const {location:_location,current_location:_current,address:_address,query:_query,destination_address:_dest,...options}=body;
    const spec=parsePartnerRoute({...options,origin:{lat:from.lat,lng:from.lng},destination:{lat:to.lat,lng:to.lng}});
    payload(res,200,{...await calculated(k,spec),resolved_origin:from,resolved_destination:to},requestId);return true;
   }
   const routeMatch=new RegExp('^'+base+'/routes/([A-Za-z0-9_-]+)(/recalculate)?$').exec(p);
   if(routeMatch){
    const b=own(routeMatch[1],'route',k);
    if(req.method==='GET'&&!routeMatch[2]){payload(res,200,await calculated(k,b.spec,{choice:b.choice}),requestId);return true;}
    if(req.method==='POST'&&routeMatch[2]){
     const body=await readBody(req);fields(body,['origin']);const spec={...b.spec,origin:point(body.origin)};
     payload(res,200,await calculated(k,spec),requestId);return true;
    }
   }
   if((p===base+'/places/search'||p===base+'/search')&&req.method==='GET'){
    scope(k,'places:read');quota('places:'+k.id,120);const q=text(u.searchParams.get('q')??u.searchParams.get('query')??u.searchParams.get('text'),2,200);
    const limit=int(u.searchParams.has('limit')?Number(u.searchParams.get('limit')):20,1,30,20);
    let proximity=null;
    if(u.searchParams.has('lat')||u.searchParams.has('lng')){
     if(!u.searchParams.get('lat')?.trim()||!u.searchParams.get('lng')?.trim())fail(422,'INVALID_COORDINATES','Envie lat e lng juntos.');
     proximity=point({lat:Number(u.searchParams.get('lat')),lng:Number(u.searchParams.get('lng'))});
    }else if(u.searchParams.has('proximity')){
     const parts=u.searchParams.get('proximity').split(',');
     if(parts.length!==2||parts.some(x=>!x.trim()))fail(422,'INVALID_COORDINATES','Use proximity=longitude,latitude.');
     proximity=point({lng:Number(parts[0]),lat:Number(parts[1])});
    }
    const language=u.searchParams.get('language')||u.searchParams.get('lang')||'pt-BR';
    if(!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language))fail(422,'INVALID_LANGUAGE','Idioma inválido.');
    const found=await services.search(q,language,proximity,{limit});
    const items=found.filter(x=>pointOK(x.coords)).slice(0,limit).map(x=>{
     const details={name:cleanText(x.name,140),address:cleanText(x.address,200),lat:x.coords[1],lng:x.coords[0],category:cleanText(x.category,50)};
     const id=ref(k,'place',{place:details});return {...details,place_id:id,id,coords:[...x.coords]};
    });
    payload(res,200,{items,results:items,next_cursor:null,expires_in_s:300,limit,proximity_applied:Boolean(proximity),notice:'Sugestões ordenadas por relevância; cobertura conforme os provedores.'},requestId);return true;
   }
   if(p.startsWith(base+'/places/')&&req.method==='GET'){
    scope(k,'places:read');const b=own(p.slice((base+'/places/').length),'place',k);payload(res,200,b.place,requestId);return true;
   }
   if(p===base+'/geocode/reverse'&&req.method==='GET'){
    scope(k,'places:read');quota('reverse:'+k.id,12);
    const lat=u.searchParams.get('lat'),lng=u.searchParams.get('lng');if(lat===null||lng===null||lat.trim()===''||lng.trim()==='')fail(422,'INVALID_COORDINATES','Informe lat e lng.');
    const coords=point({lat:Number(lat),lng:Number(lng)});payload(res,200,await services.reverse(coords),requestId);return true;
   }
   if(p===base+'/map-sessions'&&req.method==='POST'){
    if(req.vanoPartnerSession)fail(403,'SERVER_KEY_REQUIRED','Novas sessões devem ser criadas pelo backend do parceiro.');
    scope(k,'map:read');const b=await readBody(req);fields(b,['allowed_origin','center','origin','destination','query','controls','auto_locate','zoom','markers','route_id','theme']);
    if(!k.origins.includes(b.allowed_origin))fail(403,'ORIGIN_NOT_REGISTERED','Origem não cadastrada para o parceiro.');
    const center=point(b.center),zoom=int(b.zoom,0,20,14),theme=b.theme??'light';
    for(const key of ['controls','auto_locate'])if(b[key]!==undefined&&typeof b[key]!=='boolean')fail(422,'INVALID_OPTION','Envie controles e localização como booleanos.');
    const initialOrigin=b.origin===undefined?null:await resolvePlace(k,b.origin,center);
    let initialDestination=null;if(b.destination!==undefined){const direct=partnerPlace(b.destination);initialDestination=direct||partnerAddress(b.destination);if(!initialDestination&&typeof b.destination?.place_id==='string')initialDestination=await resolvePlace(k,b.destination,initialOrigin?.coords||center);if(!initialDestination)fail(422,'INVALID_DESTINATION','Destino inválido.');}
    const query=b.query===undefined?null:text(b.query,2,200);
    if(!['light','dark'].includes(theme))fail(422,'INVALID_THEME','Tema inválido.');
    if(!Array.isArray(b.markers??[])||(b.markers??[]).length>10)fail(422,'INVALID_MARKERS','Use até 10 marcadores.');
    const markers=(b.markers??[]).map(m=>{fields(m,['id','lat','lng','label']);const coords=point(m);return {id:text(m.id,1,50),coords,label:text(m.label,1,80)};});
    let route=null;if(b.route_id){scope(k,'routes:read');const r=own(b.route_id,'route',k);route={spec:r.spec,choice:r.choice};}
    const sessionUntil=clock()+2*60*60*1000;
    const session=ref(k,'map',{center,origin:initialOrigin,destination:initialDestination,query,controls:b.controls===true,auto_locate:b.auto_locate!==false,zoom,markers,theme,route,allowed_origin:b.allowed_origin,session_until:sessionUntil});
    payload(res,201,{session_id:hash(session).slice(0,24),embed_url:origin+'/embed/'+k.id+'#session='+session,browser_token:session,api_base:origin+PARTNER_BASE,sdk_url:origin+'/sdk/vano-map.js',expires_at:new Date(clock()+TTL).toISOString(),session_until:new Date(sessionUntil).toISOString()},requestId);return true;
   }
   if(p===base+'/reports'&&req.method==='GET'){
    scope(k,'reports:read');const bbox=parseBBox(u.searchParams.get('bbox'));if(!bbox)fail(422,'INVALID_BBOX','Área inválida; máximo 0.065 × 0.055 graus.');
    payload(res,200,{items:publicReportsInBBox(db.reports,bbox,clock()).map(({isOwn,viewerVote,...r})=>r),next_cursor:null},requestId);return true;
   }
   if(p===base+'/reports'&&req.method==='POST'){
    scope(k,'reports:write');quota('reports:'+k.id,6);const b=await readBody(req);fields(b,['actor_id','type','lat','lng','description']);
    const coords=point(b),actor=text(b.actor_id,1,100),owner='partner:'+k.id+':'+hash(actor);
    if(!isReportType(b.type))fail(422,'INVALID_REPORT_TYPE','Tipo de ocorrência inválido.');
    const description=b.description===undefined?'':text(b.description,0,280),idempotency=text(req.headers['idempotency-key'],16,100),fingerprint=hash(JSON.stringify({actor,type:b.type,coords,description}));
    await write(async()=>{
     const key=hash(k.id+':'+idempotency),existing=db.reports.find(r=>r.partnerIdempotency===key);
     if(existing){if(existing.partnerFingerprint!==fingerprint)fail(409,'IDEMPOTENCY_CONFLICT','A chave já foi usada com outros dados.');payload(res,200,reportPublic(existing),requestId);return;}
     if(db.reports.some(r=>r.owner===owner&&r.type===b.type&&clock()-Date.parse(r.createdAt)<900000&&metersApart(r.coords,coords)<150))fail(409,'DUPLICATE_REPORT','Ocorrência já informada.');
     if(db.reports.filter(r=>r.owner?.startsWith('partner:'+k.id+':')).length>=500)fail(429,'REPORT_LIMIT','Limite de ocorrências do parceiro atingido.');
     const r={id:randomBytes(8).toString('hex'),owner,coords,type:b.type,description,status:'nao_verificado',createdAt:new Date(clock()).toISOString(),expiresAt:new Date(clock()+reportType(b.type).ttlMinutes*60000).toISOString(),partnerIdempotency:key,partnerFingerprint:fingerprint};
     db.reports.push(r);try{await persist();}catch(e){db.reports.splice(db.reports.indexOf(r),1);throw e;}
     services.reportPublished?.(r);payload(res,201,reportPublic(r),requestId);
    });return true;
   }
   const confirmation=new RegExp('^'+base+'/reports/([a-f0-9]{16})/confirmations$').exec(p);
   if(confirmation&&req.method==='POST'){
    scope(k,'reports:write');quota('confirm:'+k.id,16);const b=await readBody(req);fields(b,['actor_id','choice']);
    const actor='partner:'+k.id+':'+hash(text(b.actor_id,1,100));
    await write(async()=>{
     const r=db.reports.find(x=>x.id===confirmation[1]);if(!r)fail(404,'REPORT_NOT_FOUND','Ocorrência não encontrada.');
     const before=structuredClone(r.feedback),result=recordReportFeedback(r,actor,hash('partner-vote:'+secret+':'+actor),b.choice,clock());
     if(result.status==='own')fail(403,'OWN_REPORT','Não confirme a própria ocorrência.');
     if(!['recorded','duplicate'].includes(result.status))fail(422,'INVALID_CONFIRMATION','Confirmação inválida ou ocorrência expirada.');
     try{await persist();}catch(e){r.feedback=before;throw e;}
     payload(res,200,{recorded:true,choice:result.choice||b.choice,already_recorded:result.status==='duplicate'},requestId);
    });return true;
   }
   const serviceName=p.slice((base+'/').length),service=services.read?.[serviceName];
   if(service&&req.method==='GET'){
    scope(k,service.scope);quota('read:'+k.id+':'+serviceName,20);
    let bbox;if(service.bbox){bbox=parseBBox(u.searchParams.get('bbox'));if(!bbox)fail(422,'INVALID_BBOX','Área inválida; máximo 0.065 × 0.055 graus.');}
    payload(res,200,await service.run(bbox,u.searchParams),requestId);return true;
   }
   if(p===base+'/transit/plan'&&req.method==='POST'){
    scope(k,'transit:read');quota('transit:'+k.id,6);payload(res,200,await services.transitPlan(await readBody(req)),requestId);return true;
   }
   if(['/voice-sessions','/navigation-sessions','/me/preferences'].some(x=>p===base+x))fail(403,'FEATURE_NOT_ENABLED','Recurso não habilitado para parceiros.');
   fail(404,'ENDPOINT_NOT_FOUND','Endpoint não encontrado ou método indisponível.');
  }catch(e){
   if(res.headersSent){res.end();return true;}
   const known=e instanceof PartnerError,status=known?e.status:503,code=known?e.code:'SERVICE_UNAVAILABLE';
   res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Request-ID':requestId,...(status===429?{'Retry-After':String(e.retryAfter||10)}:{})});
   res.end(JSON.stringify({error:{code,message:known?e.message:'Serviço temporariamente indisponível.'},meta:{request_id:requestId}}));return true;
  }
 }
 return {handle};
}
