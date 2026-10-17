import test from 'node:test';
import assert from 'node:assert/strict';
import {quickReportPosition,quickReportMotionBlocked} from './quickReport.js';
const now=Date.parse('2026-10-17T19:00:00Z');
const fix={coords:[-46.6557,-23.5615],sourceAt:now-2000,accuracy:21};
test('quick report uses only fresh measured GPS, not stale or low-accuracy samples',()=>{
 assert.deepEqual(quickReportPosition(fix,now).coords,fix.coords);
 assert.notEqual(quickReportPosition({...fix,sourceAt:now-21000},now).coords,fix.coords);
 assert.equal(quickReportPosition({...fix,accuracy:150},now).coords,null);
 assert.equal(quickReportPosition({...fix,sourceAt:now+1000},now).coords,null);
 assert.equal(quickReportPosition({coords:null,sourceAt:now,accuracy:12},now).coords,null);
 assert.equal(quickReportPosition({coords:[300,0],sourceAt:now,accuracy:12},now).coords,null);
});
test('in navigation, moving vehicles cannot enter the confirm-submit path',()=>{
 assert.equal(quickReportMotionBlocked(true,5),true);
 assert.equal(quickReportMotionBlocked(true,0),false);
 assert.equal(quickReportMotionBlocked(false,5),false);
 assert.equal(quickReportMotionBlocked(true,null),false);
});
