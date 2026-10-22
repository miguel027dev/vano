// RFC 4180-style quoted CSV parser; the file never leaves the browser.
// Limit inputs to the admin's 7,500-row audit, not arbitrary uploaded data.
export function parseStreetAuditCsv(text){
 if(typeof text!=='string'||text.length>5_000_000)throw Error('Arquivo inválido ou grande demais.');
 const rows=[];let cells=[],part='',quoted=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(char==='"'){
   if(quoted&&text[i+1]==='"'){part+='"';i++;}else quoted=!quoted;
  }else if(!quoted&&char===','){cells.push(part);part='';}
  else if(!quoted&&(char==='\n'||char==='\r')){
   if(char==='\r'&&text[i+1]==='\n')i++;
   cells.push(part);part='';if(cells.some(x=>x.length))rows.push(cells);cells=[];
   if(rows.length>7501)throw Error('Arquivo excede 7.500 ruas.');
  }else part+=char;
 }
 if(quoted)throw Error('CSV malformado: aspas não fechadas.');
 if(part||cells.length){cells.push(part);rows.push(cells);}
 const header=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim())||[];
 const required=['id','name','district','cartography_internal_status','peak_measured','eligible_for_v2_routing'];
 if(required.some(x=>!header.includes(x)))throw Error('Use o CSV de auditoria VANO SP7500, não a lista bruta.');
 if(rows.length!==7500)throw Error('Arquivo incompleto: a auditoria exige exatamente 7.500 registros.');
 const indices=Object.fromEntries(header.map((h,i)=>[h,i]));
 const mapped=rows.map(cols=>({
  id:(cols[indices.id]||'').trim(),
  name:(cols[indices.name]||'').trim().slice(0,140),
  district:(cols[indices.district]||'').trim().slice(0,80),
  status:(cols[indices.cartography_internal_status]||'').trim(),
  flags:(cols[indices.flags]||'').trim().slice(0,250),
  peak:(cols[indices.peak_measured]||'').trim().toLowerCase(),
  eligible:(cols[indices.eligible_for_v2_routing]||'').trim().toLowerCase()
 }));
 if(new Set(mapped.map(x=>x.id)).size!==7500)throw Error('Há IDs repetidos no CSV.');
 if(mapped.some(x=>!/^SP-RUA-\d{5}$/.test(x.id)||!x.name||!x.district))throw Error('IDs, nomes ou distritos inválidos.');
 if(mapped.some(x=>x.peak!=='false'||x.eligible!=='false'))
  throw Error('O arquivo declara tráfego ou rotas habilitadas sem evidência.');
 if(mapped.filter(x=>x.status==='INTERNAL_CARTOGRAPHY_MATCH').length!==7421||
  mapped.filter(x=>x.status==='REVIEW_REQUIRED').length!==79)
  throw Error('Contagens de auditoria diferentes do relatório de referência.');
 return mapped;
}

