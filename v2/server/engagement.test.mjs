import test from 'node:test';
import assert from 'node:assert/strict';
import {dateKey,visitAccount,userActivity,activitySummary} from './engagement.mjs';
test('refresh and repeated bootstrap do not inflate visit counts',()=>{
 const u={},now=Date.parse('2026-10-14T15:00:00Z');
 assert.equal(visitAccount(u,now),true);
 assert.equal(visitAccount(u,now+60000),false);
 assert.equal(visitAccount(u,now+1800000),true);
 assert.equal(userActivity(u,now+1800000).visits,2);
 assert.equal(userActivity(u,now+1800000).uniqueDays,1);
});
test('streak tracks distinct Sao Paulo calendar days',()=>{
 const u={};
 const d=n=>Date.parse('2026-10-'+n+'T15:00:00Z');
 visitAccount(u,d('13'));visitAccount(u,d('14'));visitAccount(u,d('15'));
 assert.equal(userActivity(u,d('15')).currentStreak,3);
 assert.equal(userActivity(u,d('17')).currentStreak,0);
 visitAccount(u,d('17'));
 assert.equal(userActivity(u,d('17')).longestStreak,3);
 assert.equal(userActivity(u,d('17')).currentStreak,1);
});
test('return rate uses distinct active days instead of page refreshes',()=>{
 const a={},b={};const d=Date.parse('2026-10-14T15:00:00Z');
 visitAccount(a,d);visitAccount(a,d+86400000);visitAccount(b,d);
 const s=activitySummary([a,b],d+86400000);
 assert.equal(s.returningAccounts30,1);
 assert.equal(s.activeAccounts30,2);
 assert.equal(s.returnRate30,50);
});
test('timezone is Sao Paulo',()=>assert.equal(dateKey(Date.parse('2026-10-16T01:00:00Z')),'2026-10-15'));
