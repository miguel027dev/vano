/* MAVI — VANO map assistant. Voice/text opt-in; no location access or recording uploads. */
(()=>{
  'use strict';
  if(!document.body || !document.body.classList.contains('vano-map-surface') || document.body.classList.contains('vano-admin-surface'))return;
  const el=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };
  // Keep all MAVI styling self-contained; no changes to the map's controlled CSS files.
  const style=el('style');
  style.textContent=`/* MAVI voice surface — scoped styles; does not alter map or navigation components. */
.vano-voice-launch {
  position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(86px + env(safe-area-inset-bottom,0px));
  z-index:3100;border:1px solid var(--ui-line,#d7c9ba);background:var(--ui-surface,#fff);
  color:var(--ui-ink,#25211c);border-radius:999px;min-width:52px;min-height:44px;
  padding:10px 16px;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 5px 22px #0002;
  cursor:pointer;
}
.vano-map-surface.body-nav .vano-voice-launch,
.vano-map-surface.body-nav .vano-voice-panel { display:none!important; }
.vano-voice-panel[hidden] { display:none!important; }
.vano-voice-panel {
  position:fixed;right:max(12px,env(safe-area-inset-right));
  bottom:calc(138px + env(safe-area-inset-bottom,0px));
  z-index:3101;box-sizing:border-box;
  width:min(360px,calc(100vw - 24px));max-height:min(490px,calc(100dvh - 140px));
  overflow-y:auto;overscroll-behavior:contain;
  background:var(--ui-surface,#fff);color:var(--ui-ink,#25211c);
  border:1px solid var(--ui-line,#d7c9ba);border-radius:18px;padding:15px;
  box-shadow:0 14px 44px #0003;font:14px/1.4 system-ui,sans-serif;
}
.vano-voice-header {display:flex;align-items:center;justify-content:space-between;gap:10px;}
.vano-voice-header strong {font-size:16px;}
.vano-voice-header .vano-voice-close {width:38px;height:38px;font-size:22px;}
.vano-voice-status,.vano-voice-note {font-size:12px;line-height:1.5;color:var(--ui-muted,#71675c);margin:8px 0;}
.vano-voice-output {padding:11px;border-radius:12px;background:var(--ui-raised,#f6eee7);
  min-height:65px;max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;}
.vano-voice-input {box-sizing:border-box;width:100%;min-height:56px;margin:10px 0 8px;
  resize:vertical;padding:10px;border-radius:12px;border:1px solid var(--ui-line,#ccc);
  background:var(--ui-surface,#fff);color:var(--ui-ink,#222);font:14px/1.4 system-ui;}
.vano-voice-actions {display:flex;gap:6px;flex-wrap:wrap;}
.vano-voice-actions button,.vano-voice-header button {border:1px solid var(--ui-line,#ccc);
  border-radius:10px;padding:8px 10px;min-height:40px;background:transparent;
  color:inherit;cursor:pointer;font:600 12px system-ui;}
.vano-voice-actions button.vano-voice-primary {background:#ee975a;color:#211a16;border-color:#d98954;}
.vano-voice-actions button:disabled {opacity:.55;cursor:default;}
.vano-voice-actions button:focus-visible,.vano-voice-input:focus-visible,.vano-voice-launch:focus-visible {
  outline:3px solid var(--ui-focus,#a34412);outline-offset:2px;
}
@media(max-height:500px) {.vano-voice-panel {bottom:58px;max-height:calc(100dvh - 80px)}
  .vano-voice-launch{bottom:7px;}}
@media(prefers-reduced-motion:reduce) {.vano-voice-panel,.vano-voice-launch {transition:none!important;}}
`;
  document.head.append(style);
  const launch=el('button','vano-voice-launch','MAVI');
  launch.id='maviVoiceLaunch';launch.type='button';
  launch.setAttribute('aria-label','Abrir MAVI, assistente do mapa');
  launch.setAttribute('aria-expanded','false');
  const panel=el('section','vano-voice-panel');
  panel.id='maviVoicePanel';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','MAVI, assistente do mapa');
  const header=el('div','vano-voice-header');
  const title=el('strong','', 'MAVI · Assistente do mapa');
  const close=el('button','vano-voice-close','×');close.type='button';close.setAttribute('aria-label','Fechar assistente');
  header.append(title,close);
  const state=el('p','vano-voice-status','Modo local · respostas básicas');
  state.setAttribute('role','status');
  const result=el('div','vano-voice-output','Posso ajudar com o VANO Maps. Recursos de IA precisam estar configurados e de uma conexão.');
  result.setAttribute('aria-live','polite');
  const input=el('textarea','vano-voice-input');
  input.id='vanoVoiceInput';input.maxLength=700;input.rows=2;
  input.placeholder='Digite ou dite uma pergunta...';
  input.setAttribute('aria-label','Pergunta para o assistente');
  const actions=el('div','vano-voice-actions');
  const mic=el('button','', 'Ditar');mic.type='button';
  const ask=el('button','vano-voice-primary','Perguntar');ask.type='button';
  const translate=el('button','', 'Traduzir');translate.type='button';
  const speak=el('button','', 'Ouvir resposta');speak.type='button';speak.disabled=true;
  actions.append(mic,ask,translate,speak);
  const note=el('p','vano-voice-note','O microfone e o áudio são opcionais. O texto enviado online poderá ser processado por provedores externos.');
  panel.append(header,state,result,input,actions,note);
  document.body.append(launch,panel);
  let capabilities={cloud_available:false,speech_available:false};
  let responseText='',activeController=null,speechController=null,recognizer=null,audio=null,audioUrl=null;
  let awaitingNativeAudio=false,awaitingDictation=false;
  const isOnline=()=>navigator.onLine!==false;
  const locale=()=>['pt-BR','pt-PT','en','es','fr','ru'].includes(document.documentElement.lang)?document.documentElement.lang:'pt-BR';
  const stopAudio=()=>{
    awaitingNativeAudio=false;
    speechController?.abort();speechController=null;
    try{window.speechSynthesis?.cancel?.()}catch(_){}
    if(audio){audio.pause();audio=null;}
    try{window.VANO_NATIVE_SPEECH?.stop?.();}catch(_){}
    if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}
  };
  const status=(text)=>{state.textContent=text;};
  const show=(text)=>{responseText=String(text||'');result.textContent=responseText;speak.disabled=!responseText;};
  const localResponse=(text,mode)=>{
    if(mode==='translate')return 'Tradução livre indisponível offline. Use a tradução online quando houver conexão.';
    const q=text.toLowerCase();
    if(/^(olá|ola|oi|hello|hi|bonjour|hola)\b/.test(q))return 'Olá! Posso ajudar com informações básicas do VANO.';
    if(/(cep|endereço|endereco|rua|destino|address|search)/.test(q))return 'Abra o mapa e informe rua, número ou CEP. Uma nova busca de endereço requer internet.';
    if(/(rota|route|naveg|gps|trânsito|transito)/.test(q))return 'Para iniciar uma nova rota, abra o mapa, confirme o destino e escolha a opção desejada. Sem internet, não é possível calcular trajetos novos.';
    if(/(privacidade|segurança|dados|privacy)/.test(q))return 'Consulte as páginas Privacidade e Ajuda do VANO para conhecer os recursos e controles.';
    return 'No modo local, consigo responder apenas a perguntas básicas. A IA e a tradução livre precisam de conexão.';
  };
  async function refresh(){
    if(!isOnline()){status('Offline · ajuda básica local');return;}
    try{
      const r=await fetch('/api/voice/capabilities',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout?.(3500)});
      if(r.ok)capabilities=await r.json();
    }catch(_){}
    status(capabilities.cloud_available?'IA disponível com internet':'Modo local · IA externa não configurada');
  }
  function toggle(showPanel,restoreFocus=true){
    if(!showPanel&&panel.hidden)return;
    panel.hidden=!showPanel;
    launch.setAttribute('aria-expanded',String(showPanel));
    if(showPanel){refresh();input.focus({preventScroll:true});}
    else{awaitingDictation=false;try{recognizer?.abort?.()}catch(_){};mic.disabled=false;stopAudio();activeController?.abort();if(restoreFocus)launch.focus({preventScroll:true});}
  }
  async function send(mode){
    const value=input.value.trim();
    if(!value){status('Digite ou dite uma pergunta.');return;}
    if(value.length>700){status('Texto muito longo.');return;}
    activeController?.abort();activeController=null;stopAudio();
    if(!isOnline()||!capabilities.cloud_available){
      show(localResponse(value,mode));status(!isOnline()?'Offline · sem chamadas externas':'Modo local · APIs externas desativadas');return;
    }
    const csrf=window.VANO?.csrf;
    if(!csrf){show(localResponse(value,mode));status('Sem sessão disponível para usar a IA.');return;}
    const controller=new AbortController();activeController=controller;
    ask.disabled=true;translate.disabled=true;status('Processando texto...');speak.disabled=true;
    try{
      const timer=setTimeout(()=>controller.abort(),14000);
      let r;
      try{r=await fetch('/api/voice/message',{
        method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({text:value,mode,locale:locale()})
      });}finally{clearTimeout(timer);}
      const d=await r.json();
      if(!r.ok||!d.ok)throw Error(d.code||'service_unavailable');
      show(d.text);status(mode==='translate'?'Tradução online concluída':'Resposta da IA disponível');
    }catch(e){
      if(e.name==='AbortError'){if(activeController===controller)status('Solicitação interrompida.');return;}
      if(activeController!==controller)return;
      show(localResponse(value,mode));
      status('IA indisponível · modo local');
    }finally{
      if(activeController===controller){activeController=null;ask.disabled=false;translate.disabled=false;}
    }
  }
  function browserSpeak(){
    if(!responseText||!window.speechSynthesis||!window.SpeechSynthesisUtterance){
      status('Voz do dispositivo indisponível.');return;
    }
    const voices=window.speechSynthesis.getVoices?.()||[];
    const lang=locale().toLowerCase();
    const matching=voices.find(v=>v.localService&&String(v.lang).toLowerCase()===lang)||
      voices.find(v=>v.localService&&String(v.lang).toLowerCase().startsWith(lang.slice(0,2)))||
      voices.find(v=>String(v.lang).toLowerCase()===lang)||
      voices.find(v=>String(v.lang).toLowerCase().startsWith(lang.slice(0,2)));
    if(!isOnline()&&(!matching||matching.localService!==true)){
      status('Sem voz offline instalada. A resposta está disponível em texto.');return;
    }
    try{
      const utterance=new SpeechSynthesisUtterance(responseText);
      utterance.lang=locale();utterance.rate=1;
      if(matching)utterance.voice=matching;
      utterance.onend=()=>{if(!panel.hidden)status('Áudio concluído.');};
      utterance.onerror=()=>{if(!panel.hidden)status('Não foi possível reproduzir a voz neste aparelho.');};
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      status('Reproduzindo voz do dispositivo...');
    }catch(_){status('Voz do dispositivo indisponível.');}
  }
  function localSpeak(){
    if(responseText&&window.VANO_NATIVE_SPEECH?.speak){
      try{
        if(window.VANO_NATIVE_SPEECH.speak(responseText.slice(0,700),locale())==='ok'){
          awaitingNativeAudio=true;status('Usando voz do Android...');return;
        }
      }catch(_){}
    }
    browserSpeak();
  }
  async function play(){
    stopAudio();
    if(!responseText)return;
    if(!isOnline()||!capabilities.speech_available){localSpeak();return;}
    const csrf=window.VANO?.csrf;if(!csrf){localSpeak();return;}
    speak.disabled=true;status('Preparando áudio...');
    try{
      const controller=new AbortController();speechController=controller;const timer=setTimeout(()=>controller.abort(),14000);
      let r;
      try{r=await fetch('/api/voice/speech',{
        method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({text:responseText.slice(0,700)})
      });}finally{clearTimeout(timer);}
      if(!r.ok||!(r.headers.get('content-type')||'').startsWith('audio/'))throw Error('speech_unavailable');
      const blob=await r.blob();
      if(controller.signal.aborted||panel.hidden||speechController!==controller)return;
      audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);
      audio.onended=()=>{stopAudio();status('Áudio concluído.');};
      await audio.play();status('Reproduzindo voz...');
    }catch(_){if(!panel.hidden&&isOnline()){status('Voz online indisponível · usando voz do dispositivo');localSpeak();}}
    finally{speechController=null;speak.disabled=false;}
  }
  function startDictation(){
    if(window.VANO_NATIVE_SPEECH?.dictate){
      try{const result=window.VANO_NATIVE_SPEECH.dictate(locale(),!isOnline());if(result==='ok'){awaitingDictation=true;mic.disabled=true;status('Ouvindo pelo Android...');return;}}catch(_){}
    }
    if(!isOnline()){status('Ditado offline requer o aplicativo Android com reconhecimento local instalado. Você pode digitar.');return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){status('Ditado indisponível neste navegador. Você pode digitar.');return;}
    try{
      if(recognizer){recognizer.abort();recognizer=null;}
      recognizer=new SR();recognizer.lang=locale();recognizer.interimResults=false;recognizer.continuous=false;
      recognizer.onresult=e=>{input.value=String(e.results?.[0]?.[0]?.transcript||'').slice(0,700);status('Ditado recebido. Confirme o texto antes de enviar.');};
      recognizer.onerror=()=>status('Não foi possível usar o microfone. Digite sua pergunta.');
      recognizer.onend=()=>{mic.disabled=false;};
      mic.disabled=true;recognizer.start();status('Ouvindo...');
    }catch(_){mic.disabled=false;status('Microfone não disponível.');}
  }
  window.addEventListener('vano:native-dictation',e=>{
    if(panel.hidden)return;
    const detail=e.detail||{},error=String(detail.error||'');
    // Android's legacy bridge sends both dictation results and TTS errors here.
    if(error&&awaitingNativeAudio&&/voz offline|instale uma voz local/i.test(error)){
      awaitingNativeAudio=false;browserSpeak();return;
    }
    if(!awaitingDictation)return;
    awaitingDictation=false;mic.disabled=false;
    if(error){status(error.slice(0,180));return;}
    if(typeof detail.text==='string'&&detail.text.trim()){
      input.value=detail.text.trim().slice(0,700);
      status('Ditado recebido. Confira antes de enviar.');
    }
  });
  // Navigation hides the widget via CSS; closing state must also cancel mic,
  // pending AI and TTS requests, so audio never starts during a route.
  const navigationObserver=new MutationObserver(()=>{
    if(document.body.classList.contains('body-nav')&&!panel.hidden)toggle(false,false);
  });
  navigationObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  launch.onclick=()=>toggle(panel.hidden);
  close.onclick=()=>toggle(false);
  ask.onclick=()=>send('answer');translate.onclick=()=>send('translate');
  speak.onclick=play;mic.onclick=startDictation;
  window.addEventListener('offline',()=>{capabilities={cloud_available:false,speech_available:false};status('Offline · ajuda básica local');});
  window.addEventListener('online',refresh);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)toggle(false);});
  window.addEventListener('pagehide',stopAudio);
})();
