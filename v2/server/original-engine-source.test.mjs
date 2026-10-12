/** Regression: the embedded Python engine must match audited original V1 blobs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Git blob SHA1, not a bare file SHA1; verified independently against main and V2.
const expected={
 'app.py':'aebccf0c0e428b5ccb6e57d9bba7929f10d9f229',
 'vano/services/routing.py':'ea9b0befd7f578fd4a9c91efff5c513a4afd224e',
 'vano/services/safety.py':'05d3eef8797dbc187e1aae7de3c6410a6a24e4ce',
 'vano/services/nodes.py':'7bf03514d2b3102b37028da894ba15fa22754ba4',
 'vano/services/route_cache.py':'a6113f578da45984cc0dc2c8632c5cbda5f4045c',
 'vano/services/context.py':'b6029c9c13768fe062712ebe95fe22c64675e6aa',
 'vano/services/search.py':'7dca938383e4cd624800946408557acc71cf0a68',
 'vano/routes/routing.py':'3ccf1e5e87a8fd33900b93426627edef22c0ea01',
 'vano_ai_routing.py':'e9616ced8eb96ae200e70b580d85a143d6cb0c86',
 'vano_radars.py':'11eae29ad94a0d5cb94e9e28d2535f2aeee4df46',
 'db_backend.py':'1adc9049befe648071c03c91589f447e8d792954',
 'vano/config.py':'e65a3f2948959989bd19bf5b4f5189ae9623eac7',
 'mobile_routes.py':'903db9421d0aacfc12e5cf851cc1f0ae3d5d4885',
 'requirements.lock':'477e4d05e48246f66bbe55a27c7cf37a87873886'
};
const embedded=fs.existsSync(path.join(root,'app.py'));
test('embedded VANO original Python engine has exact audited Git blobs', {skip:!embedded},()=>{
 for(const [name,sha] of Object.entries(expected)){
  const bytes=fs.readFileSync(path.join(root,name));
  const gitHash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitHash,sha,`Engine source changed unexpectedly: ${name}`);
 }
});
