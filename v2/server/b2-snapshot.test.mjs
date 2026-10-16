import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateSnapshotManifest,decodeSnapshotObject} from './safe-routing/b2-snapshot.mjs';
const snapshot='geosampa-test-20261016';
const compressed=gzipSync(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature'}]}));
const item={path:`snapshots/${snapshot}/pages/000000.geojson.gz`,bytes:compressed.length,features:1,sha256:createHash('sha256').update(compressed).digest('hex')};
const manifest={version:1,snapshotId:snapshot,stage:'private-evaluation-unapproved',usedForRouting:false,complete:true,accepted:1,objects:[item]};
test('B2 manifest rejects cross-snapshot paths, duplicate paths and incorrect totals',()=>{
 assert.equal(validateSnapshotManifest(manifest,snapshot).features,1);
 assert.throws(()=>validateSnapshotManifest({...manifest,accepted:2},snapshot));
 assert.throws(()=>validateSnapshotManifest({...manifest,objects:[item,item]},snapshot));
 assert.throws(()=>validateSnapshotManifest({...manifest,objects:[{...item,path:'snapshots/another/pages/000000.geojson.gz'}]},snapshot));
});
test('B2 download verifies compressed bytes before decompressing and reconciles feature count',()=>{
 assert.equal(decodeSnapshotObject(compressed,item).features.length,1);
 assert.throws(()=>decodeSnapshotObject(Buffer.from('corrupted'),item),/Integridade/);
 assert.throws(()=>decodeSnapshotObject(compressed,{...item,features:2}),/GeoJSON/);
});
