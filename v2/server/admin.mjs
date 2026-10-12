/** VANO read-only operational console. No handle-based privilege escalation. */
const identityList=s=>new Set(String(s||'').split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean));
/** Explicit verified identities only. Names/handles are untrusted display strings. */
export function isAdminAccount(user,env=process.env){
 if(!user||!user.verifiedAt||!['email','google'].includes(user.verificationMethod))return false;
 const emails=identityList(env.VANO_ADMIN_EMAILS);
 const subs=identityList(env.VANO_ADMIN_GOOGLE_SUBS);
 const verifiedEmail=String(user.email||'').trim().toLowerCase();
 const sub=String(user.googleSub||'').trim().toLowerCase();
 return Boolean((verifiedEmail && emails.has(verifiedEmail)) || (sub && user.verificationMethod==='google' && subs.has(sub)));
}
export function adminMetrics(data,stats,{now=Date.now(),startedAt=Date.now(),status={}}={}){
 const h=Array.isArray(data.history)?data.history:[];
 const users=Array.isArray(data.users)?data.users:[];
 const reports=Array.isArray(data.reports)?data.reports:[];
 const current=now-86400000;
 const last24=h.filter(x=>new Date(x.createdAt||0).getTime()>=current);
 const mins=last24.map(r=>Number(r.duration)).filter(x=>Number.isFinite(x)&&x>0);
 const modes={safe:h.filter(r=>r.routeType==='safe').length,fast:h.filter(r=>r.routeType==='fast').length};
 return {
   since:new Date(startedAt).toISOString(),uptimeSeconds:Math.max(0,Math.floor((now-startedAt)/1000)),
   usersTotal:users.length,usersVerified:users.filter(u=>Boolean(u.verifiedAt)).length,usersGoogle:users.filter(u=>Boolean(u.googleSub)).length,
   routesTotal:h.length,routes24h:last24.length,avgDuration24h:mins.length?Math.round(mins.reduce((s,x)=>s+x,0)/mins.length):null,modes,
   reportsTotal:reports.length,reportsUnverified:reports.filter(r=>r.status!=='verificado').length,
   favoritesTotal:(data.favorites||[]).length,routinesTotal:(data.routines||[]).length,
   pageViewsTotal:Object.values(stats.pageViews||{}).reduce((a,b)=>a+Number(b||0),0),popularPages:Object.entries(stats.pageViews||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([path,views])=>({path,views})),
   requests:stats.requests||0,routeRequests:stats.routeRequests||0,routeErrors:stats.routeErrors||0,
   avgApiRouteMs:stats.routeRequests?Math.round((stats.routeLatencyMs||0)/stats.routeRequests):null,
   integrations:{google:Boolean(status.google),mapbox:Boolean(status.mapbox),v1Router:Boolean(status.v1Router),email:Boolean(status.email),persistentDb:Boolean(status.persistentDb)},
   storage:status.storage||'JSON local (instância única; não indicado para produção)',
 };
}
export function adminUsers(data,{offset=0,limit=25}={}){
 const users=Array.isArray(data.users)?data.users:[];
 const safeOffset=Math.max(0,Math.min(100000,Math.floor(Number(offset)||0)));
 const safeLimit=Math.max(1,Math.min(50,Math.floor(Number(limit)||25)));
 const recent=users.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {total:users.length,offset:safeOffset,limit:safeLimit,items:recent.slice(safeOffset,safeOffset+safeLimit).map(u=>({id:u.id,name:String(u.name||'').slice(0,80),email:String(u.email||'').slice(0,180),createdAt:u.createdAt||null,verified:Boolean(u.verifiedAt),googleLinked:Boolean(u.googleSub)}))};
}
