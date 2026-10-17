/**
 * Offline PRF accident CSV aggregation. This is NOT a live incident feed.
 * Usage: node scripts/import-prf-accidents.mjs <accidentes.csv> <output.json>
 * Source: https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf
 * Do not commit raw accident records or personal information.
 */
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2],output=process.argv[3];
if(!input||!output){console.error('Usage: node scripts/import-prf-accidents.mjs input.csv output.json');process.exitCode=2;}
else{
 const stat=fs.statSync(input);
 if(stat.size>140*1024*1024)throw Error('PRF CSV too large for one aggregation');
 const text=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'');
 const lines=text.split(/\r?\n/);
 const parse=(line)=>{const out=[];let cell='',quote=false;
  for(let i=0;i<line.length;i++){const c=line[i];
   if(c==='"'){if(quote&&line[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
   else if(c===';'&&!quote){out.push(cell);cell='';}else cell+=c;
  }out.push(cell);return out;};
 const names=parse(lines[0]).map(s=>s.toLowerCase().trim());
 const xI=names.indexOf('longitude'),yI=names.indexOf('latitude'),idI=names.indexOf('id');
 if(xI<0||yI<0)throw Error('CSV PRF sem longitude/latitude; verifique o arquivo por ocorrência.');
 const cells=new Map(),dedup=new Set();
 for(const line of lines.slice(1)){
  if(!line.trim())continue;
  const f=parse(line),x=Number(String(f[xI]||'').replace(',','.')),
   y=Number(String(f[yI]||'').replace(',','.'));
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<-75||x>-32||y<-35||y>6)continue;
  if(idI>=0&&f[idI]){const id=f[idI].trim();if(dedup.has(id))continue;dedup.add(id);}
  // ~1km cells. Aggregates prevent presenting a historical occurrence as an active alert.
  const gx=Math.floor(x*100)/100,gy=Math.floor(y*100)/100,key=gx.toFixed(2)+':'+gy.toFixed(2);
  cells.set(key,(cells.get(key)||0)+1);
 }
 const rows=[...cells].filter(([k,count])=>count>=3).map(([key,count])=>{
  const [lon,lat]=key.split(':').map(Number);return [lon,lat,count];
 }).sort((a,b)=>b[2]-a[2]);
 const payload={dataset:'PRF historical accidents',historical:true,live:false,source:'Polícia Rodoviária Federal',
  importedAt:new Date().toISOString(),originalRecords:dedup.size||null,cellSizeDegrees:0.01,rows};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(payload));
 console.log('PRF historical grid created:',rows.length,'aggregate cells');
}
