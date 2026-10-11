/* VANO MAPS — canonical service worker. */
const CACHE='vano-static-current';
const MAP_CACHE='vano-map-region-current',MAP_CACHE_MAX=180;
const BUILD=new URL(self.location.href).searchParams.get('v')||'';
const PRECACHE=[
  '/static/vano-runtime.css',
  '/static/vano-foundation.css',

  '/static/vano-runtime.js',
  '/static/vano-theme.js',
  '/static/vano-map.js',





  '/static/vano-access.js',
  '/static/vano-maps-icon-64.png',
  '/static/vano-maps-icon-192.png',
  '/static/vano-maps-icon-512.png',
];
const CORE_RE=/\/static\/(vano\.css|vano-runtime\.js|vano-theme\.js|vano-map\.js|vano-access\.js)$/;
const MEDIA_RE=/\.(?:png|jpe?g|webp|svg|gif|ico|mp3|ogg|wav|woff2?)$/i;
const NEVER_CACHE_RE=/^\/(?:api|mobile\/auth|admin|login|register|logout|forgot-password|reset-password|account\/delete)(?:\/|$)/;
const MAPBOX_CACHE_PATH_RE=/^\/(?:styles\/v1|v4|fonts\/v1)\//;
function isCacheableMapbox(url){return (url.hostname==='api.mapbox.com'||url.hostname==='tiles.mapbox.com'||url.hostname.endsWith('.tiles.mapbox.com'))&&MAPBOX_CACHE_PATH_RE.test(url.pathname)}
async function trimCache(cache,maxEntries){try{const keys=await cache.keys();if(keys.length>maxEntries)await Promise.all(keys.slice(0,keys.length-maxEntries).map(k=>cache.delete(k)))}catch(_){}}
async function mapboxCacheFirst(request,event){
  const cache=await caches.open(MAP_CACHE),cached=await cache.match(request);
  const refresh=(async()=>{
    try{
      const response=await fetchWithTimeout(request,3000);
      if(response&&response.ok&&response.type!=='opaque'){
        try{await cache.put(request,response.clone());await trimCache(cache,MAP_CACHE_MAX)}catch(_){}
      }
      return response;
    }catch(_){return cached||Response.error()}
  })();
  // The region is already saved. Do not delay map display until another
  // network request finishes (or reaches its three-second timeout).
  if(cached){event.waitUntil(refresh);return cached}
  return refresh;
}

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
    // Reuse files the page already fetched, under their exact build URL.
    // Never download the obsolete legacy CSS again during installation.
    await Promise.allSettled(PRECACHE.map(async path=>{
      const url=path+(/^[a-f0-9]{7,40}$/i.test(BUILD)?'?v='+BUILD:'');
      if(await cache.match(url))return;
      const resp=await fetch(url,{cache:'force-cache'});
      if(resp.ok)await cache.put(url,resp);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE&&k!==MAP_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin){
    if(isCacheableMapbox(url))event.respondWith(mapboxCacheFirst(req,event));
    return;
  }
  if(NEVER_CACHE_RE.test(url.pathname)) return;
  if(req.mode==='navigate') return; // HTML must remain network-controlled/auth-safe.
  if(!url.pathname.startsWith('/static/')) return;

  // Build fingerprints apply to all local CSS/JS, not just a few older files.
  const versioned=/^[a-f0-9]{7,40}$/i.test(url.searchParams.get('v')||'');
  if(versioned||CORE_RE.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      // The ?v= fingerprint changes on every deployment. A cached matching
      // URL is safe and avoids waiting for a 5s network timeout on every page.
      if(versioned){
        const hit=await cache.match(req);
        if(hit)return hit;
        try{return await putSafe(cache,req,await fetchWithTimeout(req,5000))}
        catch(_){return Response.error()}
      }
      // Older unversioned native clients still revalidate hotfixes.
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
