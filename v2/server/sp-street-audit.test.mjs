import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SP_STREET_QA,adminStreetAuditSnapshot,mayUseStreetAuditForRouting} from './sp-street-audit.mjs';

test('SP street audit is strictly a catalog, never a fabricated traffic engine',()=>{
 const x=adminStreetAuditSnapshot();
 assert.equal(x.records,7500);
 assert.equal(x.internallyConsistent+x.reviewRequired,x.records);
 assert.equal(x.evidence.historicTrafficSamples,0);
 assert.equal(x.evidence.verifiedPeakHours,0);
 assert.equal(x.evidence.routingEligible,0);
 assert.equal(x.modifiesEta,false);
 assert.equal(x.modifiesRoute,false);
 assert.equal(x.mode,'audit-only');
 assert.equal(x.sourceSha256.length,64);
 assert.notEqual(x.issues.nameDistrictNotFound,0);
});
test('readiness fails closed on absent licenses, legal turns and traffic samples',()=>{
 assert.equal(mayUseStreetAuditForRouting({}),false);
 assert.equal(mayUseStreetAuditForRouting({verifiedTraffic:true,licenseApproved:true,directionVerified:true,topologyVerified:true,alternateLegal:true,sampleCount:11,adminApproved:true}),false);
 assert.equal(mayUseStreetAuditForRouting({verifiedTraffic:true,licenseApproved:false,directionVerified:true,topologyVerified:true,alternateLegal:true,sampleCount:80,adminApproved:true}),false);
 assert.equal(mayUseStreetAuditForRouting({verifiedTraffic:true,licenseApproved:true,directionVerified:true,topologyVerified:true,alternateLegal:true,sampleCount:12,adminApproved:true}),true);
});
test('audit API keeps administrator session checks; map UI remains admin-gated',()=>{
 const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 const from=server.indexOf("pathname==='/api/admin/sp-street-audit'");
 const to=server.indexOf("  // Server-only SPTrans bridge",from);
 assert.ok(from>0&&to>from);
 const block=server.slice(from,to);
 assert.match(block,/userSession\(req\)/);
 assert.match(block,/isAdminAccount\(session.user\)/);
 assert.match(block,/Cache-Control/);
 assert.doesNotMatch(block,/trafficMemoryReader\.load|setPaintProperty|INSERT INTO|writeFileSync/);
 const map=readFileSync(new URL('../src/pages/MapPage.jsx',import.meta.url),'utf8');
 assert.match(map,/adminV2RoadSigns&&<AdminStreetAudit\/>/);
 assert.equal(SP_STREET_QA.modifiesRoute,false);
});
