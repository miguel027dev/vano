import test from 'node:test';
import assert from 'node:assert/strict';
import {reportArtworkScale} from './communityReportArtwork.js';
test('map illustrations stay bounded and readable across zoom, tilt and viewport depth',()=>{
 for(const zoom of [-10,0,12,16,22,100,NaN])for(const pitch of [-90,0,45,85,180,NaN])for(const y of [-5,0,.5,1,10,NaN]){
  const scale=reportArtworkScale(zoom,pitch,y);
  assert.ok(Number.isFinite(scale)&&scale>=.68&&scale<=1.04);
 }
 assert.ok(reportArtworkScale(17,70,.1)<reportArtworkScale(17,70,.9),'far markers are smaller than nearby markers');
 assert.equal(reportArtworkScale(17,0,.1),reportArtworkScale(17,0,.9),'flat maps have uniform scale');
});
