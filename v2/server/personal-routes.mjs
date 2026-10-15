// Deterministic preference parser and opt-in routine discovery.
// Neither algorithm decides whether a street is proven safe.
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function interpretRouteStyle(value=''){
  if(typeof value!=='string'||value.length>500)throw new Error('Escreva até 500 caracteres.');
  const text=value.trim(), n=normalize(text);
  const avoiding=(noun)=>{
    const clause=n.split(/[.;!\n]+/).find(part=>noun.test(part))||'';
    return Boolean(clause&&!/\bnao\s+(?:quero|preciso|gosto de)\s+evitar\b/.test(clause)&&/\b(?:evit\w*|fug\w*|sem|dispens\w*|nao quero passar)\b/.test(clause));
  };
  const avoidTolls=avoiding(/pedagi|toll/);
  const avoidFerries=avoiding(/balsa|ferry/);
  const avoidUnpaved=avoiding(/terra|sem asfalto|nao pavimentad|estrada de chao/);
  const fast=/\b(?:rapido|rapidez|menor tempo|chegar logo|economiz\w* tempo)\b/.test(n);
  const calm=/\b(?:tranquil|calm|sossegad|sem estresse|equilibr)/.test(n);
  const cautious=/\b(?:segur|menor risco|menos risco)/.test(n);
  const preferredRoute=fast&&!calm&&!cautious?'fast':'safe';
  const understood=[
    ...(fast?['Priorizar agilidade quando houver alternativas']:[]),
    ...(calm||cautious?['Dar mais importância à tranquilidade e aos indicadores disponíveis']:[]),
    ...(avoidTolls?['Evitar pedágios quando suportado']:[]),
    ...(avoidFerries?['Evitar balsas quando suportado']:[]),
    ...(avoidUnpaved?['Evitar vias não pavimentadas quando suportado']:[])
  ];
  const requiresMoreData=/avenida\w* movimentad|ruas? iluminad|ruas? vazias?|bairro\w* tranquil/.test(n)
    ?['Para recomendar tipos de via, precisamos de dados confiáveis adicionais.']: [];
  return {text,preferredRoute,avoidTolls,avoidFerries,avoidUnpaved,understood,requiresMoreData,needsReview:!!text&&!understood.length};
}
const rad=x=>x*Math.PI/180;
export function meters(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2)return Infinity;
  const [lon,lat]=a,[otherLon,otherLat]=b;
  if(![lon,lat,otherLon,otherLat].every(Number.isFinite))return Infinity;
  const dLat=rad(otherLat-lat),dLon=rad(otherLon-lon);
  const f=Math.sin(dLat/2)**2+Math.cos(rad(lat))*Math.cos(rad(otherLat))*Math.sin(dLon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(f)));
}
export function discoverRoutine(history,ownerId,{minimum=15,now=Date.now()}={}){
  const items=(history||[]).filter(x=>x.owner===ownerId&&x.completedAt&&x.origin&&
    Array.isArray(x.origin)&&x.destination?.coords&&Number.isFinite(Date.parse(x.completedAt))&&
    now-Date.parse(x.completedAt)<45*86400000&&now>=Date.parse(x.completedAt));
  if(items.length<minimum)return {completed:items.length,minimum,candidate:null};
  const groups=[];
  for(const trip of items.slice(-500)){
    const hour=Number.isInteger(trip.localHour)?trip.localHour:new Date(trip.createdAt).getUTCHours();
    const day=Number.isInteger(trip.localWeekday)?trip.localWeekday: (new Date(trip.createdAt).getUTCDay()+6)%7;
    let group=groups.find(g=>meters(g.origin,trip.origin)<=150&&meters(g.destination,trip.destination.coords)<=150&&Math.abs(g.hour-hour)<=1);
    if(!group){group={origin:trip.origin,destination:trip.destination.coords,label:trip.destination.name||'Destino habitual',hour,count:0,days:[],dates:new Set()};groups.push(group);}
    group.count++;group.days.push(day);group.dates.add(trip.createdAt.slice(0,10));
  }
  const candidates=groups.filter(g=>g.count>=4&&g.dates.size>=2).sort((a,b)=>b.count-a.count);
  const best=candidates[0];
  return {completed:items.length,minimum,candidate:best?{origin:best.origin,destination:best.destination,label:best.label,hour:best.hour,weekdays:[...new Set(best.days)].sort(),count:best.count}:null};
}
