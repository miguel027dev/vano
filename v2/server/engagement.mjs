/** Privacy-minimal activity counters: never store IP, precise location, or navigation. */
const DAY=86400000,WINDOW=30*60000,ZONE='America/Sao_Paulo';
const format=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
export function dateKey(ms){
 const p=Object.fromEntries(format.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function dayIndex(key){return Date.parse(key+'T00:00:00Z')/DAY;}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function visitAccount(user,at=Date.now()){
 if(!user||!finite(at))return false;
 const today=dateKey(at),iso=new Date(at).toISOString();
 const old=user.activity&&typeof user.activity==='object'&&!Array.isArray(user.activity)?user.activity:{};
 const previous=typeof old.lastActiveDay==='string'?old.lastActiveDay:'';
 const diff=previous?dayIndex(today)-dayIndex(previous):null;
 const oldLast=Date.parse(old.lastVisitAt||'');
 const newVisit=!Number.isFinite(oldLast)||at-oldLast>=WINDOW||at<oldLast;
 if(!newVisit&&diff===0)return false;
 const newDay=diff!==0;
 const activity={...old};
 activity.visits=Math.min(100000000,Math.max(0,Number(old.visits)||0)+(newVisit?1:0));
 if(!activity.firstVisitAt)activity.firstVisitAt=iso;
 if(newVisit)activity.lastVisitAt=iso;
 if(newDay){
  activity.lastActiveDay=today;
  activity.streak=diff===1?Math.max(1,Number(old.streak)||1)+1:1;
  activity.longestStreak=Math.max(Number(old.longestStreak)||0,activity.streak);
  const history=Array.isArray(old.days)?old.days.filter(x=>/^\d{4}-\d\d-\d\d$/.test(x)&&dayIndex(today)-dayIndex(x)>=0&&dayIndex(today)-dayIndex(x)<90):[];
  activity.days=[...new Set([...history,today])].sort();
  activity.uniqueDays=Math.min(100000000,Math.max(0,Number(old.uniqueDays)||0)+1);
 }
 user.activity=activity;
 return true;
}
export function userActivity(user,at=Date.now()){
 const a=user?.activity||{}, today=dayIndex(dateKey(at));
 const days=Array.isArray(a.days)?a.days.filter(x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&today-dayIndex(x)>=0&&today-dayIndex(x)<30):[];
 const last=typeof a.lastActiveDay==='string'?today-dayIndex(a.lastActiveDay):Infinity;
 return {visits:Math.max(0,Number(a.visits)||0),uniqueDays:Math.max(0,Number(a.uniqueDays)||0),
   currentStreak:last<=1?Math.max(0,Number(a.streak)||0):0,longestStreak:Math.max(0,Number(a.longestStreak)||0),
   activeDays30:days.length,lastVisitAt:a.lastVisitAt||null,trackedSince:a.firstVisitAt||null};
}
export function activitySummary(users,at=Date.now()){
 const items=(Array.isArray(users)?users:[]).map(u=>userActivity(u,at));
 const tracked=items.filter(x=>x.visits>0),active30=items.filter(x=>x.activeDays30>0);
 const returned=active30.filter(x=>x.activeDays30>=2);
 const repeatSessions=tracked.filter(x=>x.visits>=2);
 const total=tracked.reduce((sum,x)=>sum+x.visits,0);
 return {trackedAccounts:tracked.length,activeAccounts30:active30.length,returningAccounts30:returned.length,
   returnRate30:active30.length?Math.round(returned.length/active30.length*100):null,
   avgVisitsPerTrackedAccount:tracked.length?Math.round(total/tracked.length*10)/10:null,
   repeatVisitAccounts:repeatSessions.length,repeatVisitRate:tracked.length?Math.round(repeatSessions.length/tracked.length*100):null,
   definition:'Retorno 30d: conta ativa em pelo menos dois dias distintos nos últimos 30 dias; acesso: nova visita após 30 minutos de inatividade; contagem iniciada na implantação.'};
}
