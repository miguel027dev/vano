/* VANO Voice Companion — opt-in, offline-first, no recording uploads. */
(()=>{
  'use strict';
  if(!document.body || document.body.classList.contains('vano-admin-surface'))return;
  const el=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };
  const launch=el('button','vano-voice-launch','Voz');
  launch.id='vanoVoiceLaunch';launch.type='button';
  launch.setAttribute('aria-label','Abrir assistente de voz do VANO');
  launch.setAttribute('aria-expanded','false');
  const panel=el('section','vano-voice-panel');
  panel.id='vanoVoicePanel';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Assistente de voz');
  const header=el('div','vano-voice-header');
  const title=el('strong','', 'Assistente VANO');
  const close=el('button','vano-voice-close','×');close.type='button';close.setAttribute('aria-label','Fechar assistente');
  header.append(title,close);
  const state=el('p','vano-voice-status','Modo local · respostas básicas');
  state.setAttribute('role','status');
  const result=el('div','vano-voice-output','Posso ajudar com recursos do VANO. Para respostas da IA e tradução livre, é necessária uma conexão.');
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
  let responseText='',activeController=null,recognizer=null,audio=null,audioUrl=null;
  const isOnline=()=>navigator.onLine!==false;
  const locale=()=>['pt-BR','pt-PT','en','es','fr','ru'].includes(document.documentElement.lang)?document.documentElement.lang:'pt-BR';
  const stopAudio=()=>{
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
  function toggle(showPanel){
    panel.hidden=!showPanel;
    launch.setAttribute('aria-expanded',String(showPanel));
    if(showPanel){refresh();input.focus({preventScroll:true});}
    else{try{recognizer?.abort?.()}catch(_){};stopAudio();activeController?.abort();launch.focus({preventScroll:true});}
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
      if(e.name==='AbortError'){status('Solicitação interrompida.');return;}
      show(localResponse(value,mode));
      status('IA indisponível · modo local');
    }finally{
      if(activeController===controller)activeController=null;
      ask.disabled=false;translate.disabled=false;
    }
  }
  function localSpeak(){
    if(responseText&&window.VANO_NATIVE_SPEECH?.speak){
      try{if(window.VANO_NATIVE_SPEECH.speak(responseText.slice(0,700),locale())==='ok'){status('Usando voz local do Android...');return;}}catch(_){}
    }
    if(!responseText||!window.speechSynthesis||!window.SpeechSynthesisUtterance){
      status('Voz do dispositivo indisponível.');return;
    }
    const available=window.speechSynthesis.getVoices?.()||[];
    if(!isOnline()&&!available.some(v=>v.localService)){
      status('Voz offline não instalada neste dispositivo.');return;
    }
    const utterance=new SpeechSynthesisUtterance(responseText);
    utterance.lang=locale();utterance.rate=1;
    if(!isOnline()){const voice=available.find(v=>v.localService&&v.lang.toLowerCase().startsWith(locale().slice(0,2).toLowerCase()));if(voice)utterance.voice=voice;}
    window.speechSynthesis.speak(utterance);
  }
  async function play(){
    stopAudio();
    if(!responseText)return;
    if(!isOnline()||!capabilities.speech_available){localSpeak();return;}
    const csrf=window.VANO?.csrf;if(!csrf){localSpeak();return;}
    speak.disabled=true;status('Preparando áudio...');
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),14000);
      let r;
      try{r=await fetch('/api/voice/speech',{
        method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({text:responseText.slice(0,700)})
      });}finally{clearTimeout(timer);}
      if(!r.ok||!(r.headers.get('content-type')||'').startsWith('audio/'))throw Error('speech_unavailable');
      const blob=await r.blob();
      audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);
      audio.onended=()=>{stopAudio();status('Áudio concluído.');};
      await audio.play();status('Reproduzindo voz...');
    }catch(_){status('Voz online indisponível · usando voz do dispositivo');localSpeak();}
    finally{speak.disabled=false;}
  }
  function startDictation(){
    if(window.VANO_NATIVE_SPEECH?.dictate){
      try{const result=window.VANO_NATIVE_SPEECH.dictate(locale(),!isOnline());if(result==='ok'){mic.disabled=true;status('Ouvindo pelo Android...');return;}}catch(_){}
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
    mic.disabled=false;
    if(panel.hidden)return;
    const detail=e.detail||{};
    if(detail.error){status(String(detail.error).slice(0,180));return;}
    if(typeof detail.text==='string'&&detail.text.trim()){
      input.value=detail.text.trim().slice(0,700);
      status('Ditado recebido. Confira antes de enviar.');
    }
  });
  launch.onclick=()=>toggle(panel.hidden);
  close.onclick=()=>toggle(false);
  ask.onclick=()=>send('answer');translate.onclick=()=>send('translate');
  speak.onclick=play;mic.onclick=startDictation;
  window.addEventListener('offline',()=>{capabilities={cloud_available:false,speech_available:false};status('Offline · ajuda básica local');});
  window.addEventListener('online',refresh);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)toggle(false);});
  window.addEventListener('pagehide',stopAudio);
})();
