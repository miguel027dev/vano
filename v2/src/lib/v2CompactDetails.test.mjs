import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createVanoCompacto} from './vanoUploadedCompact.mjs';
import {COMPACT_LENGTH,COMPACT_VERTEX_COUNT,compactVertexBytes} from './v2CompactMesh.mjs';

test('uploaded source is preserved byte for byte',()=>{
 const source=readFileSync(new URL('./vanoUploadedCompact.mjs',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),'a74fb2ae204aa7787383faca90f9ae85b2589613f14b2b806893b4524af36efd');
});
test('GPU buffer preserves every uploaded position, normal, color and animated part',()=>{
 const original=createVanoCompacto(),buffer=compactVertexBytes();
 assert.strictEqual(buffer,compactVertexBytes());
 assert.equal(COMPACT_LENGTH,original.bounds.length);
 assert.equal(COMPACT_VERTEX_COUNT,original.vertices);
 assert.equal(buffer.length,original.vertices*10);
 for(let i=0;i<original.vertices;i++){
  for(let j=0;j<3;j++){
   assert.equal(buffer[i*10+j],original.positions[i*3+j]);
   assert.equal(buffer[i*10+3+j],original.normals[i*3+j]);
   assert.equal(buffer[i*10+6+j],original.colors[i*3+j]);
  }
  assert.equal(buffer[i*10+9],original.partIds[i]);
 }
 for(const id of [5,6,7,8])assert.ok(original.partIds.includes(id));
});
