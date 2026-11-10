'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/vano-map.js','utf8');
function sliceBetween(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing audio source functions: '+start);
 return source.slice(a,b);
}
const assetNames=['facaRetorno','continueFrente','sigaFrente','em50','em200','em300','em500','em1km','em2km','mantenhaSeDireita','mantenhaDireita','mantenhaEsquerda','vireDireita','leveDireita','leveEsquerda','chegou','destinoEsquerda'];
const assets=Object.fromEntries(assetNames.map(name=>[name,name+'.mp3']));

// Fixed clips must never discard a street name, an unsupported distance or a left turn.
{
 const context={VANO_ASSETS:assets};
 vm.createContext(context);
 vm.runInContext(sliceBetween('function normalizeVanoText(value){','let pendingV1NativeSpeech=null;'),context);
 assert.deepEqual(Array.from(context.vanoSegmentsForText('Em 200 metros, vire à direita')),['em200.mp3','vireDireita.mp3']);
 assert.deepEqual(Array.from(context.vanoSegmentsForText('Em 200 metros, vire à direita na Rua X')),[]);
 assert.deepEqual(Array.from(context.vanoSegmentsForText('Em 150 metros, vire à direita')),[]);
 assert.deepEqual(Array.from(context.vanoSegmentsForText('Vire à esquerda')),[]);
 assert.deepEqual(Array.from(context.vanoSegmentsForText('Siga em frente')),['sigaFrente.mp3']);
}
// If an earlier priority blocks a cue, the cue must remain eligible on the next GPS update.
{
 let count=0;
 const context={soundEnabled:true,spokenMilestones:new Set(),lastNavPosition:{speed:9},isMotorizedProfile:()=>true,
  speak(){count++;return count!==1;}};
 vm.createContext(context);
 vm.runInContext(sliceBetween('function maybeSpeakStep(step){','function updateProgressLine(index){'),context);
 const step={stepIndex:3,remainingInStep:100,voice_prompts:[{distance:160,announcement:'Vire à direita'}]};
 context.maybeSpeakStep(step);
 assert.equal(context.spokenMilestones.size,0);
 context.maybeSpeakStep(step);
 assert.equal(context.spokenMilestones.size,1);
 assert.equal(count,2);
}
// The actual Android bridge is honored; if the offline engine fails, Web Speech gets the full instruction.
{
 let cb=null,native=[],browser=[];
 const scope={VANO_NATIVE_SPEECH:{speak:(text,locale)=>{native.push([text,locale]);return 'ok';}},
  addEventListener(name,fn){if(name==='vano:native-dictation')cb=fn;},
  speechSynthesis:{cancel(){},getVoices(){return [{lang:'pt-BR'}]},speak(u){browser.push(u.text)}}};
 const context={window:scope,BOOT:{locale:'pt-BR'},soundEnabled:true,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},console};
 vm.createContext(context);
 vm.runInContext(sliceBetween('let pendingV1NativeSpeech=null;','async function playVanoSequence('),context);
 assert.equal(context.speakAutomatic('Em 150 metros, vire à direita na Rua X'),true);
 assert.deepEqual(native,[['Em 150 metros, vire à direita na Rua X','pt-BR']]);
 assert.deepEqual(browser,[]);
 cb({detail:{error:'Instale uma voz local para reproduzir sem internet.'}});
 assert.deepEqual(browser,['Em 150 metros, vire à direita na Rua X']);
 assert.equal(native.length,1,'fallback must not requeue on broken native TTS');
}
console.log('PASS: VANO V1 recorded-clips, priority retry, native bridge and browser fallback');
