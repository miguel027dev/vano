import test from 'node:test';
import assert from 'node:assert/strict';
import {compactEnabled,compactWorldScale,compactScreenLength,compactModelMatrix,multiplyMatrices,syncV2Compact,V2_COMPACT_ID} from './v2CompactLayer.mjs';
import {compactVertexBytes,COMPACT_LENGTH,COMPACT_VERTEX_COUNT} from './v2CompactMesh.mjs';

test('compact is restricted to active V2 car experience',()=>{
 for(const d of [{},{v2Experience:false,vehicle:'carro'},{v2Experience:true,vehicle:'moto',navigation:true},{v2Experience:true,vehicle:'a-pe',navigation:true},{v2Experience:true,vehicle:'carro',navigation:false},{active:false,v2Experience:true,vehicle:'carro',navigation:true}])assert.equal(compactEnabled(d),false);
 assert.equal(compactEnabled({v2Experience:true,vehicle:'carro',navigation:true}),true);
 const map={};assert.equal(syncV2Compact(map,{}, {vehicle:'carro'},[-46,-23]),false);assert.equal(map._vanoCompact,undefined);
 assert.equal(syncV2Compact(map,{}, {v2Experience:true,vehicle:'carro'},[NaN,-23]),false);assert.equal(map._vanoCompact,undefined);
});
test('fixed screen budget stays compact across zoom and device widths',()=>{
 assert.equal(compactScreenLength(360),46);assert.equal(compactScreenLength(900),52);
 for(const width of [320,390,900])for(const zoom of [3,12,17,22])for(const pitch of [0,30,65,85]){
  const scale=compactWorldScale({zoom,pitch,width,length:COMPACT_LENGTH});
  const projectedGroundLength=scale*512*2**zoom*COMPACT_LENGTH;
  assert.ok(projectedGroundLength>=46&&projectedGroundLength<=75);
 }
 assert.equal(compactWorldScale({zoom:18})*2,compactWorldScale({zoom:17}));
});
test('car front points north at zero bearing and east at ninety degrees',()=>{
 const at={x:.4,y:.5,z:0},s=.001;
 const n=compactModelMatrix(at,0,s),e=compactModelMatrix(at,90,s);
 assert.ok(n[8]===0&&n[9]>0); // front -Z moves toward negative Mercator Y
 assert.ok(e[8]<0&&Math.abs(e[9])<1e-12); // front -Z moves east
 assert.equal(n[6],s);assert.equal(n[12],at.x);assert.equal(n[13],at.y);
 const I=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 const result=multiplyMatrices(I,n);for(let i=0;i<16;i++)assert.ok(Math.abs(result[i]-n[i])<1e-7);
});
test('approved compact mesh has valid packed positions, normals and topology',()=>{
 const bytes=compactVertexBytes(),v=new DataView(bytes.buffer);
 assert.equal(bytes.length,COMPACT_VERTEX_COUNT*12);assert.equal(COMPACT_VERTEX_COUNT%3,0);
 assert.equal(COMPACT_VERTEX_COUNT/3,770);
 for(let i=0;i<bytes.length;i+=12){
  for(let j=0;j<3;j++)assert.ok(Math.abs(v.getInt16(i+j*2,true)/4096)<3);
  const norm=[6,7,8].map(j=>v.getInt8(i+j)/127);assert.ok(Math.abs(Math.hypot(...norm)-1)<.012);
 }
});
test('leaving V2 removes its native layer and restores the marker path',()=>{
 let removed=0;const state={enabled:true,layer:{},point:[-46,-23]};
 const map={_vanoCompact:state,getLayer:id=>id===V2_COMPACT_ID,removeLayer:id=>{assert.equal(id,V2_COMPACT_ID);removed++;}};
 assert.equal(syncV2Compact(map,{}, {v2Experience:false,vehicle:'carro'},[-46,-23]),false);
 assert.equal(removed,1);assert.equal(state.enabled,false);assert.equal(state.layer,null);
});

test('normal /mapa opts into compact car without enabling unrelated routes or camera flags',()=>{
 assert.equal(compactEnabled({standardMapCar:true,v2Experience:false,navigation:true,vehicle:'carro'}),true);
 for(const change of [
  {standardMapCar:false},{v2Experience:false,standardMapCar:false},
  {vehicle:'moto'},{navigation:false},{active:false}
 ]){
  assert.equal(compactEnabled({standardMapCar:true,v2Experience:false,navigation:true,vehicle:'carro',...change}),false);
 }
});
