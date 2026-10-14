import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radarRestrictedRegion,radarDisplayAllowed,radarFullyRestrictedBBox} from './radarPolicy.js';
import {normalizeOsmElements} from '../../server/map-public-data.mjs';

test('strict camera pins are withheld in restricted regions and remain available elsewhere',()=>{
 const blocked=[
  [[4.83,45.75],'FR'],[[2.35,48.86],'FR'],[[13.4,52.52],'DE'],
  [[6.14,46.21],'CH'],[[8.54,47.38],'CH']
 ];
 for(const [coordinates,country]of blocked){
  assert.equal(radarRestrictedRegion(coordinates),country,String(coordinates));
  assert.equal(radarDisplayAllowed(coordinates),false,String(coordinates));
 }
 for(const p of [[-46.63,-23.55],[9.19,45.46],[-.12,51.51],[28.97,41.01],[2.17,41.4]]){
  assert.equal(radarDisplayAllowed(p),true,String(p));
 }
 assert.ok(radarFullyRestrictedBBox([4.82,45.74,4.84,45.76]));
 assert.equal(radarFullyRestrictedBBox([9.18,45.45,9.20,45.47]),false);
});
test('non-camera POIs remain available in restricted countries',()=>{
 const n=(id,lon,lat,tag)=>({type:'node',id,lon,lat,tags:tag});
 const features=normalizeOsmElements([
  n(7001,4.83,45.75,{highway:'speed_camera'}),
  n(7002,4.83,45.75,{amenity:'hospital'}),
  n(7003,9.19,45.46,{highway:'speed_camera'}),
  n(7004,8.54,47.38,{highway:'speed_camera'})
 ]);
 assert.deepEqual(features.map(f=>f.id),['osm-node-7003','osm-node-7002']);
 const overlay=readFileSync(new URL('./mapPublicOverlay.js',import.meta.url),'utf8');
 assert.match(overlay,/radarDisplayAllowed\(item\.coords\)/);
});
