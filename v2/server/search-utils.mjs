/** Deterministic search ordering: main named place before shops inside it. */
export const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export const postalDigits = value => String(value || '').replace(/\D/g,'');
export function rankSearchResults(items, query) {
  const q=fold(query), digits=postalDigits(query), isCep=/^\d{5}-?\d{3}$/.test(String(query||'').trim());
  const seen=new Set();
  return (Array.isArray(items)?items:[]).filter(item=>{
    if(!item || typeof item.name!=='string' || !Array.isArray(item.coords) || item.coords.length!==2 || !item.coords.every(Number.isFinite))return false;
    const key=String(item.id||'')||`${fold(item.name)}:${item.coords.map(n=>n.toFixed(5)).join(',')}`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).map((item,index)=>{
    const n=fold(item.name),a=fold(item.address);
    const match=isCep && postalDigits(item.name+' '+item.address).includes(digits) ? 0
      : n===q ? 0
      : n.startsWith(q) ? 1
      : n.includes(q) ? 2
      : q.split(' ').every(word=>n.includes(word)) ? 3
      : a.includes(q) ? 5 : 6;
    return {item,index,match};
  }).sort((a,b)=>a.match-b.match||a.index-b.index).map(x=>x.item).slice(0,8);
}
