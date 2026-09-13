/* VANO MAPS V310 — atomic offline cache with bounded map-region recovery. */
const BUILD='310.0.0-navigation-experience';
const CACHE=`vano-maps-v310-${BUILD}`;
const MAP_CACHE=`vano-map-region-v310-${BUILD}`,MAP_CACHE_MAX=180;
const PRECACHE=[
  '/static/vano-app-v262.css',
  '/static/vano-runtime-v262.js',
  '/static/vano-theme-v230.js',
  '/static/vano-map-v300.js',
  '/static/vano-map-v300.css',
  '/static/vano-planner-v263.css',
  '/static/vano-navigation-v300.css',
  '/static/vano-maps-icon-64.png',
  '/static/vano-maps-icon-192.png',
  '/static/vano-maps-icon-512.png',
  '/static/voices/vano/chegou_ao_destino.mp3',
  '/static/voices/vano/continue_em_frente.mp3',
  '/static/voices/vano/em_50_metros.mp3',
  '/static/voices/vano/em_200_metros.mp3',
  '/static/voices/vano/em_300_metros.mp3',
  '/static/voices/vano/em_500_metros.mp3',
  '/static/voices/vano/em_1_km.mp3',
  '/static/voices/vano/em_2_km.mp3',
  '/static/voices/vano/faca_retorno.mp3',
  '/static/voices/vano/mantenha_a_direita.mp3',
  '/static/voices/vano/mantenha_a_esquerda.mp3',
  '/static/voices/vano/mantenha_se_a_direita.mp3',
  '/static/voices/vano/siga_em_frente.mp3',
  '/static/voices/vano/vire_a_direita.mp3',
  '/static/voices/vano/leve_curva_a_direita.mp3',
  '/static/voices/vano/leve_curva_a_esquerda.mp3'
];
const CORE_RE=/\/static\/(vano-app-v262\.css|vano-runtime-v262\.js|vano-theme-v230\.js|vano-map-v300\.js|vano-map-v300\.css|vano-planner-v263\.css|vano-navigation-v300\.css)$/;
const MEDIA_RE=/\.(?:png|jpe?g|webp|svg|gif|ico|mp3|ogg|wav|woff2?)$/i;
const NEVER_CACHE_RE=/^\/(?:api|mobile\/auth|admin|login|register|logout|forgot-password|reset-password|account\/delete)(?:\/|$)/;
const MAPBOX_CACHE_PATH_RE=/^\/(?:styles\/v1|v4|fonts\/v1)\//;
function isCacheableMapbox(url){return (url.hostname==='api.mapbox.com'||url.hostname==='tiles.mapbox.com'||url.hostname.endsWith('.tiles.mapbox.com'))&&MAPBOX_CACHE_PATH_RE.test(url.pathname)}
async function trimCache(cache,maxEntries){try{const keys=await cache.keys();if(keys.length>maxEntries)await Promise.all(keys.slice(0,keys.length-maxEntries).map(k=>cache.delete(k)))}catch(_){}}
async function mapboxNetworkFirst(request){const cache=await caches.open(MAP_CACHE);try{const response=await fetchWithTimeout(request,3000);if(response&&response.ok&&response.type!=='opaque'){try{await cache.put(request,response.clone());trimCache(cache,MAP_CACHE_MAX)}catch(_){}}return response}catch(_){return (await cache.match(request))||Response.error()}}

async function putSafe(cache,request,response){
  if(response&&response.ok&&response.type!=='opaque'){
    try{await cache.put(request,response.clone())}catch(_){ }
  }
  return response;
}
async function fetchWithTimeout(request,ms=4500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(request,{signal:controller.signal})}finally{clearTimeout(timer)}
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(url=>fetch(url,{cache:'reload'}).then(resp=>resp.ok?cache.put(url,resp):Promise.reject(new Error(String(resp.status))))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE&&k!==MAP_CACHE&&(k.startsWith('vano-')||k.startsWith('rairo-')||k.startsWith('vienna-')||k.startsWith('raigo-'))).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin){
    if(isCacheableMapbox(url))event.respondWith(mapboxNetworkFirst(req));
    return;
  }
  if(NEVER_CACHE_RE.test(url.pathname)) return;
  if(req.mode==='navigate') return; // HTML must remain network-controlled/auth-safe.
  if(!url.pathname.startsWith('/static/')) return;

  if(CORE_RE.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{return await putSafe(cache,req,await fetchWithTimeout(req,5000))}
      catch(_){return (await cache.match(req))||(await cache.match(url.pathname))||Response.error()}
    })());
    return;
  }
  if(MEDIA_RE.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(req)||await cache.match(url.pathname);
      const refresh=fetch(req).then(resp=>putSafe(cache,req,resp)).catch(()=>null);
      if(cached){event.waitUntil(refresh);return cached}
      return (await refresh)||Response.error();
    })());
  }
});
