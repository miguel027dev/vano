import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiObservability,sourceForUrl} from './api-observability.mjs';

test('provider classification never records query strings or tokens',()=>{
 const item=sourceForUrl('https://api.mapbox.com/directions/v5/mapbox/driving/A;B?access_token=super_secret');
 assert.deepEqual(item,{id:'mapbox',operation:'directions'});
 assert.equal(sourceForUrl('https://api.mapbox.com.evil.example.com/directions?access_token=secret'),null);
 assert.equal(sourceForUrl('not-a-url'),null);
});

test('real volume and failure counts, bucketed p95, and partner attribution',()=>{
 let current=Date.UTC(2026,10,6,11,0,0);
 const db={partnerKeys:[{id:'abcdef0123456789',name:'Vybz',active:true}]};
 const mon=createApiObservability({db,clock:()=>current,env:{}});
 mon.record('providers','mapbox','directions',200,110);
 mon.record('providers','mapbox','directions',429,290);
 mon.record('providers','tomtom','traffic',503,800);
 const fake={url:'/api/partner/v1/routes/calculate?lat=-23.5&token=private',
   method:'POST',vanoVerifiedPartnerId:'abcdef0123456789',vanoResponseBytes:241};
 mon.recordPartner(fake,{statusCode:200},current-100);
 const report=mon.report('24h');
 const mapbox=report.sources.find(x=>x.id==='mapbox');
 const vybz=report.partners.find(x=>x.id==='abcdef0123456789');
 assert.equal(mapbox.requests,2);
 assert.equal(mapbox.rate_limits,1);
 assert.equal(mapbox.success_pct,50);
 assert.ok(mapbox.p95_ms_upper_bound>=290);
 assert.equal(vybz.requests,1);
 assert.equal(vybz.response_bytes,241);
 assert.equal(vybz.operations[0].name,'POST:routes');
 assert.equal(report.summary.providerRequests,3);
 assert.equal(report.summary.partnerRequests,1);
 assert.doesNotMatch(JSON.stringify(db),/super_secret|private|-23\.5/);
 mon.stop();
});

test('unverified partner and unrecognized request path never count',()=>{
 const db={partnerKeys:[]};
 const mon=createApiObservability({db,env:{}});
 mon.recordPartner({url:'/api/partner/v1/routes',method:'GET',vanoVerifiedPartnerId:'bad/key'},{statusCode:200},Date.now());
 mon.recordPartner({url:'/api/partner/v1/routes',method:'GET'},{statusCode:200},Date.now());
 mon.recordPartner({url:'/api/admin',method:'GET',vanoVerifiedPartnerId:'verified'},{statusCode:200},Date.now());
 assert.equal(mon.report('24h').summary.partnerRequests,0);
 mon.stop();
});

test('aggregated rows older than selected range are excluded',()=>{
 let current=Date.UTC(2026,10,6,11,0,0);
 const db={};
 const mon=createApiObservability({db,clock:()=>current,env:{}});
 mon.record('providers','mapbox','directions',200,30);
 current+=3*86400000;
 assert.equal(mon.report('24h').summary.providerRequests,0);
 assert.equal(mon.report('7d').summary.providerRequests,1);
 mon.stop();
});
