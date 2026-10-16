import {consumeMaviTranscript,maviConfirmation,maviRearmDelay} from './maviVoiceLogic.mjs';
import {classifyJev} from './jevShared.mjs';

/** MAVI's browser-independent control flow.
 * Routing never waits for speech synthesis; alternatives require voice consent.
 * Only an active /v2 component instantiates this controller.
 */
export class MaviVoiceController {
 constructor(deps={}){
  this.d={onCommand:()=>({mode:'information',text:'Não consegui calcular.'}),onAccept:()=>false,onStatus:()=>{},onEvent:()=>{},Recognizer:null,synth:null,Utterance:null,isVisible:()=>true,isNavigationSpeaking:()=>false,muted:()=>false,now:()=>Date.now(),setTimer:(fn,ms)=>setTimeout(fn,ms),clearTimer:id=>clearTimeout(id),...deps};
  this.enabled=false;this.phase='OFF';this.recognizer=null;this.timer=null;this.voiceTimer=null;
  this.operation=0;this.abort=null;this.ownVoice=null;this.wakeUntil=0;this.pending=null;
  this.pendingUntil=0;this.softFailures=0;this.hardFailures=0;this.synthWait=0;
 }
 configure(deps){Object.assign(this.d,deps);}
 emit(event){try{this.d.onEvent(event,this.phase)}catch{/* diagnostics must never break navigation */}}
 state(next){this.phase=next;this.d.onStatus(next);}
 clearTimer(){if(this.timer!==null){this.d.clearTimer(this.timer);this.timer=null;}}
 clearVoiceTimer(){if(this.voiceTimer!==null){this.d.clearTimer(this.voiceTimer);this.voiceTimer=null;}}
 stopRecognizer(){
  this.clearTimer();
  const old=this.recognizer;this.recognizer=null;
  if(old){try{old.abort?.()}catch{/* already done */}}
 }
 start(){
  if(this.enabled)return;
  if(!this.d.Recognizer||!this.d.isVisible()){this.emit('recognizer_unavailable');return;}
  this.enabled=true;this.softFailures=0;this.hardFailures=0;this.wakeUntil=0;
  this.pending=null;this.pendingUntil=0;this.synthWait=0;
  this.state('ARMED');this.emit('enabled');
  // Start synchronously in the same user-click gesture.
  this.listen();
  try{this.d.synth?.resume?.()}catch{/* no-op */}
 }
 stop(){
  this.enabled=false;this.operation++;
  this.abort?.abort?.();this.abort=null;this.stopRecognizer();this.clearVoiceTimer();
  this.pending=null;this.wakeUntil=0;this.ownVoice=null;
  this.state('OFF');this.emit('disabled');
  // Deliberately do not globally cancel SpeechSynthesis: navigation owns it too.
 }
 dispose(){this.stop();}
 rearm(delay=550){
  if(!this.enabled||!['ARMED','CONFIRM'].includes(this.phase))return;
  this.clearTimer();
  this.timer=this.d.setTimer(()=>{
   this.timer=null;
   if(!this.enabled||!['ARMED','CONFIRM'].includes(this.phase))return;
   if(!this.d.isVisible()){this.stop();return;}
   if(this.ownVoice||this.d.synth?.speaking||this.d.isNavigationSpeaking()){
    if(++this.synthWait>18){this.emit('audio_busy_timeout');this.stop();return;}
    this.rearm(1000);return;
   }
   this.synthWait=0;this.listen();
  },Math.max(200,delay));
 }
 listen(){
  if(!this.enabled||!['ARMED','CONFIRM'].includes(this.phase)||this.recognizer)return;
  if(!this.d.isVisible()){this.stop();return;}
  if(this.ownVoice||this.d.synth?.speaking||this.d.isNavigationSpeaking()){this.rearm(800);return;}
  let recognition;
  try{recognition=new this.d.Recognizer()}catch{this.emit('recognizer_constructor_error');this.stop();return;}
  recognition.lang='pt-BR';
  recognition.continuous=false; // stable Chrome Android behaviour from earlier prototype
  recognition.interimResults=true;recognition.maxAlternatives=1;
  this.recognizer=recognition;
  let latestInterim='',hadFinal=false,errorCode='';
  recognition.onresult=event=>{
   if(!this.enabled||this.recognizer!==recognition)return;
   for(let i=event.resultIndex||0;i<(event.results?.length||0);i++){
    const result=event.results[i];
    const words=String(result?.[0]?.transcript||'').trim();
    if(!words)continue;
    if(result.isFinal){
     hadFinal=true;
     latestInterim='';
     if(this.accept(words)){this.softFailures=0;this.hardFailures=0;return;}
    }else latestInterim=words;
   }
  };
  recognition.onerror=event=>{
   if(!this.enabled||this.recognizer!==recognition)return;
   errorCode=String(event?.error||'unknown');
   this.emit('recognition_'+errorCode.replace(/[^a-z-]/g,''));
   if(['not-allowed','service-not-allowed','audio-capture','language-not-supported','language-unavailable'].includes(errorCode)){
    this.stop();return;
   }
   if(!['no-speech'].includes(errorCode)&&++this.hardFailures>=3)this.stop();
  };
  recognition.onend=()=>{
   if(this.recognizer!==recognition)return; // explicit abort: never double-start
   this.recognizer=null;
   if(!this.enabled||!['ARMED','CONFIRM'].includes(this.phase))return;
   // On Android an interim may be all the browser delivers; never require onresult.isFinal.
   if(latestInterim){
    const preview=consumeMaviTranscript(latestInterim,{wakeUntil:this.wakeUntil,now:this.d.now()});
    if(preview.kind==='wake'||(preview.kind==='command'&&
      (classifyJev(preview.command)!=='unknown'||(this.pending&&maviConfirmation(preview.command))))){
      if(this.accept(latestInterim))return;
    }
   }
   if(!hadFinal)this.softFailures++;
   else this.softFailures=0;
   const delay=maviRearmDelay({silentCount:this.softFailures,hardCount:this.hardFailures,wakePending:this.wakeUntil>this.d.now()});
   if(delay===null){this.emit('recognition_retries_exhausted');this.stop();}
   else this.rearm(delay);
  };
  try{recognition.start();this.emit('recognition_started');}
  catch(error){
   this.recognizer=null;this.emit('recognition_start_'+String(error?.name||'failed'));
   const delay=maviRearmDelay({hardCount:++this.hardFailures});
   if(delay===null)this.stop();else this.rearm(delay);
  }
 }
 accept(phrase){
  if(!this.enabled||!['ARMED','CONFIRM'].includes(this.phase))return false;
  const now=this.d.now();
  // A brief "Pode" is supported after MAVI proposed a route.
  const inConfirmation=Boolean(this.pending&&this.phase==='CONFIRM'&&this.pendingUntil>now);
  const candidate=consumeMaviTranscript(phrase,{wakeUntil:this.wakeUntil,now});
  this.wakeUntil=candidate.wakeUntil||0;
  let command=null;
  if(candidate.kind==='command')command=candidate.command;
  else if(inConfirmation){
   const plain=String(phrase||'').trim();
   if(plain.length<=55&&maviConfirmation(plain))command=plain;
  }
  if(command===null){
   if(candidate.kind==='wake'){this.emit('wake_heard');return false;}
   return false;
  }
  if(!command)return false;
  this.emit('command_heard');
  this.softFailures=0;this.hardFailures=0;
  this.wakeUntil=0;
  this.stopRecognizer();
  if(inConfirmation){
   const verdict=maviConfirmation(command);
   if(verdict){this.confirm(verdict);return true;}
  }
  this.calculate(command);
  return true;
 }
 calculate(command){
  if(!this.enabled)return;
  this.state('PROCESSING');this.pending=null;this.pendingUntil=0;
  this.stopRecognizer();
  const seq=++this.operation;
  this.abort?.abort?.();
  const controller=new AbortController();this.abort=controller;
  this.emit('route_request_sent');
  // Call BEFORE any TTS, and never block routing on audio.
  let promise;
  try{promise=Promise.resolve(this.d.onCommand(command,controller.signal));}
  catch(e){promise=Promise.reject(e);}
  promise.then(answer=>{
   if(!this.enabled||seq!==this.operation)return;
   this.abort=null;
   const proposal=answer?.mode==='proposal'&&Array.isArray(answer.routeData?.routes)&&answer.routeData.routes.length>0;
   this.pending=proposal?answer:null;
   this.pendingUntil=proposal?this.d.now()+60000:0;
   this.emit(proposal?'route_proposed':'route_information');
   this.speak(answer?.text||'Não encontrei outra rota. Mantive o trajeto atual.',proposal?'CONFIRM':'ARMED');
  }).catch(()=>{
   if(!this.enabled||seq!==this.operation)return;
   this.abort=null;this.pending=null;
   this.emit('route_request_failed');
   this.speak(controller.signal.aborted?'A pesquisa demorou demais. Sua rota foi mantida.':
     'Não consegui consultar o motor de rotas. Seu trajeto atual foi mantido.','ARMED');
  });
 }
 confirm(decision){
  if(!this.enabled)return;
  this.state('PROCESSING');this.stopRecognizer();
  const proposal=this.pending;this.pending=null;this.pendingUntil=0;
  let message='Tudo bem. Mantive a rota atual.';
  if(decision==='accept'&&proposal){
   let success=false;
   try{success=this.d.onAccept(proposal)!==false}catch{/* route expired */}
   this.emit(success?'route_accepted':'route_rejected_stale');
   message=success?'Feito. Nova rota selecionada.':'A sugestão expirou. Mantive a rota original.';
  }else this.emit('route_declined');
  this.speak(message,'ARMED');
 }
 speak(text,next='ARMED'){
  if(!this.enabled)return;
  this.state('SPEAKING');this.stopRecognizer();this.clearVoiceTimer();
  const synth=this.d.synth,Utterance=this.d.Utterance;
  const finish=()=>{
   this.clearVoiceTimer();this.ownVoice=null;
   if(!this.enabled||this.phase!=='SPEAKING')return;
   this.state(next);
   this.rearm(next==='CONFIRM'?450:750);
  };
  if(this.d.muted()||!synth?.speak||!Utterance){
   this.emit('speech_unavailable');
   finish();return;
  }
  let count=0;
  const speakWhenSafe=()=>{
   if(!this.enabled||this.phase!=='SPEAKING')return;
   if(synth.speaking||this.d.isNavigationSpeaking()){
    if(++count>12){this.emit('speech_busy');finish();return;}
    this.voiceTimer=this.d.setTimer(speakWhenSafe,850);return;
   }
   try{
    synth.resume?.();
    const utter=new Utterance(text);
    utter.lang='pt-BR';utter.rate=1;utter.volume=1;
    const voices=synth.getVoices?.()||[];
    const available=voices.find(v=>String(v.lang).toLowerCase()==='pt-br')||
      voices.find(v=>String(v.lang).toLowerCase().startsWith('pt'));
    if(available)utter.voice=available;
    this.ownVoice=utter;
    let concluded=false;
    const complete=(ok)=>{
     if(concluded||this.ownVoice!==utter)return;
     concluded=true;
     this.emit(ok?'speech_completed':'speech_failed');
     finish();
    };
    utter.onend=()=>complete(true);
    utter.onerror=()=>complete(false);
    this.emit('speech_started');
    synth.speak(utter);
    // Some WebViews never fire 'end'. Don't deadlock route or confirmation.
    this.voiceTimer=this.d.setTimer(()=>complete(false),Math.min(18000,Math.max(5000,text.length*115)));
   }catch{this.emit('speech_exception');finish();}
  };
  speakWhenSafe();
 }
 routeChanged(){
  // Only invalidate a pending alternative, not the in-flight recognition/route call.
  // GPS state refreshes must not make MAVI go silently idle.
  this.pending=null;this.pendingUntil=0;
  if(this.phase==='CONFIRM'){this.state('ARMED');this.rearm(550);}
 }
}
