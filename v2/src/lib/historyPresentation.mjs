import {measuredKilometers} from './travelDistance.js';
const text=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const timestamp=record=>Date.parse(record?.createdAt)||0;
const localDay=record=>{
  const date=new Date(record.createdAt);
  return Number.isFinite(date.getTime())?[date.getFullYear(),date.getMonth(),date.getDate()].join('-'):'unknown-'+record.id;
};

/** Group the view, never delete trips. Two destinations with the same name
 * but different coordinates/addresses remain separate. Dates follow the viewer. */
export function groupedHistory(records=[],{query=''}={}){
  const groups=new Map(),term=text(query);
  for(const record of [...records].filter(Boolean).sort((a,b)=>timestamp(b)-timestamp(a))){
    const destination=record.destination||{};
    if(term&&!text(destination.name+' '+destination.address).includes(term))continue;
    const point=validPoint(destination.coords)?destination.coords.map(n=>n.toFixed(5)).join(','):null;
    const placeKey=text(destination.name)+'|'+(point||text(destination.address));
    const key=localDay(record)+'|'+placeKey;
    const group=groups.get(key);
    if(group){group.count++;group.distanceKm+=measuredKilometers(record);}
    else groups.set(key,{key,latest:record,count:1,distanceKm:measuredKilometers(record)});
  }
  return [...groups.values()];
}

export function historyDistanceLabel(record,locale='pt-BR'){
  const km=measuredKilometers(record);
  if(km>0)return new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(km)+' km percorridos';
  return record?.measurementVersion===1?'Sem deslocamento registrado':'Distância não registrada';
}

export function historyDestination(records,id){
  if(typeof id!=='string'||id.length>100)return null;
  const found=records.find(record=>record?.id===id);
  return validPoint(found?.destination?.coords)?found.destination:null;
}
