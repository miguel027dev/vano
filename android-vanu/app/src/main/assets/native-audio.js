(()=>{
  if(window.top!==window||window.VanoNativeSpeechSynthesis)return;
  const call=data=>{try{if(window.VanoHost?.postMessage){window.VanoHost.postMessage(JSON.stringify(data));return true;}return prompt('VANO_NATIVE',JSON.stringify(data))==='ok';}catch{return false;}};
  let sequence=0;
  class NativeRecognition extends EventTarget{
    constructor(){super();this.lang='pt-BR';this.continuous=false;this.interimResults=false;this.maxAlternatives=1;this.id=null;this.timer=null;}
    emit(type,data={}){const event=new Event(type);Object.assign(event,data);this['on'+type]?.(event);this.dispatchEvent(event);}
    start(){
      if(this.id)throw new DOMException('Recognition already started','InvalidStateError');
      this.id='speech-'+Date.now()+'-'+(++sequence);
      this.listener=event=>{
        const data=event.detail||{};if(data.id!==this.id)return;
        if(data.type==='start')this.emit('start');
        if(data.type==='result'){const row=[{transcript:data.text||'',confidence:1}];row.isFinal=true;this.emit('result',{resultIndex:0,results:[row]});}
        if(data.type==='error')this.emit('error',{error:data.error||'service-not-allowed'});
        if(data.type==='end')this.finish();
      };
      window.addEventListener('vano:speech-recognition',this.listener);
      // Also bounds a missing permission/service response. Never auto-restart here.
      this.timer=setTimeout(()=>{if(!this.id)return;call({action:'abortSpeechRecognition',id:this.id});this.emit('error',{error:'no-speech'});this.finish();},45000);
      if(!call({action:'startSpeechRecognition',id:this.id,language:this.lang})){this.emit('error',{error:'service-not-allowed'});this.finish();}
    }
    finish(){if(!this.id)return;this.id=null;clearTimeout(this.timer);window.removeEventListener('vano:speech-recognition',this.listener);this.emit('end');}
    stop(){if(this.id)call({action:'stopSpeechRecognition',id:this.id});}
    abort(){if(this.id){call({action:'abortSpeechRecognition',id:this.id});this.finish();}}
  }
  class NativeUtterance{constructor(text){this.text=text;this.lang='pt-BR';this.rate=1;this.volume=1;}}
  const synth={speaking:false,pending:false,current:null,timer:null,
    getVoices:()=>[],resume(){},
    speak(utterance){
      this.cancel();const id='mavi-'+Date.now()+'-'+(++sequence);this.current={id,utterance};this.pending=true;
      const fail=()=>{if(this.current?.id===id){this.cancel();utterance.onerror?.({error:'synthesis-failed'});}};
      this.timer=setTimeout(fail,25000);
      if(!call({action:'speak',text:String(utterance.text||'').slice(0,1200),language:utterance.lang||'pt-BR',utteranceId:id}))fail();
    },
    cancel(){const current=this.current;this.current=null;this.speaking=false;this.pending=false;clearTimeout(this.timer);if(current){call({action:'stopSpeech',utteranceId:current.id});current.utterance.onerror?.({error:'canceled'});}}
  };
  window.addEventListener('vano:tts',event=>{
    const data=event.detail||{},current=synth.current;if(!current||data.id!==current.id)return;
    const utterance=current.utterance;
    if(data.status==='speaking'){synth.pending=false;synth.speaking=true;utterance.onstart?.();return;}
    if(!['done','canceled','unavailable','missing-language'].includes(data.status))return;
    synth.current=null;synth.speaking=false;synth.pending=false;clearTimeout(synth.timer);
    if(data.status==='done')utterance.onend?.();else utterance.onerror?.({error:data.status});
  });
  window.SpeechRecognition=NativeRecognition;
  window.webkitSpeechRecognition=NativeRecognition;
  window.VanoNativeUtterance=NativeUtterance;
  window.VanoNativeSpeechSynthesis=synth;
})();
