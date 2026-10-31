/* Admin-only experimental MAVI Gemini Live voice lab for /v2.
   Does not alter the VANO route engine, GPS or public MAVI assistant. */
(() => {
  'use strict';
  if (!/^\/v2\/?$/i.test(location.pathname) || window.VANO_BOOT?.isAdmin !== true) return;

  const root = document.createElement('aside');
  root.id = 'maviGeminiLab';
  root.setAttribute('aria-label', 'Laboratório de voz Gemini Live da MAVI');
  root.innerHTML = `
    <button class="mavi-live-launch" type="button" aria-expanded="false" aria-controls="maviLivePanel">
      <span class="mavi-live-pulse" aria-hidden="true"></span>MAVI <b>Live</b>
    </button>
    <section id="maviLivePanel" class="mavi-live-panel" hidden>
      <header class="mavi-live-header">
        <div><strong>MAVI Live</strong><small>Voz simultânea · modo ligação V2</small></div>
        <button class="mavi-live-close" type="button" aria-label="Fechar laboratório">×</button>
      </header>
      <label class="mavi-live-label">Modelo
        <select class="mavi-live-model">
          <option value="gemini-3.8-live">Gemini 3.8 Live</option>
          <option value="gemini-3.8-live-extended-thinking">3.8 Live · Extended Thinking</option>
          <option value="gemini-3.1-flash-live-preview">3.1 Flash Live · Legacy</option>
        </select>
      </label>
      <label class="mavi-live-label">Voz
        <select class="mavi-live-voice">
          <option value="Kore">Kore</option>
          <option value="Aoede">Aoede</option>
          <option value="Puck">Puck</option>
          <option value="Charon">Charon · informativa</option>
          <option value="Achird">Achird · amigável</option>
          <option value="Algieba">Algieba · suave</option>
          <option value="Iapetus">Iapetus · clara</option>
          <option value="Sulafat">Sulafat · acolhedora</option>
          <option value="Leda">Leda · jovem</option>
          <option value="Zephyr">Zephyr · brilhante</option>
          <option value="Orus">Orus · firme</option>
        </select>
      </label>
      <div class="mavi-live-actions">
        <button class="mavi-live-start" type="button">Iniciar chamada</button>
        <button class="mavi-live-mute" type="button" disabled>Silenciar</button>
        <button class="mavi-live-stop" type="button" disabled>Encerrar</button>
      </div>
      <p class="mavi-live-status" role="status" aria-live="polite">Verificando disponibilidade…</p>
      <p class="mavi-live-metrics" aria-label="Diagnóstico de streaming" aria-live="off">Streaming em tempo real · métricas aparecerão na chamada</p>
      <div class="mavi-live-transcript" aria-live="off" aria-label="Transcrição da conversa"></div>
      <small class="mavi-live-footer">Microfone e alto-falante funcionam juntos. Para evitar eco, prefira fones de ouvido. Rotas não são alteradas automaticamente.</small>
    </section>`;
  document.body.appendChild(root);

  const el = sel => root.querySelector(sel);
  const launch = el('.mavi-live-launch'), panel = el('.mavi-live-panel');
  const startBtn = el('.mavi-live-start'), stopBtn = el('.mavi-live-stop');
  const muteBtn = el('.mavi-live-mute'), statusEl = el('.mavi-live-status');
  const transcript = el('.mavi-live-transcript');
  const metricsEl = el('.mavi-live-metrics');
  const UPSTREAM_BACKPRESSURE_BYTES = 48000;
  const PLAYBACK_START_BUFFER_S = 0.055;
  const PLAYBACK_MAX_QUEUE_S = 1.25;
  let liveMetrics = { sent:0, dropped:0, received:0, interruptions:0, queuedMs:0, setupMs:null, firstAudioMs:null };
  let sessionRequestStartedAt = 0, lastUserTranscriptionAt = 0;
  function metricsLabel() {
    const ms = v => v == null ? '—' : Math.round(v) + 'ms';
    metricsEl.textContent = '↑ 20ms · ' + liveMetrics.sent + ' pacotes | ↓ ' +
      liveMetrics.received + ' blocos | fila ' + ms(liveMetrics.queuedMs) +
      ' | conexão ' + ms(liveMetrics.setupMs) + ' | resposta aprox. ' +
      ms(liveMetrics.firstAudioMs) + ' | descartes ' + liveMetrics.dropped +
      ' | interrupções ' + liveMetrics.interruptions;
  }
  const modelEl = el('.mavi-live-model'), voiceEl = el('.mavi-live-voice');
  let socket = null, stream = null, context = null, source = null, worklet = null, silent = null;
  let muted = false, starting = false, closing = false, nextPlayAt = 0;
  const playing = new Set();
  let firstAudioRecorded = false;

  function status(label) { statusEl.textContent = label; }
  function addLine(who, text) {
    if (!text || typeof text !== 'string') return;
    const p = document.createElement('p');
    const name = document.createElement('b');
    name.textContent = who + ': ';
    p.append(name, document.createTextNode(text.slice(0, 900)));
    transcript.appendChild(p);
    while (transcript.childElementCount > 14) transcript.firstElementChild.remove();
    transcript.scrollTop = transcript.scrollHeight;
  }
  function controls(online) {
    startBtn.disabled = online || starting;
    stopBtn.disabled = !online && !starting;
    muteBtn.disabled = !online;
    modelEl.disabled = online || starting;
    voiceEl.disabled = online || starting;
  }
  function stopAudio() {
    for (const node of playing) {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    }
    playing.clear();
    nextPlayAt = 0;
    liveMetrics.queuedMs = 0;
    metricsLabel();
  }
  function playback(base64) {
    if (!context || context.state === 'closed' || !base64) return;
    let raw;
    try { raw = atob(base64); } catch (_) { return; }
    const samples = Math.floor(raw.length / 2);
    if (!samples || samples > 240000) return;
    const audio = context.createBuffer(1, samples, 24000);
    const pcm = audio.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      const lo = raw.charCodeAt(i * 2), hi = raw.charCodeAt(i * 2 + 1);
      let s = (hi << 8) | lo;
      if (s & 0x8000) s -= 65536;
      pcm[i] = s / 32768;
    }
    // Never let stale downlink speech pile up for multiple seconds.
    // Uplink stays independent while outgoing audio is queued.
    if (nextPlayAt > context.currentTime + PLAYBACK_MAX_QUEUE_S) {
      liveMetrics.dropped++;
      metricsLabel();
      return;
    }
    const node = context.createBufferSource();
    node.buffer = audio;
    node.connect(context.destination);
    node.onended = () => {
      playing.delete(node);
      try { node.disconnect(); } catch (_) {}
    };
    playing.add(node);
    nextPlayAt = Math.max(nextPlayAt, context.currentTime + PLAYBACK_START_BUFFER_S);
    node.start(nextPlayAt);
    nextPlayAt += audio.duration;
    liveMetrics.received++;
    liveMetrics.queuedMs = Math.round(Math.max(0, nextPlayAt - context.currentTime) * 1000);
    if (lastUserTranscriptionAt && liveMetrics.firstAudioMs === null) {
      liveMetrics.firstAudioMs = performance.now() - lastUserTranscriptionAt;
    }
    metricsLabel();
    if (!firstAudioRecorded) {
      firstAudioRecorded = true;
      status('MAVI respondendo por voz');
    }
  }
  function send(obj) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(obj));
    return true;
  }
  function mapContext() {
    const route = document.getElementById('routeState');
    const routeVisible = Boolean(route && getComputedStyle(route).display !== 'none');
    return {
      environment: 'VANO Maps V2 · laboratório admin',
      navigation_active: ['body-nav', 'is-navigating', 'navigating', 'navigation-active']
        .some(c => document.body.classList.contains(c)),
      route_preview_visible: routeVisible,
      destination_search: String(document.getElementById('destinationInput')?.value || '').slice(0, 120),
      live_traffic_available_to_model: false,
      can_modify_route: false
    };
  }
  function onToolCall(call) {
    if (!Array.isArray(call.functionCalls)) return;
    const functionResponses = call.functionCalls.map(fc => ({
      name: fc.name,
      id: fc.id,
      response: fc.name === 'get_vano_map_context'
        ? { result: mapContext() }
        : { error: 'Função não autorizada neste laboratório.' }
    }));
    if (functionResponses.length) send({toolResponse: {functionResponses}});
  }
  async function handleMessage(event) {
    let message;
    try {
      const text = typeof event.data === 'string' ? event.data : await event.data.text();
      message = JSON.parse(text);
    } catch (_) { status('Resposta inesperada do serviço'); return; }
    if (message.setupComplete) {
      status('Conectado · pode falar com a MAVI');
      liveMetrics.setupMs = performance.now() - sessionRequestStartedAt;
      metricsLabel();
      await startCapture();
    }
    if (message.toolCall) onToolCall(message.toolCall);
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      stopAudio();
      liveMetrics.interruptions++;
      liveMetrics.firstAudioMs = null;
      lastUserTranscriptionAt = performance.now();
      metricsLabel();
      status('Interrompida · ouvindo você…');
    }
    if (content.inputTranscription?.text) {
      addLine('Você', content.inputTranscription.text);
      lastUserTranscriptionAt = performance.now();
      liveMetrics.firstAudioMs = null;
    }
    if (content.outputTranscription?.text) addLine('MAVI', content.outputTranscription.text);
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/')) {
        playback(part.inlineData.data);
      }
    }
    if (content.turnComplete) status('Ouvindo…');
  }
  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let result = '';
    for (let i = 0; i < bytes.length; i++) result += String.fromCharCode(bytes[i]);
    return btoa(result);
  }
  async function startCapture() {
    if (!context || !stream || socket?.readyState !== WebSocket.OPEN) return;
    await context.audioWorklet.addModule('/static/vano-gemini-pcm-worklet.js?v=20261030');
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, 'vano-gemini-pcm');
    silent = context.createGain();
    silent.gain.value = 0;
    worklet.port.onmessage = event => {
      if (muted || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 250000) return;
      send({realtimeInput: {audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: bytesToBase64(event.data)
      }}});
    };
    source.connect(worklet);
    worklet.connect(silent);
    silent.connect(context.destination);
    status('Ouvindo…');
  }
  async function stopSession() {
    if (closing) return;
    closing = true;
    stopAudio();
    try { socket?.close(1000, 'VANO V2 test ended'); } catch (_) {}
    socket = null;
    try { worklet?.disconnect(); source?.disconnect(); silent?.disconnect(); } catch (_) {}
    worklet = null; source = null; silent = null;
    try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    stream = null;
    try { if (context && context.state !== 'closed') await context.close(); } catch (_) {}
    context = null;
    nextPlayAt = 0; muted = false; starting = false;
    firstAudioRecorded = false;
    muteBtn.textContent = 'Silenciar';
    controls(false);
    status('Conversa encerrada');
    closing = false;
  }
  async function startSession() {
    if (starting || socket) return;
    starting = true; closing = false; controls(false); status('Solicitando microfone…');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
        throw new Error('Navegador sem suporte a áudio em tempo real.');
      }
      stream = await navigator.mediaDevices.getUserMedia({audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        channelCount: 1
      }});
      context = new AudioContext({latencyHint: 'interactive'});
      await context.resume();
      status('Autenticando sessão temporária…');
      const csrf = window.VANO_BOOT?.csrf || '';
      const response = await fetch('/api/admin/gemini-live/session', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
        body: JSON.stringify({model: modelEl.value})
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.token) {
        throw new Error(response.status === 503
          ? 'Ative a integração no Render.'
          : 'Não foi possível criar sessão (HTTP ' + response.status + ').');
      }
      status('Conectando ao Gemini Live…');
      socket = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(payload.token));
      socket.addEventListener('open', () => {
        const systemText = 'Você é MAVI, a assistente do VANO Maps, em um laboratório privado de voz no mapa V2. Fale sempre em português brasileiro, com naturalidade, sem respostas longas. Você pode conversar continuamente e aceitar interrupções. Para saber o que está no mapa, use get_vano_map_context. Não invente GPS, trânsito, ETA, incidentes ou rotas. Não altere a rota, não inicie navegação, não envie denúncias ou SOS. Quando pedirem mudança de rota, explique que este laboratório ainda precisa da confirmação na interface. Respeite a segurança na condução: não estimule a interação com a tela enquanto dirige.';
        send({setup: {
          model: 'models/' + payload.model,
          responseModalities: ['AUDIO'],
          systemInstruction: {parts: [{text: systemText}]},
          speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: voiceEl.value}}},
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {automaticActivityDetection: {}},
          tools: [{functionDeclarations: [{
            name: 'get_vano_map_context',
            description: 'Lê apenas o estado visível do mapa VANO V2, sem alterar navegação ou acessar dados externos.',
            parameters: {type: 'OBJECT', properties: {}}
          }]}]
        }});
      });
      socket.addEventListener('message', event => {
        handleMessage(event).catch(() => status('Falha ao processar áudio'));
      });
      socket.addEventListener('error', () => status('Falha na conexão Gemini Live'));
      socket.addEventListener('close', () => {
        if (!closing) stopSession().catch(() => {});
      });
      starting = false;
      controls(true);
    } catch (err) {
      await stopSession();
      status(err?.message || 'Não foi possível iniciar a conversa.');
    }
  }

  launch.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    launch.setAttribute('aria-expanded', String(!panel.hidden));
  });
  el('.mavi-live-close').addEventListener('click', () => {
    panel.hidden = true;
    launch.setAttribute('aria-expanded', 'false');
  });
  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? 'Reativar' : 'Silenciar';
    if (muted) send({realtimeInput: {audioStreamEnd: true}});
    status(muted ? 'Microfone silenciado' : 'Ouvindo…');
  });
  window.addEventListener('pagehide', () => { stopSession().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && socket) stopSession().catch(() => {});
  });

  fetch('/api/admin/gemini-live/capabilities', {credentials: 'same-origin'})
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      startBtn.disabled = !data.enabled;
      status(data.enabled ? 'Disponível · iniciar conversa para testar'
        : 'Desativado · configure GEMINI_API_KEY e VANO_GEMINI_LIVE_V2_ENABLED=1');
    })
    .catch(() => {
      startBtn.disabled = true;
      status('Não foi possível verificar disponibilidade.');
    });
})();
