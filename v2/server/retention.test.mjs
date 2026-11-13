import test from 'node:test';
import assert from 'node:assert/strict';
import {recordRetentionPulse,retentionOverview,retentionUsers,retentionUserDetail} from './retention.mjs';

test('pulses count active foreground time, not inactivity or duplicate calls',()=>{
 const u={id:'u1'};
 const a=Date.parse('2026-11-10T12:00:00Z');
 assert.equal(recordRetentionPulse(u,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a).changed,true);
 assert.equal(recordRetentionPulse(u,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a+10_000).changed,false);
 recordRetentionPulse(u,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a+30_000);
 recordRetentionPulse(u,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',a+3_000_000);
 assert.equal(u.retention.sessionCount,2);
 assert.equal(u.retention.activeSeconds,30);
 assert.equal(u.retention.activeDays.length,1);
});
test('admin retention returns measured status for legacy users, no invented installs or route finishes',()=>{
 const now=Date.parse('2026-11-12T12:00:00Z');
 const one={id:'id1',name:'Conta A',email:'a@example.test',passwordHash:'NO_EXPOSE',
  retention:{firstOpenAt:'2026-11-10T12:00:00Z',lastPulseAt:'2026-11-12T11:59:00Z',
  activeDays:['2026-11-10','2026-11-11','2026-11-12'],activeSeconds:600,sessionCount:2}};
 const old={id:'id2',name:'Conta B',email:'b@example.test',createdAt:'2026-09-10'};
 const db={users:[one,old],history:[{owner:one.id,createdAt:'2026-11-10T12:01:00Z',
  destination:{coords:[-23.5,-46.6],address:'PRIVACY'},routeType:'fast',distance:10,duration:20}]};
 const stats=retentionOverview(db,{now,days:7});
 assert.equal(stats.measuredAccounts,1);
 assert.equal(stats.activeToday,1);
 assert.equal(stats.retention.d1.rate,100);
 const result=retentionUsers(db,{search:'Conta'});
 assert.equal(result.total,2);
 assert.equal(result.items.find(r=>r.id==='id2').firstOpenAt,null);
 assert.equal(result.items.find(r=>r.id==='id1').routeStarts,1);
 assert.equal(result.items.find(r=>r.id==='id1').routeCompletions,null);
 assert.equal(retentionUserDetail(db,'id1').recentRoutes.length,1);
 assert.equal(retentionUserDetail(db,'no-user'),null);
 assert.ok(!JSON.stringify({result,stats,profile:retentionUserDetail(db,'id1')}).includes('NO_EXPOSE'));
 assert.ok(!JSON.stringify({result,stats,profile:retentionUserDetail(db,'id1')}).includes('PRIVACY'));
 assert.ok(!JSON.stringify({result,stats,profile:retentionUserDetail(db,'id1')}).includes('-23.5'));
});
