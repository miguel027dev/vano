/** Offline inspection of the independently produced road-catalog QA export.
 * NOT A ROUTING INPUT. No timestamps, speed samples or legal turns are inferred.
 * The uploaded CSV stays in browser memory and is never POSTed to the server.
 */
export const SP_ROAD_AUDIT_BASELINE=Object.freeze({
  source:'CEM/USP LOG2025 RMSP (cartographic consistency only)',
  date:'2026-10-21', total:7500,consistent:7421,review:79,
  geometryNameDistrictMissing:46,segmentCountMismatch:33,lengthMismatch:30,
  confirmedPeakSlots:0,legalAlternatives:0,routingEligible:0,
  status:'CATALOG_ONLY',
  note:'Não há velocidade histórica por rua/sentido; geocódigo CET/GeoSampa e restrições de circulação pendentes.'
});
const REQUIRED=['id','name','district','cartography_internal_status','flags','peak_measured','eligible_for_v2_routing'];
export function parseRoadAuditCsv(source,{maxRows=12000}={}){
 if(typeof source!=='string'||source.length>8_000_000)throw Error('Arquivo inválido ou muito grande (limite 8 MB).');
 const text=source.replace(/^\uFEFF/,'');
 const records=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"'){if(cell.length===0)quoted=true;else throw Error('CSV inválido: aspas inesperadas.');}
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){row.push(cell);cell='';if(row.some(v=>v.trim())){records.push(row);if(records.length>maxRows+1)throw Error('CSV excedeu o máximo de linhas.');}row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  else cell+=c;
 }
 if(quoted)throw Error('CSV inválido: aspas não fechadas.');
 row.push(cell);if(row.some(v=>v.trim()))records.push(row);
 const header=records.shift()?.map(s=>s.trim())||[];
 if(!REQUIRED.every(k=>header.includes(k)))throw Error('Escolha o CSV VANO_SP7500_Auditoria_Cruzamento_CEM2025.csv gerado pela auditoria.');
 const indexes=Object.fromEntries(REQUIRED.map(k=>[k,header.indexOf(k)]));
 const used=new Set();const rows=[];
 for(const cells of records){
  if(cells.length!==header.length)throw Error('CSV inválido: número de colunas inconsistente.');
  const id=cells[indexes.id],name=cells[indexes.name],district=cells[indexes.district];
  if(!/^SP-RUA-\d{5}$/.test(id)||!name||!district||used.has(id))throw Error('Cadastro com ID repetido ou endereço inválido.');
  used.add(id);
  if(!/^(False|false|NÃO|NAO|0)$/i.test(cells[indexes.eligible_for_v2_routing]))throw Error('Bloqueado: o arquivo declarou roteamento aprovado sem validação.');
  const status=cells[indexes.cartography_internal_status],flags=cells[indexes.flags];
  rows.push({id,name:name.slice(0,120),district:district.slice(0,80),status,flags:flags.slice(0,220),hasPeak:/^(true|sim|1)$/i.test(cells[indexes.peak_measured])});
 }
 return {total:rows.length,consistent:rows.filter(r=>r.status==='INTERNAL_CARTOGRAPHY_MATCH').length,
  review:rows.filter(r=>r.status!=='INTERNAL_CARTOGRAPHY_MATCH').length,
  peakClaims:rows.filter(r=>r.hasPeak).length,rows};
}
