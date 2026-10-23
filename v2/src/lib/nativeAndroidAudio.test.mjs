import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../../android-vanu/app/src/main/assets/native-audio.js',import.meta.url),'utf8');
function runtime(){
 const messages=[],timers=new Map();let timerId=0;
 const window=new EventTarget();window.top=window;window.VanoHost={postMessage:raw=>messages.push(JSON.parse(raw))};
 vm.runInNewContext(source,{window,Event,EventTarget,DOMException,Date,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 const emit=(name,detail)=>{const event=new Event(name);event.detail=detail;window.dispatchEvent(event);};
 return {window,messages,timers,emit};
}
test('Android microphone waits for the native service and delivers its final transcript',()=>{
 const {window,messages,emit,timers}=runtime(),recognition=new window.SpeechRecognition();
 let started=0,heard='',ended=0;recognition.onstart=()=>started++;recognition.onend=()=>ended++;
 recognition.onresult=e=>{heard=e.results[0][0].transcript;assert.equal(e.results[0].isFinal,true);};
 recognition.start();const id=messages[0].id;
 assert.equal(messages[0].action,'startSpeechRecognition');assert.equal(started,0);
 emit('vano:speech-recognition',{id,type:'start'});assert.equal(started,1);
 emit('vano:speech-recognition',{id,type:'result',text:'Mavi, procure um mercado'});
 emit('vano:speech-recognition',{id,type:'end'});
 assert.equal(heard,'Mavi, procure um mercado');assert.equal(ended,1);assert.equal(timers.size,0);
});
test('permission denial ends listening without restarting the microphone',()=>{
 const {window,messages,emit}=runtime(),r=new window.SpeechRecognition();let error,end=0;r.onerror=e=>error=e.error;r.onend=()=>end++;
 r.start();const id=messages[0].id;emit('vano:speech-recognition',{id,type:'error',error:'not-allowed'});emit('vano:speech-recognition',{id,type:'end'});
 assert.equal(error,'not-allowed');assert.equal(end,1);assert.equal(messages.length,1);
});
test('abort discards late transcripts and cannot end a newer listening session',()=>{
 const {window,messages,emit}=runtime(),r=new window.SpeechRecognition();let heard=0;r.onresult=()=>heard++;
 r.start();const old=messages[0].id;r.abort();r.start();const next=messages.at(-1).id;
 emit('vano:speech-recognition',{id:old,type:'result',text:'late'});emit('vano:speech-recognition',{id:old,type:'end'});
 assert.equal(heard,0);assert.equal(r.id,next);r.abort();
});
test('a missing native callback times out once and releases the listening session',()=>{
 const {window,messages,timers}=runtime(),r=new window.SpeechRecognition();let error;r.onerror=e=>error=e.error;r.start();[...timers.values()][0]();
 assert.equal(error,'no-speech');assert.equal(r.id,null);assert.equal(messages.at(-1).action,'abortSpeechRecognition');assert.equal(timers.size,0);
});
test('assistant playback completes only for its own native utterance',()=>{
 const {window,messages,emit,timers}=runtime(),s=window.VanoNativeSpeechSynthesis,u=new window.VanoNativeUtterance('Olá');let starts=0,ends=0;
 u.onstart=()=>starts++;u.onend=()=>ends++;s.speak(u);const id=messages[0].utteranceId;
 assert.match(id,/^mavi-/);emit('vano:tts',{id:'navigation-cue',status:'done'});assert.equal(ends,0);
 emit('vano:tts',{id,status:'speaking'});assert.equal(starts,1);assert.equal(s.speaking,true);
 emit('vano:tts',{id,status:'done'});assert.equal(ends,1);assert.equal(s.speaking,false);assert.equal(timers.size,0);
});
test('cancel targets assistant speech without stopping unrelated navigation audio',()=>{
 const {window,messages}=runtime(),s=window.VanoNativeSpeechSynthesis,u=new window.VanoNativeUtterance('Olá');let error;u.onerror=e=>error=e.error;
 s.speak(u);const id=messages[0].utteranceId;s.cancel();assert.equal(messages[1].action,'stopSpeech');assert.equal(messages[1].utteranceId,id);assert.equal(error,'canceled');assert.equal(s.speaking,false);
});
test('device voice failure is reported and releases pending assistant playback',()=>{
 const {window,messages,emit,timers}=runtime(),s=window.VanoNativeSpeechSynthesis,u=new window.VanoNativeUtterance('Olá');let error;u.onerror=e=>error=e.error;s.speak(u);
 emit('vano:tts',{id:messages[0].utteranceId,status:'missing-language'});assert.equal(error,'missing-language');assert.equal(s.pending,false);assert.equal(timers.size,0);
});
