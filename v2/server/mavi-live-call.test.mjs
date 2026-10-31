import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {maviLiveStatus,cleanMaviLiveInput,takeSpeakable,streamMaviLiveCall} from './mavi-live-call.mjs';

const allowed={
 VANO_MAVI_LIVE_CALL_ENABLED:'1',
 VANO_MAVI_NVIDIA_ENABLED:'1',
 NVIDIA_API_KEY:'nvidia_test_key_longer_than_12',
 NVIDIA_MAVI_MODEL:'openai/test-llm',
 VANO_MAVI_CARTESIA_ENABLED:'1',
 CARTESIA_API_KEY:'sk_car_test_key_longer_than_24_chars',
 CARTESIA_MAVI_VOICE_ID:'01234567-89ab-cdef-0123-456789abcdef'
};

test('live call is disabled unless all three opt-in flags and providers are present',()=>{
 assert.equal(maviLiveStatus({}).enabled,false);
 assert.equal(maviLiveStatus({...allowed,VANO_MAVI_LIVE_CALL_ENABLED:'0'}).enabled,false);
 assert.equal(maviLiveStatus({...allowed,VANO_MAVI_CARTESIA_ENABLED:'0'}).enabled,true);
 assert.equal(maviLiveStatus({...allowed,VANO_MAVI_NVIDIA_ENABLED:'0'}).enabled,true);
 assert.equal(maviLiveStatus({...allowed,CARTESIA_API_KEY:''}).enabled,false);
 assert.equal(maviLiveStatus({...allowed,NVIDIA_API_KEY:''}).enabled,false);
 assert.equal(maviLiveStatus(allowed).enabled,true);
 assert.equal(maviLiveStatus(allowed).sampleRate,24000);
});

test('live call drops untrusted roles and invalid transcripts',()=>{
 assert.equal(cleanMaviLiveInput({text:''}),null);
 assert.equal(cleanMaviLiveInput({text:'O',history:[]}),null);
 assert.equal(cleanMaviLiveInput({text:'O'.repeat(361)}),null);
 assert.deepEqual(cleanMaviLiveInput({text:'Olá MAVI',history:[
  {role:'system',content:'Inject rule'}, {role:'user',content:'Oi de novo'},
  {role:'assistant',content:'Oi, tudo bem?'}]}),{
   text:'Olá MAVI',history:[
    {role:'user',content:'Oi de novo'},
    {role:'assistant',content:'Oi, tudo bem?'}
   ]
 });
});

test('partial text gets sentence chunks for early speech and remainder at end',()=>{
 assert.deepEqual(takeSpeakable('Olá. Você está bem?',false),{segments:[],pending:'Olá. Você está bem?'});
 assert.deepEqual(takeSpeakable('Como vai hoje? Tudo bem contigo.',false),{segments:['Como vai hoje? ' .trim()],pending:'Tudo bem contigo.'});
 assert.deepEqual(takeSpeakable('Bem-vindo à MAVI!',true),{segments:['Bem-vindo à MAVI!'],pending:''});
});

test('NDJSON stream emits text and PCM without leaking provider keys',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(url.includes('/chat/completions'))return new Response(
   'data: '+JSON.stringify({choices:[{delta:{content:'Olá, posso ajudar. '}}]})+'\n\n'+'data: [DONE]\n\n',
   {status:200,headers:{'Content-Type':'text/event-stream'}});
  return new Response(new Uint8Array([0,0,255,127]),{status:200,
   headers:{'Content-Type':'application/octet-stream'}});
 };
 class Out extends EventEmitter{
  constructor(){super();this.destroyed=false;this.writableEnded=false;this.out=[];this.status=0;}
  writeHead(code,headers){this.status=code;this.headers=headers;return this;}
  flushHeaders(){}
  write(value){this.out.push(String(value));return true;}
  end(value){if(value)this.out.push(String(value));this.writableEnded=true;}
 }
 const res=new Out();
 const input=cleanMaviLiveInput({text:'Me fale algo',history:[]});
 await streamMaviLiveCall(res,input,{env:allowed,fetcher});
 assert.equal(res.status,200);
 assert.equal(res.writableEnded,true);
 const events=res.out.join('').trim().split('\n').map(JSON.parse);
 assert.deepEqual(events.map(e=>e.type),['start','text','audio','complete']);
 assert.match(events[1].delta,/Olá/);
 assert.deepEqual([...Buffer.from(events[2].pcm,'base64')],[0,0,255,127]);
 assert.equal(calls.length,2);
 assert.equal(calls[0].init.signal instanceof AbortSignal,true);
 assert.equal(JSON.parse(calls[1].init.body).model_id,'sonic-3.6');
 assert.equal(JSON.parse(calls[1].init.body).output_format.encoding,'pcm_s16le');
 assert.equal(res.out.join('').includes(allowed.CARTESIA_API_KEY),false);
});

test('only the administrator V2 mounts the call and endpoints check role and CSRF',()=>{
 const map=readFileSync(new URL('../src/pages/MapPage.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const control=readFileSync(new URL('../src/components/MaviLiveCall.jsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
 assert.match(map,/adminV2RoadSigns&&<MaviLiveCall active=\{active\}\/>/);
 assert.ok(map.indexOf('<MaviLiveCall active={active}/>')<map.indexOf('circle-btn v95-tools-trigger'));
 assert.doesNotMatch(app,/<MaviLiveCall\/>/);
 assert.match(control,/onClick=\{\(\)=>live\?endCall\(\):void startCall\(\)\}/);
 assert.match(control,/playMaviDialSequence\(context,5\)/);
 assert.doesNotMatch(control,/window\.SpeechRecognition|webkitSpeechRecognition|createPortal|role="dialog"/);
 assert.match(control,/getUserMedia\(/);
 assert.match(control,/echoCancellation:true,noiseSuppression:true/);
 assert.match(control,/s\.busy\|\|s\.ringing/);
 assert.match(map,/jevMode&&navMode&&<JevVoiceButton/);
 assert.match(server,/pathname==='\/api\/admin\/mavi-live\/transcribe'/);
 assert.match(server,/pathname==='\/api\/admin\/mavi-live\/stream'/);
 assert.match(server,/isAdminAccount\(actor\)/);
 assert.match(server,/mavi-live-admin',12,60000/);
 assert.match(server,/protectedWrite\(req,res\)/);
});

test('call connection chime plays only two brief tones',async()=>{
 const {playMaviConnectChime}=await import('../src/lib/maviCallAudio.mjs');
 const started=[];
 const context={
  currentTime:0,destination:{},
  createOscillator:()=>({
   type:'',frequency:{setValueAtTime(){}},connect(){},disconnect(){},
   start(time){started.push(time);},stop(){},onended:null
  }),
  createGain:()=>({
   gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
   connect(){},disconnect(){}
  })
 };
 playMaviConnectChime(context);
 assert.equal(started.length,2);
 assert.ok(started[1]>started[0]);
 const component=readFileSync(new URL('../src/components/MaviLiveCall.jsx',import.meta.url),'utf8');
 assert.match(component,/playMaviDialSequence\(context,5\)/);
 assert.doesNotMatch(component,/window\.SpeechRecognition|webkitSpeechRecognition|new Recognizer/);
});

test('Portuguese live STT refuses arbitrary audio and never exposes API credentials',async()=>{
 const {liveSttProvider,liveSttMime,transcribeMaviLiveAudio}=await import('./mavi-live-stt.mjs');
 const provider=liveSttProvider({GROQ_API_KEY:'gsk_example_server_secret_123456789'});
 assert.equal(provider.model,'whisper-large-v3-turbo');
 assert.equal(liveSttProvider({}),null);
 assert.deepEqual(liveSttMime('audio/webm;codecs=opus'),{mime:'audio/webm',ext:'webm'});
 assert.equal(liveSttMime('text/plain'),null);
 await assert.rejects(()=>transcribeMaviLiveAudio(new Uint8Array(3000),'text/plain',{provider}),/stt_media_unsupported/);
 let used=0;
 const text=await transcribeMaviLiveAudio(new Uint8Array(4000),'audio/webm',{
  provider,fetcher:async(url,options)=>{
   used++;
   assert.ok(url.startsWith('https://api.groq.com/'));
   assert.equal(options.headers.Authorization,'Bearer '+provider.apiKey);
   assert.ok(options.body instanceof FormData);
   return new Response(JSON.stringify({text:'Bom dia, MAVI!'}),{
    status:200,headers:{'Content-Type':'application/json'}
   });
  }
 });
 assert.equal(text,'Bom dia, MAVI!');
 assert.equal(used,1);
});
test('voice activity threshold detects speech but filters quiet echo/noise',async()=>{
 const {micRms,voiceThreshold,shouldStartVoice}=await import('../src/lib/maviMicVAD.mjs');
 assert.equal(micRms(new Uint8Array([128,128,128])),0);
 assert.ok(micRms(new Uint8Array([0,255]))>.8);
 assert.ok(voiceThreshold(.01)>.02);
 assert.equal(shouldStartVoice(.01,.01,3),false);
 assert.equal(shouldStartVoice(.12,.01,2),false);
 assert.equal(shouldStartVoice(.12,.01,3),true);
});

test('live call refreshes credentials and discards navigation audio rather than transcribing it',()=>{
 const call=readFileSync(new URL('../src/components/MaviLiveCall.jsx',import.meta.url),'utf8');
 const stt=readFileSync(new URL('./mavi-live-stt.mjs',import.meta.url),'utf8');
 assert.match(call,/const latest=await api\('\/admin\/mavi-live\/capabilities'\)/);
 assert.match(call,/setCapabilities\(latest\)/);
 assert.match(call,/recording\.onstop=null;recording\.ondataavailable=null;recording\.onerror=null/);
 assert.match(call,/s\.recorder=null;s\.recording=false;s\.chunks=\[\];s\.loudFrames=0/);
 assert.match(call,/s\.recorder=null;s\.chunks=\[\];s\.recording=false/);
 assert.match(call,/if\(s\.active\)endCall\('O microfone foi desconectado\.'\)/);
 assert.doesNotMatch(stt,/nvidia-riva|nvidiaTranscribeWav/);
});
