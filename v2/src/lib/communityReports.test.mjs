import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_TYPES,reportExpiration,publicReportsInBBox,recordReportFeedback,metersApart,closeReports,reportQueryBBox,reportIconSvg} from './communityReports.js';
const time=Date.parse('2026-10-17T16:00:00Z');
const point=[-46.68,-23.58];
const record=(type='acidente',overrides={})=>({id:'a1',type,description:'Teste <b>rápido</b>',
  coords:point,createdAt:new Date(time-1000).toISOString(),status:'nao_verificado',owner:'private-user',...overrides});
test('exact six reporting categories arranged as two rows of three',()=>{
 assert.deepEqual(REPORT_TYPES.map(r=>r.id),['via_fechada','transito','fiscalizacao','acidente','alagamento','obstaculo']);
 assert.equal(new Set(REPORT_TYPES.map(r=>r.id)).size,6);
 for(const item of REPORT_TYPES) assert.match(reportIconSvg(item.id),/<svg/);
});
test('public API strips owner and rounds location; unverified reports are visible',()=>{
 const result=publicReportsInBBox([record()],[-46.7,-23.6,-46.6,-23.5],time);
 assert.equal(result.length,1);assert.equal(Object.hasOwn(result[0],'owner'),false);
 assert.equal(result[0].status,'nao_verificado');assert.equal(result[0].coords[0],-46.68);
});
test('nonexistent or expired occurrences never surface',()=>{
 const old=record('transito',{createdAt:new Date(time-121*60000).toISOString()});
 const out=publicReportsInBBox([old,record('acidente',{status:'removido'}),record('acidente',{coords:[10,10]})],[-46.7,-23.6,-46.6,-23.5],time);
 assert.equal(out.length,0);assert.ok(reportExpiration(old)<time);
});
test('GPS enter and exit use hysteresis without changing coordinates',()=>{
 const a=record();
 assert.equal(closeReports([a],point,new Set(),time).length,1);
 const about700m=[point[0]+.007,point[1]];
 assert.equal(closeReports([a],about700m,new Set(),time).length,0);
 assert.equal(closeReports([a],about700m,new Set(['a1']),time).length,1);
 assert.equal(closeReports([a],[point[0]+.02,point[1]],new Set(['a1']),time).length,0);
 assert.ok(metersApart(point,about700m)>600);
});
test('bbox is bounded and refuses polar / invalid coordinates',()=>{
 assert.equal(reportQueryBBox([200,0]),null);
 assert.equal(reportQueryBBox([0,82]),null);
 assert.equal(reportQueryBBox(point).split(',').length,4);
});

test('three distinct lightweight map glyphs are legible; blitz is unchanged',()=>{
 const traffic=reportIconSvg('transito');
 const obstacle=reportIconSvg('obstaculo');
 const accident=reportIconSvg('acidente');
 const blitz=reportIconSvg('fiscalizacao');
 for(const svg of [traffic,obstacle,accident,blitz]){
   assert.match(svg,/viewBox="0 0 24 24"/);
   assert.match(svg,/width="22" height="22"/);
   assert.ok(svg.length<480,'icons must remain light on mobile maps');
 }
 assert.match(traffic,/M7\.5 7 9 4/,'first car');
 assert.match(traffic,/M5\.5 16h13v5/,'second car');
 assert.match(obstacle,/m10 4h4l4 15H6z/,'simple cone');
 assert.match(obstacle,/M4 21h16/,'cone base');
 assert.match(accident,/m4 13 1\.5-4h8L15 13/,'car silhouette');
 assert.match(accident,/m18\.5 3/,'collision flash');
 assert.match(blitz,/M12 3 4\.5 6v6c0 5/,'blitz symbol must not change');
 assert.equal(new Set([traffic,obstacle,accident,blitz]).size,4);
});

test('nearby report response reveals current-viewer flags, never owner IDs or vote keys',()=>{
 const r=record('fiscalizacao',{feedback:{'hashed-other':'gone'}});
 const bounds=[-46.7,-23.6,-46.6,-23.5];
 const own=publicReportsInBBox([r],bounds,time,'private-user','hashed-self')[0];
 assert.equal(own.isOwn,true);
 assert.equal(own.viewerVote,null);
 const stranger=publicReportsInBBox([r],bounds,time,'stranger','hashed-other')[0];
 assert.equal(stranger.isOwn,false);
 assert.equal(stranger.viewerVote,'gone');
 const anonymous=publicReportsInBBox([r],bounds,time)[0];
 assert.equal(anonymous.isOwn,false);
 assert.equal(anonymous.viewerVote,null);
 for(const response of [own,stranger,anonymous]){
   assert.equal(Object.hasOwn(response,'owner'),false);
   assert.equal(Object.hasOwn(response,'feedback'),false);
   assert.ok(!JSON.stringify(response).includes('hashed-other'));
   assert.ok(!JSON.stringify(response).includes('private-user'));
 }
});
test('creator cannot vote; only one recorded choice per guest or signed-in identity',()=>{
 const r=record('fiscalizacao');
 assert.equal(recordReportFeedback(r,'private-user','author-hash','gone',time).status,'own');
 assert.equal(r.feedback,undefined);
 assert.equal(recordReportFeedback(r,'other-user','viewer-hash','present',time).status,'recorded');
 assert.equal(r.feedback['viewer-hash'],'present');
 assert.deepEqual(recordReportFeedback(r,'other-user','viewer-hash','gone',time),
   {status:'duplicate',choice:'present'});
 assert.equal(r.feedback['viewer-hash'],'present');
 assert.equal(recordReportFeedback(r,'another-user','next-hash','gone',time).status,'recorded');
});
test('expired, invalid and removed reports cannot accept community confirmations',()=>{
 const old=record('transito',{createdAt:new Date(time-121*60000).toISOString()});
 assert.equal(recordReportFeedback(old,'other','k','present',time).status,'expired');
 assert.equal(recordReportFeedback(record('fiscalizacao',{status:'removido'}),'other','k','present',time).status,'expired');
 assert.equal(recordReportFeedback(record(),'other','k','anything',time).status,'invalid');
 assert.equal(recordReportFeedback(record(),null,'k','present',time).status,'invalid');
 const capped=record('fiscalizacao',{feedback:Object.fromEntries(Array.from({length:256},(_,i)=>['v'+i,'present']))});
 assert.equal(recordReportFeedback(capped,'other','new','gone',time).status,'limit');
});
