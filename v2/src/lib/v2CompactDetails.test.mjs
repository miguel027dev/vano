import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPACT_LENGTH,COMPACT_VERTEX_COUNT,compactVertexBytes} from './v2CompactMesh.mjs';
import {REFERENCE_COMPACT_VERTEX_COUNT,REFERENCE_COMPACT_TRIANGLES,
 REFERENCE_COMPACT_PALETTE,referenceCompactVertexBytes} from './v2CompactReference.mjs';

test('reference model really replaces the previous GLB, keeping a single WebGL mesh',()=>{
 const mesh=readFileSync(new URL('./v2CompactMesh.mjs',import.meta.url),'utf8');
 const layer=readFileSync(new URL('./v2CompactLayer.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(mesh,/VANO_Compacto\.glb|COMPACT_BASE64|packedDetailMesh/);
 assert.match(mesh,/referenceCompactVertexBytes/);
 assert.equal(COMPACT_LENGTH,3.662,'car length and map scale remain the same');
 assert.equal(COMPACT_VERTEX_COUNT,REFERENCE_COMPACT_VERTEX_COUNT);
 assert.equal(COMPACT_VERTEX_COUNT,REFERENCE_COMPACT_TRIANGLES*3);
 assert.ok(REFERENCE_COMPACT_TRIANGLES>350&&REFERENCE_COMPACT_TRIANGLES<1300);
 assert.match(layer,/gl\.drawArrays\(gl\.TRIANGLES,0,mesh\.COMPACT_VERTEX_COUNT\)/);
 assert.match(layer,/compactWorldScale\(\{zoom:map\.getZoom\(\),pitch:map\.getPitch\(\),width:map\.getCanvas\(\)\.clientWidth,length:mesh\.COMPACT_LENGTH\}\)/);
});
test('approved orange palette and recognizable geometric proportions are preserved',()=>{
 const c=REFERENCE_COMPACT_PALETTE;
 assert.deepEqual(c.orange,[255,122,26]);
 assert.deepEqual(c.glass,[31,45,67]);
 assert.ok(c.tail[0]>150&&c.tail[1]<70);
 assert.ok(c.tire[0]<70&&c.tire[1]<70);
 const src=readFileSync(new URL('./v2CompactReference.mjs',import.meta.url),'utf8');
 for(const cue of ['roof glass','windshield','rear glass','tail lights','rear bumper','mirror housings','disc-shaped wheels','trapezoid']){
  assert.ok(src.toLowerCase().includes(cue.toLowerCase()),cue);
 }
});
test('true 3D triangles contain finite geometry, normalized normals and full visible roof/tires',()=>{
 const bytes=compactVertexBytes(),view=new DataView(bytes.buffer);
 assert.strictEqual(bytes,referenceCompactVertexBytes(),'single cached geometry, no per-frame allocation');
 assert.equal(bytes.length,COMPACT_VERTEX_COUNT*12);
 const distinctColors=new Set(),xs=[],ys=[],zs=[];
 const verts=[];
 for(let i=0;i<bytes.length;i+=12){
  const p=[0,2,4].map(j=>view.getInt16(i+j,true)/4096);
  const n=[6,7,8].map(j=>view.getInt8(i+j)/127);
  const color=[9,10,11].map(j=>bytes[i+j]);
  assert.ok(p.every(Number.isFinite));
  assert.ok(Math.abs(p[0])<=1.25&&p[1]>=0&&p[1]<=1.98&&Math.abs(p[2])<=1.94);
  assert.ok(Math.abs(Math.hypot(...n)-1)<.013,'stable normals on mobile GPU');
  xs.push(p[0]);ys.push(p[1]);zs.push(p[2]);
  distinctColors.add(color.join(','));verts.push(p);
 }
 assert.ok(Math.min(...xs)<-1.15&&Math.max(...xs)>1.15,'rectangular mirrors protrude');
 assert.ok(Math.max(...ys)>1.70,'high glass roof');
 assert.ok(Math.min(...zs)<-1.8&&Math.max(...zs)>1.8,'original wheelbase and bumper');
 assert.ok(distinctColors.size>=12);
 for(let i=0;i<verts.length;i+=3){
  const [a,b,c]=verts.slice(i,i+3);
  const u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
  assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>0.0000001);
 }
});
test('reference mesh is visual-only and cannot change GPS, camera or movement',()=>{
 const src=readFileSync(new URL('./v2CompactReference.mjs',import.meta.url),'utf8');
 for(const keyword of ['cameraTarget','motionCoords','gpsCoords','setLngLat','setRotation','flyTo','panTo','jumpTo','easeTo','requestAnimationFrame']){
  assert.ok(!src.includes(keyword),keyword);
 }
});
