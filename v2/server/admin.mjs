/** VANO read-only operational console. No handle-based privilege escalation. */
/** Exactly one authorized administrator, enforced by the server.
 * A display name, arbitrary env allowlist, or unrelated Google sub is NOT a
 * valid grant. The owner must be signed in with verified e-mail/Google identity.
 */
import {activitySummary,userActivity} from './engagement.mjs';

export const ADMIN_EMAIL='miguelpinxs@gmail.com';
export function isAdminAccount(user){
 return Boolean(user&&user.verifiedAt&&['email','google'].includes(user.verificationMethod)
  &&String(user.email||'').trim().toLowerCase()===ADMIN_EMAIL);
}
export function signupMethod(u){
 if(u?.signupMethod==='google')return 'Google';
 if(u?.signupMethod==='email')return 'E-mail e senha';
 // Legacy rows lack explicit signup metadata; do not guess from a Google
 // linkage on an account originally made with e-mail/password.
 if(u?.verificationMethod==='google')return 'Google (registro anterior)';
 if(u?.verificationMethod==='email')return 'E-mail (registro anterior)';
 return 'Não registrado';
}
export function adminMetrics(data,stats,{now=Date.now(),startedAt=Date.now(),status={}}={}){
 const h=Array.isArray(data.history)?data.history:[];
 const users=Array.isArray(data.users)?data.users:[];
 const reports=Array.isArray(data.reports)?data.reports:[];
 const current=now-86400000;
 const past7d=now-7*86400000,past30d=now-30*86400000;
 const validDates=(rows,since)=>rows.filter(x=>{
   const time=Date.parse(x.createdAt||'');
   return Number.isFinite(time)&&time<=now&&time>=since;
 });
 const new7d=validDates(users,past7d).length,new30d=validDates(users,past30d).length;
 const routes7d=validDates(h,past7d).length,reports24h=validDates(reports,current).length;
 const last24=h.filter(x=>new Date(x.createdAt||0).getTime()>=current);
 const mins=last24.map(r=>Number(r.duration)).filter(x=>Number.isFinite(x)&&x>0);
 const modes={safe:h.filter(r=>r.routeType==='safe').length,fast:h.filter(r=>r.routeType==='fast').length};
 return {
   since:new Date(startedAt).toISOString(),uptimeSeconds:Math.max(0,Math.floor((now-startedAt)/1000)),
   usersTotal:users.length,usersVerified:users.filter(u=>Boolean(u.verifiedAt)).length,usersGoogle:users.filter(u=>Boolean(u.googleSub)).length,
   signups7d:new7d,signups30d:new30d,
   engagement:activitySummary(users,now),
   verificationRate:users.length?Math.round(users.filter(u=>Boolean(u.verifiedAt)).length/users.length*100):null,
    signupsEmail:users.filter(u=>signupMethod(u).startsWith('E-mail')).length,
    signupsGoogle:users.filter(u=>signupMethod(u).startsWith('Google')).length,
   routesTotal:h.length,routes24h:last24.length,routes7d,reports24h,avgDuration24h:mins.length?Math.round(mins.reduce((s,x)=>s+x,0)/mins.length):null,modes,
   reportsTotal:reports.length,reportsUnverified:reports.filter(r=>r.status!=='verificado').length,
   favoritesTotal:(data.favorites||[]).length,routinesTotal:(data.routines||[]).length,
   pageViewsTotal:Object.values(stats.pageViews||{}).reduce((a,b)=>a+Number(b||0),0),popularPages:Object.entries(stats.pageViews||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([path,views])=>({path,views})),
   requests:stats.requests||0,routeRequests:stats.routeRequests||0,routeErrors:stats.routeErrors||0,
   avgApiRouteMs:stats.routeRequests?Math.round((stats.routeLatencyMs||0)/stats.routeRequests):null,
   integrations:{google:Boolean(status.google),mapbox:Boolean(status.mapbox),v1Router:Boolean(status.v1Router),email:Boolean(status.email),persistentDb:Boolean(status.persistentDb)},
   storage:status.storage||'JSON local (instância única; não indicado para produção)',
   // Session validity means authenticated sessions not yet expired, not online users.
   validSessions:(data.sessions||[]).filter(s=>Number(s.expires)>now).length,
   recentlySeenAccounts:users.filter(u=>{const ms=Date.parse(u.activity?.lastVisitAt||'');return Number.isFinite(ms)&&ms>=now-30*60000&&ms<=now;}).length,
   platformPageLoads:Object.entries(stats.platformPageLoads||{}).map(([platform,count])=>({platform,count:Number(count)||0})).sort((a,b)=>b.count-a.count),
   operationCounts:Object.entries(stats.operationCounts||{}).map(([label,count])=>({label,count:Number(count)||0})).sort((a,b)=>b.count-a.count),
   recentRoutes:h.slice(-35).reverse().map(item=>({
     createdAt:item.createdAt||null,
     destination:String(item.destination?.name||item.destination?.address||'Destino não informado').slice(0,100),
     origin:'Não registrada',routeType:item.routeType||'',
     distance:Number(item.distance)||0,duration:Number(item.duration)||0,
   })),
   routesByDay:Array.from({length:7},(_,i)=>{
     const key=new Date(now-(6-i)*86400000).toISOString().slice(0,10);
     return {day:key,total:h.filter(item=>String(item.createdAt||'').slice(0,10)===key).length};
   }),
 };
}

/** Classify a browser at request time, without storing its IP or user-agent. */
export function platformCategory(ua=''){
 const low=String(ua).toLowerCase().slice(0,500);
 if(/android/.test(low))return 'Android';
 if(/iphone|ipad|ipod/.test(low))return 'iOS / iPadOS';
 if(/windows/.test(low))return 'Windows';
 if(/macintosh|mac os/.test(low))return 'macOS';
 if(/linux/.test(low))return 'Linux';
 return 'Não identificado';
}
/** Bounded aggregates collected only in RAM; no individual event trails. */
export function recordOperationalEvent(metrics,{path='',method='GET',userAgent='',accept=''}={}){
 if(!metrics||typeof metrics!=='object')return;
 const pathname=String(path).slice(0,250),verb=String(method);
 if(verb==='GET'&&String(accept).includes('text/html')
     &&!pathname.startsWith('/api/')&&!pathname.startsWith('/static/')){
  const category=platformCategory(userAgent);
  metrics.platformPageLoads??=Object.create(null);
  metrics.platformPageLoads[category]=(metrics.platformPageLoads[category]||0)+1;
 }
 if(!pathname.startsWith('/api/')||pathname.startsWith('/api/admin'))return;
 metrics.operationCounts??=Object.create(null);
 let kind=null;
 if(pathname==='/api/route')kind='Cálculos de rota';
 else if(pathname==='/api/search')kind='Buscas de endereço';
 else if(pathname==='/api/bootstrap')kind='Aberturas/sincronizações';
 else if(pathname==='/api/history'&&verb==='POST')kind='Históricos de viagem';
 else if(pathname==='/api/history/progress'&&verb==='POST')kind='Atualizações de percurso';
 else if(pathname==='/api/reports'&&verb==='POST')kind='Relatos da comunidade';
 else if(pathname.startsWith('/api/reports/')&&verb==='POST')kind='Interações com alertas';
 else if(pathname.startsWith('/api/favorites'))kind='Favoritos';
 else if(pathname.startsWith('/api/routines'))kind='Rotinas';
 else if(pathname.startsWith('/api/v2/assistant'))kind='MAVI (requisições)';
 if(kind)metrics.operationCounts[kind]=(metrics.operationCounts[kind]||0)+1;
}

export function adminUsers(data,{offset=0,limit=25}={}){
 const users=Array.isArray(data.users)?data.users:[];
 const safeOffset=Math.max(0,Math.min(100000,Math.floor(Number(offset)||0)));
 const safeLimit=Math.max(1,Math.min(50,Math.floor(Number(limit)||25)));
 const recent=users.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {total:users.length,offset:safeOffset,limit:safeLimit,items:recent.slice(safeOffset,safeOffset+safeLimit).map(u=>({id:u.id,name:String(u.name||'').slice(0,80),email:String(u.email||'').slice(0,180),createdAt:u.createdAt||null,verified:Boolean(u.verifiedAt),googleLinked:Boolean(u.googleSub),signupMethod:signupMethod(u),activity:userActivity(u)}))};
}
