import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStreetAuditCsv} from './spStreetAuditCsv.mjs';

function sampleCsv({badPeak=false,badCount=false,dupe=false}={}){
 const rows=['id,name,district,cartography_internal_status,flags,peak_measured,eligible_for_v2_routing'];
 for(let i=1;i<=7500-(badCount?1:0);i++){
  const id='SP-RUA-'+String(dupe&&i===2?1:i).padStart(5,'0');
  const status=i<=7421?'INTERNAL_CARTOGRAPHY_MATCH':'REVIEW_REQUIRED';
  rows.push([id,'"Rua, do Exemplo"',i%2?'MORUMBI':'BUTANTA',status,status==='REVIEW_REQUIRED'?'LENGTH_MISMATCH':'',badPeak&&i===3?'True':'False','False'].map(v=>String(v).includes(',')?'"'+String(v).replaceAll('"','""')+'"':v).join(','));
 }
 return rows.join('\r\n');
}
test('local admin import accepts exactly 7500 well-formed streets and quoted commas',()=>{
 const rows=parseStreetAuditCsv(sampleCsv());
 assert.equal(rows.length,7500);
 assert.equal(rows[0].name,'"Rua, do Exemplo"');
 assert.equal(rows[7499].status,'REVIEW_REQUIRED');
});
test('missing record, duplicate ID or invented real-world traffic are blocked',()=>{
 assert.throws(()=>parseStreetAuditCsv(sampleCsv({badCount:true})),/7.500/);
 assert.throws(()=>parseStreetAuditCsv(sampleCsv({dupe:true})),/repetidos/);
 assert.throws(()=>parseStreetAuditCsv(sampleCsv({badPeak:true})),/sem evidência/);
});
test('arbitrary table with wrong audit schema is not accepted',()=>{
 assert.throws(()=>parseStreetAuditCsv('id,name\nSP-RUA-00001,Example'),/CSV de auditoria/);
});
