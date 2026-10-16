import test from 'node:test';
import assert from 'node:assert/strict';
import {assertB2Config,b2FileName,authorizeB2,uploadB2Object} from './b2-storage.mjs';

const config={keyId:'005ea9e34e3d2600000000001',applicationKey:'not-a-real-secret-value',bucketId:'cebae96eb3744e23ad120610',bucketName:'vano-safe-routing-sp-staging-20261016',endpoint:'s3.us-east-005.backblazeb2.com'};
test('B2 config is staging-scoped and object paths cannot escape snapshots',()=>{
 assert.equal(assertB2Config(config),true);
 assert.equal(b2FileName('snapshots/snap-20261016/pages/000001.geojson.gz'),'snapshots/snap-20261016/pages/000001.geojson.gz');
 assert.throws(()=>b2FileName('../credentials'));
 assert.throws(()=>assertB2Config({...config,bucketName:'some-other-bucket'}));
});
test('B2 authorizes only the expected dedicated bucket and verifies uploaded SHA-1',async()=>{
 const calls=[];
 const fetcher=async(url,options={})=>{calls.push({url,options});
  if(url.includes('b2_authorize_account'))return new Response(JSON.stringify({authorizationToken:'auth',apiInfo:{storageApi:{apiUrl:'https://api005.backblazeb2.com',downloadUrl:'https://f005.backblazeb2.com',allowed:{buckets:[{id:config.bucketId,name:config.bucketName}],namePrefix:'snapshots/',capabilities:['readFiles','writeFiles']}}}}));
  if(url.includes('b2_get_upload_url'))return new Response(JSON.stringify({uploadUrl:'https://pod-005-1.backblaze.com/upload',authorizationToken:'upload-token'}));
  return new Response(JSON.stringify({fileId:'file-1',fileName:'snapshots/snap-20261016/manifest.json',contentSha1:'f572d396fae9206628714fb2ce00f72e94f2258f'}));
 };
 const auth=await authorizeB2(config,{fetcher});
 const saved=await uploadB2Object({authorization:auth,config,path:'snapshots/snap-20261016/manifest.json',body:Buffer.from('hello\n'),contentType:'application/json',fetcher});
 assert.equal(saved.fileId,'file-1');assert.equal(saved.bytes,6);assert.equal(calls.length,3);
});
