import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRoadAuditCsv,SP_ROAD_AUDIT_BASELINE} from './roadAuditCsv.mjs';
const header='id,name,district,cartography_internal_status,flags,peak_measured,eligible_for_v2_routing';
test('CEM 2025 audit counts never masquerade as measured traffic',()=>{
 assert.equal(SP_ROAD_AUDIT_BASELINE.total,7500);
 assert.equal(SP_ROAD_AUDIT_BASELINE.consistent+SP_ROAD_AUDIT_BASELINE.review,7500);
 assert.equal(SP_ROAD_AUDIT_BASELINE.confirmedPeakSlots,0);
 assert.equal(SP_ROAD_AUDIT_BASELINE.routingEligible,0);
});
test('admin accepts real audit CSV schema and quoted street names',()=>{
 const csv='\uFEFF'+header+'\r\nSP-RUA-00001,"R Dr ""José"", centro",MORUMBI,INTERNAL_CARTOGRAPHY_MATCH,,False,False\r\nSP-RUA-00002,R das Palmeiras,PINHEIROS,REVIEW_REQUIRED,LENGTH_MISMATCH,False,False';
 const x=parseRoadAuditCsv(csv);
 assert.equal(x.total,2);
 assert.equal(x.consistent,1);
 assert.equal(x.review,1);
 assert.equal(x.rows[0].name,'R Dr "José", centro');
 assert.equal(x.rows[1].flags,'LENGTH_MISMATCH');
});
test('bad CSV, duplicate IDs, route eligibility bypass and huge input all fail closed',()=>{
 assert.throws(()=>parseRoadAuditCsv('name,district\nRua,SP'),/Escolha o CSV/);
 assert.throws(()=>parseRoadAuditCsv(header+'\nSP-RUA-00001,A,B,INTERNAL_CARTOGRAPHY_MATCH,,False,False\nSP-RUA-00001,B,C,INTERNAL_CARTOGRAPHY_MATCH,,False,False'),/repetido/);
 assert.throws(()=>parseRoadAuditCsv(header+'\nSP-RUA-00001,A,B,INTERNAL_CARTOGRAPHY_MATCH,,True,True'),/Bloqueado/);
 assert.throws(()=>parseRoadAuditCsv('x'.repeat(8_000_001)),/muito grande/);
 assert.throws(()=>parseRoadAuditCsv(header+'\nSP-RUA-00001,"sem fim,B,C,D,E,F'),/aspas/);
});
test('V2 road catalog is never imported by routing and is restricted to admin UI',()=>{
 const page=readFileSync(new URL('../pages/MapPage.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../components/RoadAuditPanel.jsx',import.meta.url),'utf8');
 assert.match(page,/adminV2RoadSigns&&roadAuditOpen&&<RoadAuditPanel/);
 assert.match(page,/adminV2RoadSigns&&<button[^>]*v2-admin-road-audit-toggle/);
 assert.doesNotMatch(panel, /api\(|fetch\(|setRoute|calculateRoute\(/);
 const routes=readFileSync(new URL('../../server/traffic-memory.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(routes,/roadAuditCsv|RoadAuditPanel/);
});
