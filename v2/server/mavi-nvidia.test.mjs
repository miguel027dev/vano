import test from 'node:test';
import assert from 'node:assert/strict';
import {maviNvidiaConfig,parseMaviNvidiaDecision,interpretMaviWithNvidia,maviNvidiaQuota} from './mavi-nvidia.mjs';

const configured={
 VANO_MAVI_NVIDIA_ENABLED:'1',
 NVIDIA_API_KEY:'fake-for-tests-only-123456789',
 NVIDIA_MAVI_MODEL:'nvidia/nemotron-3.5-lightning-30b-a3b'
};
test('NVIDIA is OFF by default and never needs an API key in the browser',()=>{
 assert.equal(maviNvidiaConfig({}).enabled,false);
 assert.equal(maviNvidiaConfig({...configured,VANO_MAVI_NVIDIA_ENABLED:'0'}).enabled,false);
 assert.equal(maviNvidiaConfig({...configured,NVIDIA_API_KEY:''}).enabled,false);
 assert.equal(maviNvidiaConfig(configured).enabled,true);
 assert.equal(maviNvidiaConfig(configured).model,'nvidia/nemotron-3.5-lightning-30b-a3b');
});
test('only explicit route, street, POI and information intentions pass schema checks',()=>{
 assert.deepEqual(parseMaviNvidiaDecision(JSON.stringify({action:'route',intent:'fast_route'})),
  {action:'route',intent:'fast_route'});
 assert.deepEqual(parseMaviNvidiaDecision(JSON.stringify({action:'street',street_kind:'avoid',road:'Avenida Giovanni Gronchi'})),
  {action:'street',street_kind:'avoid',road:'Avenida Giovanni Gronchi'});
 assert.deepEqual(parseMaviNvidiaDecision(JSON.stringify({action:'poi',category:'grocery',scope:'route'})),
  {action:'poi',category:'grocery',scope:'route'});
 assert.deepEqual(parseMaviNvidiaDecision(JSON.stringify({action:'information',intent:'arrival',reply:'Vai chegar em 5 minutos'})),
  {action:'information',intent:'arrival',reply:''});
 assert.deepEqual(parseMaviNvidiaDecision({action:'information',intent:'help',reply:'Posso buscar lugares reais e rotas.'}),
  {action:'information',intent:'help',reply:'Posso buscar lugares reais e rotas.'});
 assert.deepEqual(parseMaviNvidiaDecision({action:'resume'}),{action:'resume'});
 assert.deepEqual(parseMaviNvidiaDecision({action:'general',reply:'Oi, posso ajudar na sua viagem!'}),
  {action:'general',reply:'Oi, posso ajudar na sua viagem!'});
});
test('hostile, malformed and unsupported tool requests fail closed',()=>{
 const bad=[
  {action:'route',intent:'delete_account'}, {action:'route',intent:'call_phone'},
  {action:'poi',category:'unknown',scope:'route'},{action:'poi',category:'grocery',scope:'outside'},
  {action:'street',street_kind:'avoid',road:'javascript:alert(1)'},
  {action:'street',street_kind:'avoid',road:'   '},
  {action:'street',street_kind:'delete',road:'Avenida Morumbi'},
  {action:'information',intent:'invent_accident',reply:'Sim, tem acidente'},
  {action:'general',reply:' '}, {action:'shell',cmd:'rm -rf'},
  [], 'not json', '{foo}', 42
 ];
 for(const input of bad)assert.equal(parseMaviNvidiaDecision(typeof input==='string'?input:JSON.stringify(input)),null,JSON.stringify(input));
 assert.deepEqual(parseMaviNvidiaDecision({action:'unknown'}),{action:'unknown'});
});
test('one remote interpretation sends only short speech plus minimal booleans to NVIDIA',async()=>{
 let called=0;
 const choice=await interpretMaviWithNvidia(
  'Mavi, será que tem algum mercado pelo caminho, por gentileza?',
  {hasRoute:true,navigationActive:true,pendingStop:false,origin:[-46.7,-23.6],destination:'Casa do usuário',userId:'SECRET'},
  {config:maviNvidiaConfig(configured),now:()=>Date.now()+7200000,
   fetcher:async(url,init)=>{
    called++;
    assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(init.headers.Authorization,'Bearer '+configured.NVIDIA_API_KEY);
    assert.equal(init.method,'POST');
    const request=JSON.parse(init.body);
    assert.equal(request.stream,false);
    assert.equal(request.chat_template_kwargs.enable_thinking,false);
    assert.equal(request.messages.length,2);
    assert.equal(request.messages[1].role,'user');
    assert.ok(request.messages[1].content.includes('mercado'));
    assert.ok(!request.messages[1].content.includes('SECRET'));
    assert.ok(!request.messages[1].content.includes('-46.7'));
    assert.ok(!request.messages[1].content.includes('Casa do usuário'));
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
     action:'poi',category:'grocery',scope:'route'})}}]})};
   }});
 assert.deepEqual(choice,{action:'poi',category:'grocery',scope:'route'});
 assert.equal(called,1);
});
test('voice context is bounded and grounded without GPS or private destination data',async()=>{
 const model=maviNvidiaConfig(configured);
 let inspected=false;
 const result=await interpretMaviWithNvidia('Mavi, falta muito para a próxima manobra?',{
   hasRoute:true,navigationActive:true,gpsReady:true,vehicle:'carro',
   remainingMinutes:14.37,remainingKm:6.438,currentDuration:27.2,
   nextDistanceMeters:95.7,nextInstruction:'Vire à direita na Avenida Paulista',
   destination:'Casa do usuário',origin:[-46.7,-23.6],userId:'PRIVATE_USER_ID',
   apiKey:'SECRET_CREDENTIAL',speedKmh:57
 },{
   config:model,now:()=>Date.now()+7200000,
   fetcher:async(url,init)=>{
     assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');
     const request=JSON.parse(init.body);
     assert.equal(request.temperature,0.15); // Preserve the existing non-GPT-OSS temperature.
     assert.equal(request.max_tokens,420);
     assert.match(request.messages[0].content,/resposta no campo reply será ouvida por áudio/);
     const payload=JSON.parse(request.messages[1].content);
     assert.equal(payload.context.hasRoute,true);
     assert.equal(payload.context.navigationActive,true);
     assert.equal(payload.context.gpsReady,true);
     assert.equal(payload.context.vehicle,'carro');
     assert.equal(payload.context.remainingMinutes,14.4);
     assert.equal(payload.context.remainingKm,6.44);
     assert.equal(payload.context.nextDistanceMeters,96);
     assert.equal(payload.context.nextInstruction,'Vire à direita na Avenida Paulista');
     assert.ok(!Object.hasOwn(payload.context,'destination'));
     assert.ok(!Object.hasOwn(payload.context,'origin'));
     assert.ok(!Object.hasOwn(payload.context,'speedKmh'));
     for(const secret of ['PRIVATE_USER_ID','SECRET_CREDENTIAL','Casa do usuário','-46.7'])
       assert.ok(!init.body.includes(secret),secret);
     inspected=true;
     return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
       action:'information',intent:'next_maneuver',reply:'Inventei uma curva.'})}}]})};
   }
 });
 assert.equal(inspected,true);
 assert.deepEqual(result,{action:'information',intent:'next_maneuver',reply:''});
});
test('upstream HTTP/parse errors and missing flag always fall back locally',async()=>{
 const cfg=maviNvidiaConfig(configured);
 assert.equal(await interpretMaviWithNvidia('Mavi, me ajuda',{},{config:maviNvidiaConfig({}),
  fetcher:()=>{throw Error('should not fetch');}}),null);
 for(const fetcher of [
  async()=>({ok:false,status:429}),
  async()=>({ok:true,json:async()=>({choices:[{message:{content:'unparseable'}}]})}),
  async()=>{throw Error('NVIDIA network offline');}
 ]){
  assert.equal(await interpretMaviWithNvidia('Mavi, me ajuda',{},{config:cfg,fetcher}),null);
 }
});
test('hourly request ceiling rejects future calls without provider requests',()=>{
 assert.equal(maviNvidiaQuota(100*3600000,1),true);
 assert.equal(maviNvidiaQuota(100*3600000,1),false);
 assert.equal(maviNvidiaQuota(101*3600000,1),true);
});
