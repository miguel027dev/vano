/**
 * TEMP ONLY — live Render/NVIDIA smoke test.
 * Does not access secrets, private GPS, identifiers or personal data.
 * This is intentionally not for merging into production tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
const host='https://vanu-73xu.onrender.com';
test('real NVIDIA NIM replies via deployed MAVI guest/CSRF assistant',async()=>{
 const ctrl=new AbortController();
 const timeout=setTimeout(()=>ctrl.abort(),35000);
 try{
  const boot=await fetch(host+'/api/bootstrap',{signal:ctrl.signal});
  assert.equal(boot.status,200,'bootstrap');
  const cookie=(boot.headers.get('set-cookie')||'').split(';')[0];
  const state=await boot.json();
  assert.ok(state.csrfToken&&cookie.startsWith('vano_guest='),'session + CSRF');
  const headers={'Content-Type':'application/json','Cookie':cookie,'X-VANO-CSRF':state.csrfToken};
  const ask=async text=>{
    const start=Date.now();
    const res=await fetch(host+'/api/v2/assistant',{method:'POST',headers,
      body:JSON.stringify({text,context:{hasRoute:false,navigationActive:false,pendingStop:false}}),
      signal:ctrl.signal});
    assert.equal(res.status,200,text);
    const data=await res.json();
    assert.equal(typeof data.text,'string');
    assert.ok(data.text.length>3&&data.text.length<=500);
    return {data,latency:Date.now()-start};
  };
  const trials=[
   'Mavi, me conta uma piada curtinha sobre satélites, por favor.',
   'Mavi, como você está? Só queria conversar um pouquinho.',
   'Ei Mavi, você consegue explicar o que você pode fazer por mim no VANO?'
  ];
  const results=[];
  for(const prompt of trials){
   const {data,latency}=await ask(prompt);
   console.info('MAVI NVIDIA live sample',JSON.stringify({
    intent:data.intent,mode:data.mode,latencyMs:latency,
    replySample:data.text.slice(0,150)
   }));
   results.push(data);
  }
  assert.ok(results.every(x=>x.mode==='information'),'no auto-changing routes');
  // The unchanged deterministic fallback for generic smalltalk has
  // intent unknown. At least one generic utterance must reach NVIDIA.
  assert.ok(results.slice(0,2).some(x=>x.intent==='general'),
   'NVIDIA did not supply any conversational response: check credentials, model and inference timeout.');
 }finally{clearTimeout(timeout);}
},{timeout:37000});
