/** Deterministic street-aware MAVI parsing & evidence, shared by route engine.
 * No LLM needed; street requests only succeed with verified named steps.
 */
const normalize=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[.,!?;:]+/g,' ').replace(/\s+/g,' ').trim();
export function roadKey(value){
 return normalize(value).replace(/\b(?:avenida|av|rua|r|rodovia|estrada|marginal|travessa|alameda|praca|viela|via|sentido)\b/g,'')
   .replace(/\s+/g,' ').trim();
}
const nonRoad=/^(?:outra rota|outro caminho|rota|caminho|essa rota|pedagio|transito|congestionamento|centro)$/;
export function extractJevStreetRequest(value){
 const text=normalize(value).slice(0,360);
 if(!text)return null;
 const patterns=[
  {kind:'avoid',rx:/\b(?:nao\s+(?:quero|gostaria|desejo)\s+(?:(?:ir|passar|seguir|pegar)\s+)?(?:pela?|por|na|no)\s+)(.+)$/},
  {kind:'avoid',rx:/\b(?:nao\s+(?:pega|pegue|passe|passa|passar|entre|entra|siga)\s+(?:pela?|na|no|por|a|o)\s+)(.+)$/},
  {kind:'avoid',rx:/\b(?:sem\s+(?:passar|ir|pegar|seguir)\s+(?:pela?|na|no|por|a|o)\s+)(.+)$/},
  {kind:'avoid',rx:/\b(?:(?:evita|evite|evitar|desvia|desviar)\s+(?:de\s+|da\s+|do\s+)?(?:a\s+|o\s+|pela?\s+|na\s+|no\s+)?)(.+)$/},
  {kind:'avoid',rx:/\b(?:tem\s+(?:um\s+)?(?:outro\s+)?caminho\s+(?:que\s+)?(?:nao\s+)?(?:passe|passa|pegue|pega)\s+(?:pela?|na|no|por|a|o)\s+)(.+)$/},
  {kind:'via',rx:/\b(?:quero|prefiro|vamos|pode|da\s+pra)\s+(?:ir|passar|pegar|seguir)\s+(?:pela?|por|via|na|no)\s+(.+)$/},
  {kind:'via',rx:/\b(?:sentido\s+)(avenida\s+.+|av\s+.+|rua\s+.+|r\s+.+)$/},
 ];
 for(const {kind,rx} of patterns){
  const m=text.match(rx);if(!m)continue;
  const raw=m[1].replace(/\s+(?:por\s+favor|tem\s+(?:um\s+)?outro\s+caminho|outra\s+rota|em\s+vez\s+disso|voce\s+(?:pode|acha|consegue|sabe)|pode\s+(?:mudar|trocar|recalcular)|me\s+(?:ajuda|diz)).*$/,'').trim();
  const road=roadKey(raw);
  if(road.length<4||road.length>72||nonRoad.test(road)||!/[a-z]/.test(road))continue;
  return {kind,road,spokenName:raw.slice(0,100)};
 }
 // Fallback for conversational negation such as "não tenho vontade de
 // atravessar a Avenida Morumbi. Você acha outro caminho?". Truncate
 // the road at a discourse word rather than treating the whole sentence
 // as its name. Real routing must still verify actual named road steps.
 if(/\b(?:nao|sem|evita|evite|evitar)\b.{0,120}\b(?:atravessar|passar|pegar|seguir|entrar|ir)\b/.test(text)){
  const explicit=text.match(/\b(avenida|av|rua|r|rodovia|estrada|marginal)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,8})/);
  if(explicit){
   const stop=new Set(['voce','acha','pode','poderia','tem','quero','queria',
     'que','qual','por','favor','outro','caminho','alternativa','mas','seria',
     'melhor','algum','como','entao','porque','pois','se','nao','agora']);
   const name=[];
   for(const word of explicit[2].split(/\s+/)){if(stop.has(word))break;name.push(word);}
   const spokenName=(explicit[1]+' '+name.join(' ')).trim();
   const road=roadKey(spokenName);
   if(road.length>=4&&road.length<=72&&!nonRoad.test(road))
    return {kind:'avoid',road,spokenName};
  }
 }
 return null;
}
function tokenSimilar(a,b){
 if(a===b||a.length>=5&&b.startsWith(a)||b.length>=5&&a.startsWith(b))return true;
 let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
 return i>=4&&Math.abs(a.length-b.length)<=3;
}
export function roadNameMatches(name,wanted){
 const target=roadKey(wanted),street=roadKey(name);
 if(!target||!street)return false;
 // "Marginal Pinheiros" must never be mistaken for "Rua Pinheiros".
 // Unknown aliases are intentionally not guessed from a matching neighborhood.
 if(/\bmarginal\b/.test(normalize(wanted))&&!/\bmarginal\b/.test(normalize(name)))return false;
 if(street===target||street.includes(target)||target.includes(street)&&street.length>=5)return true;
 const t=target.split(' ').filter(Boolean),v=street.split(' ').filter(Boolean);
 if(!t.length||!v.length)return false;
 // A transcription like "Giovanni Gronk" may refer to "Giovanni Gronchi",
 // but "Morumbi" must not match a random different road.
 return t.every(word=>v.some(candidate=>tokenSimilar(word,candidate))) &&
   (t.length>=2||t[0].length>=7);
}
export function routeRoadEvidence(route,wanted){
 const steps=Array.isArray(route?.steps)?route.steps:[];
 const named=steps.filter(s=>typeof s?.street==='string'&&s.street.trim());
 return {known:named.length>0,uses:named.some(s=>roadNameMatches(s.street,wanted))};
}
const pointOK=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;
const distanceSq=(p,q)=>(p[0]-q[0])**2*Math.cos((p[1]+q[1])/2*Math.PI/180)**2+(p[1]-q[1])**2;
function nearestIndex(coords,point,at=0){
 let closest=-1,best=Infinity;
 for(let i=at;i<coords.length;i++){
  if(!pointOK(coords[i]))continue;
  const d=distanceSq(coords[i],point);
  if(d<best){best=d;closest=i;}
 }
 return closest;
}
/** Sample interior points only from named road segments on provider-returned
 * full geometry. A maneuver's first point can be the previous intersection.
 */
export function excludedRoadPoints(routes,wanted,{max=5}={}){
 const collected=[];
 for(const route of Array.isArray(routes)?routes:[]){
  const steps=Array.isArray(route?.steps)?route.steps:[];
  const coords=route?.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<3||coords.length>100000)continue;
  for(let i=0;i<steps.length;i++){
   if(!roadNameMatches(steps[i]?.street,wanted)||!pointOK(steps[i]?.location))continue;
   const start=nearestIndex(coords,steps[i].location);
   const nextLoc=steps.slice(i+1).find(s=>pointOK(s?.location))?.location;
   const end=nextLoc?nearestIndex(coords,nextLoc,Math.max(0,start+1)):Math.min(coords.length-1,start+30);
   if(start<0||end<=start)continue;
   const indices=[Math.round(start+(end-start)*0.40),Math.round(start+(end-start)*0.70)];
   for(const idx of indices){
    const p=coords[idx];
    if(!pointOK(p)||collected.some(q=>distanceSq(q,p)<1e-9))continue;
    collected.push(p.map(v=>+v.toFixed(6)));
    if(collected.length>=max)return collected;
   }
  }
 }
 return collected;
}
/** A different route hash can still draw essentially the same path.
 * Use a bounded geometric comparison of the current remaining route before
 * telling a driver that a named avenue has been avoided. Conservative by
 * design: unknown geometry is not proof of a meaningful street bypass.
 */
export function routeGeometryDiffers(route,reference){
 const coords=route?.geometry?.coordinates;
 if(!Array.isArray(coords)||coords.length<2||coords.length>100000||
    !Array.isArray(reference)||reference.length<2||reference.length>400||
    !reference.every(pointOK))return false;
 const lat=reference[0][1]*Math.PI/180,sx=111320*Math.cos(lat),sy=110540;
 const meters=(a,b)=>Math.hypot((a[0]-b[0])*sx,(a[1]-b[1])*sy);
 const distanceFromReference=p=>{
  let nearest=Infinity;
  for(let j=1;j<reference.length;j++){
   const a=reference[j-1],b=reference[j],dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy;
   const denominator=dx*dx+dy*dy;
   const t=denominator>0?Math.max(0,Math.min(1,((p[0]-a[0])*sx*dx+(p[1]-a[1])*sy*dy)/denominator)):0;
   const distance=Math.hypot((p[0]-a[0])*sx-t*dx,(p[1]-a[1])*sy-t*dy);
   if(distance<nearest)nearest=distance;
  }
  return nearest;
 };
 const stride=Math.max(1,Math.ceil((coords.length-1)/180));
 let separatedMeters=0,maxSeparation=0,previous=0;
 for(let index=stride;index<coords.length+stride;index+=stride){
  const at=Math.min(coords.length-1,index),p=coords[at],from=coords[previous];
  if(!pointOK(p)||!pointOK(from))return false;
  const gap=distanceFromReference(p);
  maxSeparation=Math.max(maxSeparation,gap);
  if(gap>=65)separatedMeters+=meters(p,from);
  previous=at;
  if(at===coords.length-1)break;
 }
 // Both lateral displacement and a useful length of detour are required.
 return maxSeparation>=90&&separatedMeters>=170;
}
export function findStreetCandidate(routes,sourceKey,wanted,mode){
 const candidates=(Array.isArray(routes)?routes:[]).filter(r=>
  r&&['safe','fast'].includes(r.id)&&Number.isFinite(r.duration)&&r.duration>0&&
  routeRoadEvidence(r,wanted).known&&
  (mode==='avoid'?!routeRoadEvidence(r,wanted).uses:routeRoadEvidence(r,wanted).uses)
 );
 return candidates;
}
