/** Merge duplicate points across TomTom, Mapbox, OSM and official feeds.
 * Independent businesses in the same building are retained unless their
 * category AND normalized name match. No dedupe solely by address.
 */
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const meters=(a,b)=>Math.hypot((a[0]-b[0])*111320*Math.cos(a[1]*Math.PI/180),
 (a[1]-b[1])*110540);
const real=f=>typeof f?.id==='string'&&Array.isArray(f?.coords)&&f.coords.length===2&&
 f.coords.every(Number.isFinite);
const official=x=>x?.source==='OpenStreetMap'||String(x?.id||'').startsWith('mapbox-poi-');
const urgent=new Set(['obra','alerta-via','radar']);
export function dedupePublicFeatureSources(features=[]){
 if(!Array.isArray(features))return [];
 // Stable deterministic priority: existing map POIs win, new TomTom fills gaps.
 const sorted=features.filter(real).sort((a,b)=>{
  const pa=a.verified?4:official(a)?3:a.poi?1:2;
  const pb=b.verified?4:official(b)?3:b.poi?1:2;
  return pb-pa||String(a.id).localeCompare(String(b.id));
 });
 const selected=[],buckets=new Map();
 const cell=(x,y)=>x+'|'+y,step=.0004;
 for(const f of sorted){
  const x=Math.floor(f.coords[0]/step),y=Math.floor(f.coords[1]/step);
  const name=norm(f.name),generic=/^(obra na via|via interditada|faixa interditada|ocorrencia na via|alerta viario|radar fixo|radar)$/.test(name);
  let dup=false;
  for(let dx=-2;dx<=2&&!dup;dx++)for(let dy=-2;dy<=2&&!dup;dy++)
   for(const candidate of buckets.get(cell(x+dx,y+dy))||[]){
    if(candidate.type!==f.type)continue;
    const dist=meters(candidate.coords,f.coords);
    const sameName=name&&norm(candidate.name)===name;
    // Only matching named POIs; overlapping hospital and pharmacy are distinct.
    // Roadworks from two sources can refer to the same activity on a road.
    const sameAlert=urgent.has(f.type)&&generic&&
     /^(obra na via|via interditada|faixa interditada|ocorrencia na via|alerta viario|radar fixo|radar)$/.test(norm(candidate.name));
    if((sameName&&dist<=60)||(sameAlert&&dist<=24)){dup=true;break;}
   }
  if(dup)continue;
  selected.push(f);const k=cell(x,y);
  if(!buckets.has(k))buckets.set(k,[]);
  buckets.get(k).push(f);
 }
 return selected;
}
