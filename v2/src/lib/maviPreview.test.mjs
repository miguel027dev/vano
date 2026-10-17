import test from 'node:test';
import assert from 'node:assert/strict';
import {jevRouteFingerprint} from './jevShared.mjs';
import {selectMaviPreview,canFocusMaviPreview} from './maviPreview.mjs';

const current={id:'safe',duration:14,distance:4,geometry:{type:'LineString',coordinates:[[-46.70,-23.61],[-46.69,-23.62]]},proof:'signed-old'};
const alternative={id:'fast',duration:12,distance:3.8,geometry:{type:'LineString',coordinates:[[-46.70,-23.61],[-46.695,-23.615],[-46.69,-23.62]]},proof:'signed-new'};
const destination={coords:[-46.69,-23.62]};
const proposal={mode:'proposal',intent:'alternative',sourceKey:jevRouteFingerprint(current),
 routeId:'fast',destination:destination.coords,routeData:{routes:[alternative]}};
test('MAVI preview is distinct from committed navigation and requires a proof',()=>{
 const view=selectMaviPreview(proposal,current,destination);
 assert.equal(view.route,alternative);
 assert.equal(jevRouteFingerprint(current),proposal.sourceKey);
 assert.equal(selectMaviPreview({...proposal,sourceKey:'stale'},current,destination),null);
 assert.equal(selectMaviPreview({...proposal,destination:[-46.5,-23.6]},current,destination),null);
 assert.equal(selectMaviPreview({...proposal,routeData:{routes:[{...alternative,proof:null}]}},current,destination),null);
 assert.equal(selectMaviPreview({...proposal,routeData:{routes:[current]}},current,destination),null);
});
test('POI previews validate original destination and candidate endpoint',()=>{
 const stop={...proposal,kind:'poi_stop',originalDestination:destination.coords,
 poi:{coords:destination.coords}};
 assert.ok(selectMaviPreview(stop,current,destination));
 assert.equal(selectMaviPreview({...stop,originalDestination:[-45,-23]},current,destination),null);
});
test('MAVI route preview never moves camera during navigation, including at 0 km/h',()=>{
 assert.equal(canFocusMaviPreview({navigation:false}),true);
 for(const speedKmh of [null,0,.1,1,2,6,80]){
  assert.equal(canFocusMaviPreview({navigation:true,hasLiveGPS:true,speedKmh}),false);
  assert.equal(canFocusMaviPreview({navigation:true,hasLiveGPS:false,speedKmh}),false);
 }
});
