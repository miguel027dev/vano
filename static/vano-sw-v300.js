/* VANO MAPS V300 — atomic, conservative offline cache. */
const BUILD='300.1.0-navigation-refactor';
const CACHE=`vano-maps-v300-${BUILD}`;
const PRECACHE=[
  '/static/vano-app-v262.css',
  '/static/vano-runtime-v262.js',
  '/static/vano-theme-v230.js',
  '/static/vano-map-v300.js',
  '/static/vano-map-v300.css',
  '/static/vano-navigation-v300.css',
  '/static/vano-maps-icon-64.png',
  '/static/vano-maps-icon-192.png',
  '/static/vano-maps-icon-512.png'
];
const CORE_RE=/\/static\/(vano-app-v262\.css|vano-runtime-v262\.js|vano-theme-v230\.js|vano-map-v300\.js|vano-map-v300\.css|vano-navigation-v300\.css)$/;
const MEDIA_RE=/\.(?:png|jpe?g|webp|svg|gif|ico|mp3|ogg|wav|woff2?)$/i;
const NEVER_CACHE_RE=/^\/(?:api|mobile\/auth|admin|login|register|logout|forgot-password|reset-password|account\/delete)(?:\/|$)/;

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
    await Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('vano-')||k.startsWith('rairo-')||k.startsWith('vienna-')||k.startsWith('raigo-'))).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
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
