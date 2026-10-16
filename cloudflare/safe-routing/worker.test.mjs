import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {parseRequest, sha256, snapshotKey, tileKey} from './worker.mjs';

// Node 18 does not expose Web Crypto globally; Cloudflare Workers does.
globalThis.crypto ??= webcrypto;

test('rejects unbounded or out-of-pilot spatial queries', () => {
  assert.throws(() => parseRequest({bbox: [-47, -24, -46, -23.5], tiles: ['sp/z12/100/200']}));
  assert.throws(() => parseRequest({bbox: [-46.8, -23.8, -46.4, -23.4], tiles: Array.from({length: 10}, (_, i) => `sp/z12/${i}/1`)}));
});
test('accepts a small pilot request and preserves bounded tile names', () => {
  assert.deepEqual(parseRequest({bbox: [-46.7, -23.7, -46.6, -23.6], tiles: ['sp/z12/120/220', 'sp/z12/120/220']}), {bbox: [-46.7, -23.7, -46.6, -23.6], tiles: ['sp/z12/120/220'], maxDistanceMeters: 35, snapshot: 'current'});
});
test('snapshot keys are version-scoped and token hashes are stable', async () => {
  assert.equal(snapshotKey('snapshot-20261015'), 'snapshots/snapshot-20261015/manifest.json');
  assert.equal(tileKey('snapshot-20261015', 'sp/z12/120/220'), 'snapshots/snapshot-20261015/tiles/sp/z12/120/220.geojson.gz');
  assert.equal(await sha256('test-token'), '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e');
});
