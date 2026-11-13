import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactDetailVertexBytes,COMPACT_DETAIL_VERTEX_COUNT,COMPACT_DETAIL_TRIANGLES} from './v2CompactDetails.mjs';
import {compactVertexBytes,COMPACT_VERTEX_COUNT,COMPACT_LENGTH} from './v2CompactMesh.mjs';

test('native car details are true world-space 3D triangles fused into original GLB mesh',()=>{
 const source=readFileSync(new URL('./v2CompactDetails.mjs',import.meta.url),'utf8');
 const packed=readFileSync(new URL('./v2CompactMesh.mjs',import.meta.url),'utf8');
 const layer=readFileSync(new URL('./v2CompactLayer.mjs',import.meta.url),'utf8');
 for(const fragment of ['Windshield','Rear hatch glass','Side window','makeWheel','headlights','door handles','wiper'])assert.ok(source.toLowerCase().includes(fragment.toLowerCase()),fragment);
 assert.equal(COMPACT_DETAIL_VERTEX_COUNT%3,0);
 assert.equal(COMPACT_DETAIL_TRIANGLES*3,COMPACT_DETAIL_VERTEX_COUNT);
 assert.equal(COMPACT_VERTEX_COUNT,2310+COMPACT_DETAIL_VERTEX_COUNT);
 assert.ok(COMPACT_DETAIL_VERTEX_COUNT>600);
 assert.ok(COMPACT_DETAIL_VERTEX_COUNT<9000);
 assert.equal(COMPACT_LENGTH,3.662,'no model size or car-camera scaling changes');
 assert.match(packed,/packedDetailMesh\.set\(original\)/);
 assert.match(packed,/packedDetailMesh\.set\(details,original\.length\)/);
 assert.match(layer,/gl\.drawArrays\(gl\.TRIANGLES,0,mesh\.COMPACT_VERTEX_COUNT\)/);
 assert.match(layer,/compactWorldScale\(\{zoom:map\.getZoom\(\),pitch:map\.getPitch\(\),width:map\.getCanvas\(\)\.clientWidth,length:mesh\.COMPACT_LENGTH\}\)/);
});
test('detailed mesh has valid packed normals, nondegenerate triangles and mobile-safe palette',()=>{
 const detail=compactDetailVertexBytes(),view=new DataView(detail.buffer);
 assert.equal(detail.length,COMPACT_DETAIL_VERTEX_COUNT*12);
 const colors=new Set();
 const vertices=[];
 for(let i=0;i<detail.length;i+=12){
   const p=[0,2,4].map(j=>view.getInt16(i+j,true)/4096);
   const n=[6,7,8].map(j=>view.getInt8(i+j)/127);
   const c=[9,10,11].map(j=>detail[i+j]);
   assert.ok(p.every(Number.isFinite));
   assert.ok(p[0]>=-1.25&&p[0]<=1.25);
   assert.ok(p[1]>=0&&p[1]<=1.98);
   assert.ok(p[2]>=-1.94&&p[2]<=1.94);
   assert.ok(Math.abs(Math.hypot(...n)-1)<.012);
   vertices.push(p);colors.add(c.join(','));
 }
 for(let i=0;i<vertices.length;i+=3){
   const [a,b,c]=vertices.slice(i,i+3);
   const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
   assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>0.0000001);
 }
 assert.ok(colors.size>=8,'glass, alloys, lamps and trim are distinguishable');
 const full=compactVertexBytes();
 assert.equal(full.length,COMPACT_VERTEX_COUNT*12);
 assert.deepEqual(full.slice(2310*12),detail);
 assert.strictEqual(compactVertexBytes(),full,'do not allocate mesh for every animation frame');
});
test('no camera, bearing, GPS, and route files are touched by this mesh-only enhancement',()=>{
 const detail=readFileSync(new URL('./v2CompactDetails.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(detail,/cameraTarget|motionCoords|gpsCoords|setLngLat|setRotation|flyTo|panTo|jumpTo|easeTo|requestAnimationFrame/);
});
