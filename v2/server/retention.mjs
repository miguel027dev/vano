/**
 * VANO retention v1 — aggregated account activity without GPS, addresses,
 * IPs, device fingerprints or detailed navigation trails.
 * First-open means first measured authenticated opening after this rollout.
 */
const DAY=86400000;
const DAY_FORMAT=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const validTime=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?t:null;};
const dayKey=ms=>DAY_FORMAT.format(new Date(ms));
const round=v=>Math.round(v*10)/10;
const safeInt=(v,max=1000000)=>Math.min(max,Math.max(0,Math.floor(Number(v)||0)));
const safeDate=ms=>new Date(ms).toISOString();
const dayAt=(day,offset)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset,12)).getTime();};
const addDay=(day,offset)=>dayKey(dayAt(day,offset));
const sessions=u=>safeInt(u?.sessionCount||0);
const minutes=u=>round(safeInt(u?.activeSeconds||0,1e9)/60);
const avgSession=u=>sessions(u)?round(minutes(u)/sessions(u)):null;
const seen=u=>u?.lastPulseAt||null;
const routeRows=(db,id)=>Array.isArray(db?.history)?db.history.filter(r=>r?.owner===id):[];

/**
 * Send one pulse on opening, then every 30s while visible.
 * Only server measured time between two plausible visible pulses is counted.
 * A hidden tab or lost connection never accrues idle/background duration.
 */
export function recordRetentionPulse(user,sessionId,at=Date.now()){
 if(!user||typeof user!=='object'||!Number.isFinite(at)||typeof sessionId!=='string'||!/^[a-f0-9-]{16,64}$/i.test(sessionId))
  return {ok:false,changed:false};
 const usage=user.retention??={};
 const previous=validTime(usage.lastPulseAt);
 const same=usage.lastSessionId===sessionId;
 const delta=previous===null?null:(at-previous)/1000;
 if(previous!==null&&delta!==null&&delta>=0&&delta<20&&same)return {ok:true,changed:false};
 if(!usage.firstOpenAt)usage.firstOpenAt=safeDate(at);
 if(!same||delta===null||delta>1800||delta<0)usage.sessionCount=safeInt(usage.sessionCount,1e8)+1;
 else if(delta>=20&&delta<=90)usage.activeSeconds=safeInt(usage.activeSeconds,1e9)+Math.floor(delta);
 usage.lastPulseAt=safeDate(at);
 usage.lastSessionId=sessionId;
 const today=dayKey(at);
 if(!Array.isArray(usage.activeDays))usage.activeDays=[];
 if(!usage.activeDays.includes(today))usage.activeDays.push(today);
 if(usage.activeDays.length>120)usage.activeDays=usage.activeDays.slice(-120);
 return {ok:true,changed:true};
}
function account(db,u){
 const usage=u.retention||{},routes=routeRows(db,u.id);
 const firstRoute=routes.reduce((first,r)=>{
  const t=validTime(r.createdAt);return t!==null&&(first===null||t<first)?t:first;
 },null);
 return {
  id:String(u.id||'').slice(0,80),name:String(u.name||'').slice(0,80),
  email:String(u.email||'').slice(0,180),
  verified:Boolean(u.verifiedAt),createdAt:u.createdAt||null,
  firstOpenAt:usage.firstOpenAt||null,firstRouteAt:firstRoute===null?null:safeDate(firstRoute),
  routeStarts:routes.length,routeCompletions:null,
  activeMinutes:usage.firstOpenAt?minutes(usage):null,
  sessionCount:usage.firstOpenAt?sessions(usage):null,
  avgSessionMinutes:usage.firstOpenAt?avgSession(usage):null,
  lastActivityAt:seen(usage),
  activeDays:Array.isArray(usage.activeDays)?usage.activeDays.length:0
 };
}
export function retentionUsers(db,{offset=0,limit=20,search=''}={}){
 const q=String(search||'').trim().slice(0,100).toLocaleLowerCase('pt-BR');
 const rows=(db?.users||[]).filter(u=>!q||[u.name,u.email].some(s=>String(s||'').toLocaleLowerCase('pt-BR').includes(q)))
  .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const start=safeInt(offset,100000),size=Math.max(1,Math.min(50,safeInt(limit,50)||20));
 return {total:rows.length,offset:start,limit:size,items:rows.slice(start,start+size).map(u=>account(db,u))};
}
export function retentionUserDetail(db,id){
 const user=(db?.users||[]).find(u=>String(u.id)===String(id));
 if(!user)return null;
 const a=account(db,user);
 const recentRoutes=routeRows(db,user.id).slice(-15).reverse().map(r=>({
  createdAt:r.createdAt||null,mode:r.routeType||null,
  distanceKm:Number.isFinite(Number(r.distance))?round(Number(r.distance)):null,
  etaMinutes:Number.isFinite(Number(r.duration))?round(Number(r.duration)):null
 }));
 return {...a,recentRoutes};
}
export function retentionOverview(db,{now=Date.now(),days=30}={}){
 const today=dayKey(now),span=Math.max(7,Math.min(90,safeInt(days,90)||30));
 const tracked=(db?.users||[]).filter(u=>validTime(u?.retention?.firstOpenAt)!==null&&validTime(u.retention.firstOpenAt)<=now);
 const active=tracked.filter(u=>Array.isArray(u.retention.activeDays)&&u.retention.activeDays.includes(today));
 const within=n=>tracked.filter(u=>validTime(u.retention.lastPulseAt)!==null&&now-validTime(u.retention.lastPulseAt)<n*DAY).length;
 const cohort={};
 for(const n of [1,7,30]){
  const eligible=tracked.filter(u=>{
   const first=dayKey(validTime(u.retention.firstOpenAt));
   return dayAt(first,n)<=now && now-dayAt(first,0)<=120*DAY;
  });
  const returning=eligible.filter(u=>{
   const first=dayKey(validTime(u.retention.firstOpenAt));
   return (u.retention.activeDays||[]).includes(addDay(first,n));
  });
  cohort['d'+n]={eligible:eligible.length,returning:returning.length,rate:eligible.length?round(100*returning.length/eligible.length):null};
 }
 const totalSecs=tracked.reduce((sum,u)=>sum+safeInt(u.retention.activeSeconds,1e9),0);
 const totalSessions=tracked.reduce((sum,u)=>sum+sessions(u.retention),0);
 const daily=Array.from({length:span},(_,i)=>{
  const day=addDay(today,i-span+1);
  return {day,firstOpens:tracked.filter(u=>dayKey(validTime(u.retention.firstOpenAt))===day).length,
   activeAccounts:tracked.filter(u=>(u.retention.activeDays||[]).includes(day)).length,
   routeStarts:(db.history||[]).filter(r=>validTime(r.createdAt)!==null&&dayKey(validTime(r.createdAt))===day).length};
 });
 return {measuredAccounts:tracked.length,accountsTotal:(db?.users||[]).length,
  activeToday:active.length,active7d:within(7),active30d:within(30),
  avgSessionMinutes:totalSessions?round(totalSecs/totalSessions/60):null,
  averageMinutesPerMeasuredAccount:tracked.length?round(totalSecs/tracked.length/60):null,
  retention:cohort,daily,
  caveats:['Primeira abertura medida somente após implantação, para contas autenticadas.',
   'Sessões e permanência representam tempo observado em primeiro plano, não tempo de GPS em segundo plano.',
   'Rotas iniciadas usam histórico validado; conclusão da viagem ainda não é instrumentada.',
   'Downloads da Play Store precisam de uma fonte oficial separada.']};
}
