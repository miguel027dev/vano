import test from 'node:test';
import assert from 'node:assert/strict';
import {maviTrafficSummary} from './maviTrafficSummary.mjs';
test('MAVI only uses recent traffic evidence authorized for administrator map',()=>{
 const feed={hasData:true,status:'ok',events:[{severity:'stopped',delaySeconds:180},{severity:'heavy',delaySeconds:75}]};
 assert.deepEqual(maviTrafficSummary(feed,{authorized:true,hasRoute:true}),{hasData:true,incidentCount:2,heavySegments:2,maxIncidentDelayMinutes:3});
 assert.equal(maviTrafficSummary(feed,{authorized:false,hasRoute:true}),null);
 assert.equal(maviTrafficSummary({...feed,status:'stale'},{authorized:true,hasRoute:true}),null);
 assert.equal(maviTrafficSummary({...feed,hasData:false},{authorized:true,hasRoute:true}),null);
});
