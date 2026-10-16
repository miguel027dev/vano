import test from 'node:test';
import assert from 'node:assert/strict';
import {maviNvidiaConfig,interpretMaviWithNvidia} from './mavi-nvidia.mjs';

test('V2 defaults to GPT-OSS 120B with safe low-effort structured replies',async()=>{
 const cfg=maviNvidiaConfig({VANO_MAVI_NVIDIA_ENABLED:'1',NVIDIA_API_KEY:'fake-key-for-test-123456789'});
 assert.equal(cfg.model,'openai/gpt-oss-120b');
 assert.equal(cfg.timeoutMs,4200);
 let seen=false;
 const result=await interpretMaviWithNvidia('E se eu quiser um caminho mais tranquilo?',{
   hasRoute:true,navigationActive:true,previousIntent:'traffic_info',
   previousCategory:'grocery',destination:'private destination',userId:'private-id'
 },{config:cfg,fetcher:async(url,init)=>{
   const body=JSON.parse(init.body);
   seen=true;
   assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');
   assert.equal(body.model,'openai/gpt-oss-120b');
   assert.equal(body.reasoning_effort,'low');
   assert.equal(body.response_format.type,'json_object');
   assert.equal(body.stream,false);
   assert.ok(!JSON.stringify(body).includes('private destination'));
   assert.ok(!JSON.stringify(body).includes('private-id'));
   assert.ok(JSON.stringify(body).includes('traffic_info'));
   return {ok:true,json:async()=>({choices:[{message:{content:'{"action":"route","intent":"quiet_route"}'}}]})};
 }});
 assert.equal(seen,true);
 assert.deepEqual(result,{action:'route',intent:'quiet_route'});
});
test('NVIDIA disabled by flag never performs a remote fetch',async()=>{
 const disabled=maviNvidiaConfig({NVIDIA_API_KEY:'fake-key-for-test-123456789'});
 const result=await interpretMaviWithNvidia('Preciso de ajuda',{},{config:disabled,fetcher:()=>{throw Error('should not be called')}});
 assert.equal(result,null);
});