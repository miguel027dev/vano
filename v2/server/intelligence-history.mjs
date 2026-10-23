/** Historical operational intelligence from data VANO V2 already persists.
 * No user-level records, destinations, coordinates, descriptions or identifiers
 * cross this boundary. This is a query-time aggregate, not a training dataset.
 */
import {activitySummary, userActivity} from './engagement.mjs';

const DAY=86400000;
const goodDate=value=>{
 const t=Date.parse(typeof value==='string'?value:'');
 return Number.isFinite(t)?t:null;
};
const num=x=>typeof x==='number'&&Number.isFinite(x)?x:0;
const mean=list=>list.length?Math.round(list.reduce((a,b)=>a+b,0)/list.length*10)/10:null;
const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
const safeCategory=value=>{
 const s=String(value||'unknown').toLowerCase().replace(/[^a-z0-9_:-]/g,'').slice(0,35);
 return s||'unknown';
};
function histogram(rows,getCategory,limit=12){
 const counts=new Map();
 for(const x of rows){
  const key=safeCategory(getCategory(x));
  counts.set(key,(counts.get(key)||0)+1);
 }
 return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
}
function monthly(rows,getDate,limit=24){
 const map=new Map();
 for(const row of rows){
  const t=goodDate(getDate(row));
  if(t===null)continue;
  const key=new Date(t).toISOString().slice(0,7);
  map.set(key,(map.get(key)||0)+1);
 }
 return [...map].sort((a,b)=>a[0].localeCompare(b[0])).slice(-limit)
  .map(([month,count])=>({month,count}));
}
function bounded(rows,max=100000){
 return Array.isArray(rows)?rows.slice(0,max):[];
}
export const HISTORICAL_SOURCES=Object.freeze({
 historical_inventory:'Cobertura e disponibilidade do acervo V2 já existente desde antes do Intelligence.',
 historical_users:'Cadastros, datas de entrada, atividade de contas e retenção em agregados.',
 historical_routes:'Histórico persistido de trajetos salvos, duração planejada, distância e modalidades.',
 historical_reports:'Relatos de trânsito e outras ocorrências, por categoria e verificação.',
 historical_engagement:'Visitas e atividade recorrente das contas já acompanhadas no V2.',
 historical_product:'Quantidade de favoritos, rotinas e preferências; sem nomes, horários ou endereços.',
 historical_operations:'Volume e latência de chamadas da instância atual; páginas e aparelhos por classe.',
});

function timeframe(input='all',now=Date.now()){
 const days=input==='all'?'all':[1,7,30,90,365].includes(Number(input))?Number(input):'all';
 return {days,cutoff:days==='all'?Number.NEGATIVE_INFINITY:now-days*DAY,now};
}
export function historicalIntelligence(data={},runtime={}, {period='all',now=Date.now()}={}){
 const {days,cutoff}=timeframe(period,now);
 const raw={
  users:bounded(data.users),history:bounded(data.history),
  reports:bounded(data.reports),favorites:bounded(data.favorites),
  routines:bounded(data.routines),preferences:bounded(data.preferences),
 };
 // All-time collections and time-filtered collections are intentionally distinct.
 const active=(rows,field)=>rows.filter(x=>{
  const t=goodDate(x?.[field]);
  return t!==null&&t>=cutoff&&t<=now;
 });
 const users=active(raw.users,'createdAt'),routes=active(raw.history,'createdAt'),reports=active(raw.reports,'createdAt');
 const allDates=[
  ...raw.users.map(x=>goodDate(x?.createdAt)),
  ...raw.history.map(x=>goodDate(x?.createdAt)),
  ...raw.reports.map(x=>goodDate(x?.createdAt))
 ].filter(v=>v!==null&&v<=now);
 const earliest=allDates.length?new Date(Math.min(...allDates)).toISOString().slice(0,10):null;
 const newest=allDates.length?new Date(Math.max(...allDates)).toISOString().slice(0,10):null;
 const routeDuration=routes.map(x=>x.duration).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=1440);
 const routeDistance=routes.map(x=>x.distance).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<3000);
 const activeUsers=raw.users.map(u=>userActivity(u,now));
 const engagement=activitySummary(raw.users,now);
 const reportVerified=reports.filter(r=>r.status==='verificado').length;
 const result={
  historical_inventory:{
   period:days,firstKnownRecordDate:earliest,lastKnownRecordDate:newest,
   existingCollections:{
    accounts:raw.users.length,savedRoutes:raw.history.length,
    reports:raw.reports.length,favorites:raw.favorites.length,
    routines:raw.routines.length,preferenceRecords:raw.preferences.length
   },
   scope:'Somente coleções realmente acessíveis ao servidor VANO V2. Não inclui banco Flask/V1, dados brutos de Mapbox/TomTom, históricos apagados ou logs externos.'
  },
  historical_users:{
   signupsInPeriod:users.length,allRegisteredAccounts:raw.users.length,
   verifiedInPeriod:users.filter(x=>Boolean(x.verifiedAt)).length,
   signupMethod:histogram(users,x=>x.signupMethod==='google'?'google':x.signupMethod==='email'?'email':'legacy_or_unknown'),
   signupMonthly:monthly(users,x=>x.createdAt),
   unverifiedCountCurrent:raw.users.filter(x=>!x.verifiedAt).length,
   note:'Conta verificada é status atual; não há necessariamente data histórica de verificação.'
  },
  historical_routes:{
   savedInPeriod:routes.length,savedAllTime:raw.history.length,
   byRouteType:histogram(routes,x=>x.routeType),
   monthly:monthly(routes,x=>x.createdAt),
   averagePlannedMinutes:mean(routeDuration),durationSamples:routeDuration.length,
   averagePlannedKm:mean(routeDistance),distanceSamples:routeDistance.length,
   note:'Não é quantidade de requisições nem de viagens realmente concluídas. Origens/destinos omitidos.'
  },
  historical_reports:{
   sentInPeriod:reports.length,sentAllTime:raw.reports.length,verifiedInPeriod:reportVerified,
   verificationRatePct:pct(reportVerified,reports.length),
   byCategory:histogram(reports,x=>x.type),
   byStatus:histogram(reports,x=>x.status),
   monthly:monthly(reports,x=>x.createdAt),
   note:'Relatos de usuários não são medições oficiais do trânsito. Localizações e descrições omitidas.'
  },
  historical_engagement:{
   ...engagement,visitsSinceTrackingStarted:activeUsers.reduce((sum,x)=>sum+num(x.visits),0),
   trackedAccounts:activeUsers.filter(x=>x.visits>0).length,
   note:'Atividade iniciada quando instrumentada; não reconstrói acessos anteriores. Retenção sempre referente aos últimos 30 dias.'
  },
  historical_product:{
   favoriteRecordsCurrentlySaved:raw.favorites.length,
   routineRecordsCurrentlySaved:raw.routines.length,
   preferenceRecordsCurrentlySaved:raw.preferences.length,
   note:'Estoque atual, não atividades realizadas no período. Não transmite dados pessoais, nomes, destinos ou horários.'
  },
  historical_operations:{
   instanceRequests:num(runtime.requests),instanceRouteCalls:num(runtime.routeRequests),
   instanceRouteErrors:num(runtime.routeErrors),
   instanceRouteFailurePct:pct(num(runtime.routeErrors),num(runtime.routeRequests)),
   instanceAverageRouteMs:runtime.routeRequests?Math.round(num(runtime.routeLatencyMs)/runtime.routeRequests):null,
   platformLoads:Object.entries(runtime.platformPageLoads||{})
    .filter(([name,count])=>['Android','iOS / iPadOS','Windows','macOS','Linux','Não identificado'].includes(name)&&Number.isFinite(count))
    .map(([name,count])=>({name,count})).slice(0,8),
   note:'Estes dados são somente da instância Node atual e reiniciam a cada deploy. Não refletem todo o período selecionado.'
  },
 };
 return {period:days,inventory:result.historical_inventory,sources:result};
}
