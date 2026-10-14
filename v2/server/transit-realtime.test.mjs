import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSIT_FRESHNESS,assessTransitFreshness,evaluateTransitPrediction,shouldPollTransit} from './transit-realtime.mjs';

const now=Date.parse('2026-10-14T19:45:00-03:00');
test('realtime requires original observation time, not fetch time',()=>{
 assert.equal(assessTransitFreshness({type:'tripUpdate',now}).status,'unknown');
 assert.equal(assessTransitFreshness({type:'tripUpdate',observedAt:new Date(now-30000).toISOString(),now}).status,'fresh');
 assert.equal(assessTransitFreshness({type:'tripUpdate',observedAt:Math.floor((now-120000)/1000),now}).status,'stale');
 assert.equal(assessTransitFreshness({type:'tripUpdate',observedAt:new Date(now+60000).toISOString(),now}).status,'invalid_future');
 assert.equal(TRANSIT_FRESHNESS.vehiclePosition,90000);
 assert.equal(TRANSIT_FRESHNESS.serviceAlert,600000);
});
test('stale source cannot render an ETA as real-time',()=>{
 const scheduledTime=new Date(now+300000).toISOString();
 const estimatedTime=new Date(now+480000).toISOString();
 const fresh=evaluateTransitPrediction({scheduledTime,estimatedTime,sourceObservedAt:new Date(now-25000).toISOString(),now});
 assert.equal(fresh.delayMinutes,3);
 assert.equal(fresh.freshness,'fresh');
 assert.equal(fresh.estimated,estimatedTime);
 const stale=evaluateTransitPrediction({scheduledTime,estimatedTime,sourceObservedAt:new Date(now-130000).toISOString(),now});
 assert.equal(stale.scheduled,scheduledTime);
 assert.equal(stale.estimated,null);
 assert.equal(stale.delayMinutes,null);
 assert.equal(stale.freshness,'stale');
 const unknown=evaluateTransitPrediction({scheduledTime,estimatedTime,now});
 assert.equal(unknown.estimated,null);
 assert.equal(unknown.freshness,'unknown');
});
test('realtime polling is gated by active journey, visible screen and verified region',()=>{
 const p={visible:true,hasCoverage:true,activeJourney:true,now,lastCheckAt:now-35000};
 assert.equal(shouldPollTransit(p),true);
 assert.equal(shouldPollTransit({...p,lastCheckAt:now-20000}),false);
 assert.equal(shouldPollTransit({...p,visible:false}),false);
 assert.equal(shouldPollTransit({...p,hasCoverage:false}),false);
 assert.equal(shouldPollTransit({...p,activeJourney:false}),false);
});
