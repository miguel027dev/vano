import test from 'node:test';
import assert from 'node:assert/strict';
import {MaviVoiceController} from './maviVoiceController.mjs';

function harness({voice=true,routeAnswer}={}){
 const events=[],instances=[],commands=[],accepted=[],utterances=[];
 const timers=new Map();let serial=0,now=1000;
 class Recognition {
  constructor(){this.running=false;instances.push(this);}
  start(){this.running=true;}
  abort(){this.running=false;this.onend?.();}
  final(words){this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:words}],{isFinal:true})]});}
  interim(words){this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:words}],{isFinal:false})]});}
  end(){this.running=false;this.onend?.();}
  fail(error){this.onerror?.({error});}
 }
 class Speech {
  constructor(text){this.text=text;utterances.push(this);}
 }
 const synth=voice?{speaking:false,resume(){},getVoices(){return[];},speak(u){this.speaking=true;queueMicrotask(()=>{this.speaking=false;u.onend?.()})}}:null;
 const c=new MaviVoiceController({
  Recognizer:Recognition,synth,Utterance:voice?Speech:null,now:()=>now,
  setTimer:(fn)=>{const id=++serial;timers.set(id,fn);return id;},
  clearTimer:id=>timers.delete(id),
  isVisible:()=>true,isNavigationSpeaking:()=>false,muted:()=>false,
  onStatus:state=>events.push('state:'+state),
  onEvent:event=>events.push(event),
  onCommand:command=>{commands.push(command);return routeAnswer?.(command)??{mode:'information',text:'Não encontrei alternativa.'};},
  onAccept:proposal=>{accepted.push(proposal);return true;}
 });
 const step=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
 const runTimers=()=>{const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();};
 return {c,events,instances,commands,accepted,utterances,step,runTimers,advance:ms=>now+=ms,timers};
}
const alternate=()=>({mode:'proposal',routeId:'safe',routeData:{routes:[{id:'safe'}]},text:'Encontrei outra rota, dois minutos a mais. Quer usar?'});

test('Mavi recalcula a rota -> speaks proposal -> Pode applies exactly once',async()=>{
 const h=harness({routeAnswer:alternate});
 h.c.start();assert.equal(h.instances.length,1);
 h.instances[0].final('Mavi recalcula a rota');
 assert.deepEqual(h.commands,['recalcula a rota'],'server must be requested immediately');
 assert.equal(h.accepted.length,0,'never change original route before spoken consent');
 await h.step();
 assert.equal(h.c.phase,'CONFIRM');
 assert.match(h.utterances[0].text,/Encontrei outra rota/);
 h.runTimers();
 assert.equal(h.instances.length,2);
 h.instances[1].final('Pode');
 assert.equal(h.accepted.length,1,'voice-only confirmation must apply proposal');
 await h.step();
 assert.equal(h.c.phase,'ARMED');
 h.c.dispose();
});

test('split wake: Mavi followed by outra rota in a second recognition session',async()=>{
 const h=harness({routeAnswer:alternate});h.c.start();
 h.instances[0].final('Mavi');h.instances[0].end();
 assert.equal(h.commands.length,0);
 h.runTimers();
 assert.equal(h.instances.length,2);
 h.instances[1].final('troca a rota para mim');
 assert.deepEqual(h.commands,['troca a rota para mim']);
 await h.step();assert.equal(h.c.phase,'CONFIRM');
 h.c.dispose();
});

test('voice unavailable cannot block request or delete a pending option',async()=>{
 const h=harness({voice:false,routeAnswer:alternate});h.c.start();
 h.instances[0].final('Mavi troca a rota');
 assert.deepEqual(h.commands,['troca a rota']);
 await h.step();
 assert.equal(h.c.phase,'CONFIRM');
 h.runTimers();h.instances[1].final('Mavi, pode ser essa');
 assert.equal(h.accepted.length,1);
 h.c.dispose();
});

test('an unknown / unavailable alternative responds without changing route',async()=>{
 const h=harness({routeAnswer:()=>({mode:'information',text:'Não encontrei um caminho diferente.'})});h.c.start();
 h.instances[0].final('Mavi recalcula');
 await h.step();
 assert.equal(h.accepted.length,0);
 assert.equal(h.c.phase,'ARMED');
 assert.match(h.utterances[0].text,/Não encontrei/);
 h.c.dispose();
});

test('interim-only Android result triggers calculation on recognizer end',async()=>{
 const h=harness({routeAnswer:alternate});h.c.start();
 h.instances[0].interim('Mavi recalcula a rota');
 h.instances[0].end();
 assert.deepEqual(h.commands,['recalcula a rota']);
 h.c.dispose();
});

test('repeated recognition errors turn microphone off instead of green dead state',async()=>{
 const h=harness();h.c.start();
 h.instances[0].fail('network');h.instances[0].end();
 h.runTimers();h.instances[1].fail('network');h.instances[1].end();
 h.runTimers();h.instances[2].fail('network');
 assert.equal(h.c.phase,'OFF');assert.equal(h.c.enabled,false);
 h.c.dispose();
});

test('route invalidation never interrupts in-flight route API',async()=>{
 let resolveRoute;
 const h=harness({routeAnswer:()=>new Promise(resolve=>{resolveRoute=resolve;})});
 h.c.start();h.instances[0].final('Mavi troca a rota');
 h.c.routeChanged();
 resolveRoute(alternate());await h.step();
 assert.equal(h.c.phase,'CONFIRM','GPS redraw must not silence request');
 h.c.dispose();
});
