/** Deterministic search ordering: main named place before shops inside it. */
export const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export const postalDigits = value => String(value || '').replace(/\D/g,'');
/** Optional user-location bias breaks relevance ties; it never filters
 * remote results (including adjacent countries) out of the list. */
export function rankSearchResults(items, query, proximity=null, limit=10) {
  const q=fold(query), digits=postalDigits(query), isCep=/^\d{5}-?\d{3}$/.test(String(query||'').trim());
  const seen=new Set();
  return (Array.isArray(items)?items:[]).filter(item=>{
    if(!item || typeof item.name!=='string' || !Array.isArray(item.coords) || item.coords.length!==2 || !item.coords.every(Number.isFinite))return false;
    const key=String(item.id||'')||`${fold(item.name)}:${item.coords.map(n=>n.toFixed(5)).join(',')}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).map((item,index)=>{
    const n=fold(item.name),a=fold(item.address);
    const words=q.split(' ').filter(Boolean);
    const both=fold(item.name+' '+item.address);
    const hasAll=words.length>1&&words.every(word=>both.split(' ').includes(word));
    const acronym=q.length>=2&&q.length<=6&&(
      String(item.name).split(/[^\p{L}\p{N}]+/u).some(word=>fold(word)===q&&word===word.toUpperCase())||
      n.split(' ').filter(word=>!['de','da','do','das','dos','e','the','of'].includes(word)).map(word=>word[0]).join('')===q);
    const match=isCep && postalDigits(item.name)===digits ? 0
      : isCep && postalDigits(item.name+' '+item.address).includes(digits) ? 1
      : n===q || acronym ? 0
      : n.startsWith(q) ? 1
      : n.includes(q) ? 2
      : words.every(word=>n.includes(word)) ? 3
      : hasAll ? 4
      : a.includes(q) ? 5 : 6;
    const near=Array.isArray(proximity)&&proximity.length===2&&proximity.every(Number.isFinite);
    let distance=Infinity;
    if(near){
      const r=Math.PI/180;
      const dlat=(item.coords[1]-proximity[1])*r,dlon=(item.coords[0]-proximity[0])*r;
      const lat1=proximity[1]*r,lat2=item.coords[1]*r;
      const h=Math.min(1,Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2);
      distance=6371*2*Math.asin(Math.sqrt(h));
    }
    return {item,index,match,distance};
  }).sort((a,b)=>a.match-b.match||a.distance-b.distance||a.index-b.index).map(x=>x.item).slice(0,Math.max(1,Math.min(30,Number.isInteger(limit)?limit:10)));
}

/** Providers complement one another: merge before the final relevance cut.
 * Matching names within 75 m describe the same POI; neighboring businesses stay.
 */
export function mergeSearchResults(groups,query,proximity=null,limit=16){
 const merged=[];
 for(const item of groups.flat()){
  if(!item||!Array.isArray(item.coords)||!item.coords.every(Number.isFinite))continue;
  const duplicate=merged.some(existing=>{
   if(fold(existing.name)!==fold(item.name))return false;
   const dx=(existing.coords[0]-item.coords[0])*111320*Math.cos(item.coords[1]*Math.PI/180);
   const dy=(existing.coords[1]-item.coords[1])*110540;
   return Math.hypot(dx,dy)<=75;
  });
  if(!duplicate)merged.push(item);
 }
 return rankSearchResults(merged,query,proximity,limit);
}
