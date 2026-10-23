import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalIntelligence,HISTORICAL_SOURCES} from './intelligence-history.mjs';

const now=Date.parse('2026-10-23T19:00:00.000Z');
function fixtures(){
 return {
  users:[
   {id:'user-01',name:'PERSON NAME HIDDEN',email:'person@example.org',verifiedAt:'2026-06-10',verificationMethod:'email',signupMethod:'email',createdAt:'2026-06-09T10:00:00.000Z',activity:{visits:3,days:['2026-10-20','2026-10-22'],lastVisitAt:'2026-10-22T12:00:00.000Z'}},
   {id:'user-02',email:'other@secret.org',createdAt:'2026-10-21T08:00:00.000Z',signupMethod:'google',activity:{visits:1,days:['2026-10-21']}},
  ],
  history:[
   {owner:'user-01',destination:{name:'SECRET_DESTINATION',coords:[-23.5,-46.7]},createdAt:'2026-07-01T09:00:00.000Z',routeType:'fast',duration:16,distance:7},
   {owner:'user-02',destination:{name:'PRIVATE PLACE'},createdAt:'2026-10-22T10:00:00.000Z',routeType:'safe',duration:24,distance:9}
  ],
  reports:[{owner:'user-01',coords:[-23.5,-46.7],description:'SECRET_DESCRIPTION',createdAt:'2026-09-02T10:00:00.000Z',type:'traffic',status:'verificado'}],
  favorites:[{owner:'user-01',name:'PRIVATE_FAVORITE'}],
  routines:[{owner:'user-02',destination:'SECRET_ROUTINE',time:'21:30'}],
  preferences:[{owner:'user-02',home:'SECRET_HOME'}],
 };
}
test('legacy analysis covers records created before Intelligence deployment',()=>{
 const report=historicalIntelligence(fixtures(),{}, {period:'all',now});
 assert.equal(report.sources.historical_inventory.existingCollections.accounts,2);
 assert.equal(report.sources.historical_inventory.existingCollections.savedRoutes,2);
 assert.equal(report.sources.historical_inventory.existingCollections.reports,1);
 assert.equal(report.sources.historical_users.signupsInPeriod,2);
 assert.equal(report.sources.historical_routes.savedInPeriod,2);
 assert.equal(report.sources.historical_product.routineRecordsCurrentlySaved,1);
 assert.equal(report.sources.historical_reports.verifiedInPeriod,1);
 assert.equal(report.sources.historical_inventory.firstKnownRecordDate,'2026-06-09');
 assert.equal(Object.keys(HISTORICAL_SOURCES).length,7);
});
test('legacy data never leaks identity, GPS, addresses, free text, or credentials',()=>{
 const data=fixtures();data.users[0].passwordHash='SECRET_PASSWORD_HASH';
 const response=JSON.stringify(historicalIntelligence(data,{}, {now}));
 for(const part of ['PERSON NAME HIDDEN','person@example.org','SECRET_DESTINATION','PRIVATE PLACE',
  'SECRET_DESCRIPTION','PRIVATE_FAVORITE','SECRET_ROUTINE','SECRET_HOME','SECRET_PASSWORD_HASH',
  'user-01','-23.5','-46.7','coords','destination','passwordHash'])
  assert.equal(response.includes(part),false,part);
});
test('historical date filters do not hide all-time inventory or current stock',()=>{
 const all=historicalIntelligence(fixtures(),{}, {period:'all',now});
 const month=historicalIntelligence(fixtures(),{}, {period:30,now});
 assert.equal(month.sources.historical_routes.savedInPeriod,1);
 assert.equal(month.sources.historical_routes.savedAllTime,2);
 assert.equal(month.sources.historical_inventory.existingCollections.accounts,2);
 assert.equal(month.sources.historical_product.favoriteRecordsCurrentlySaved,1);
 assert.equal(all.period,'all');
});
