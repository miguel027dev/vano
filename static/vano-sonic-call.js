/* Admin-only MAVI call prototype. No GPS, route or navigation actions. */
(() => {
  'use strict';
  if (location.pathname.toLowerCase() !== '/v2') return;
  const SpeechApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition, listening = false, connecting = false, generation = 0;
  let controller = null, audioContext = null, playhead = 0;
  let activeSources = new Set(), streamFinished = true, assistantText = '';
  const history = [];
  const normalize = value => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function button(label, cls, action) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.className = cls;
    el.addEventListener('click', action);
    return el;
  }
  let launch, panel, status, transcript, startStop, muteButton;
  let muted = false;

  function setStatus(value) {
    if (status) status.textContent = value;
  }
  function releaseSources() {
    activeSources.forEach(source => { try { source.stop(); } catch (_) {} });
    activeSources.clear();
    playhead = audioContext ? audioContext.currentTime : 0;
  }
  function interrupt() {
    generation++;
    controller?.abort();
    controller = null;
    releaseSources();
    streamFinished = true;
  }
  function echoOfAssistant(value) {
    const spoken = normalize(value);
    const assistant = normalize(assistantText);
    return spoken.length > 8 && assistant.length > 0
      && (assistant.includes(spoken) || (spoken.length > 18 && spoken.includes(assistant)));
  }
  function pcmToAudio(base64, epoch) {
    if (epoch !== generation || muted || !audioContext) return;
    const binary = atob(base64);
    const samples = Math.floor(binary.length / 2);
    if (!samples) return;
    const buffer = audioContext.createBuffer(1, samples, 24000);
    const floats = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      let value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      if (value & 0x8000) value -= 0x10000;
      floats[i] = value / 32768;
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      activeSources.delete(source);
      source.disconnect();
      if (streamFinished && !activeSources.size && listening) setStatus('Ouvindo você');
    };
    activeSources.add(source);
    const start = Math.max(audioContext.currentTime + 0.025, playhead);
    source.start(start);
    playhead = start + buffer.duration;
    setStatus('MAVI falando · pode interromper');
  }
  async function performTurn(raw) {
    const text = raw.trim().slice(0, 700);
    if (!text || echoOfAssistant(text) || !listening) return;
    interrupt();
    const epoch = generation;
    assistantText = '';
    history.push({ role: 'user', content: text });
    if (history.length > 8) history.splice(0, history.length - 8);
    transcript.textContent = 'Você: ' + text;
    setStatus('MAVI preparando resposta...');
    streamFinished = false;
    const abort = new AbortController();
    controller = abort;
    let buffer = '';
    try {
      const response = await fetch('/api/admin/sonic-call/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.VANO?.csrf || ''
        },
        body: JSON.stringify({ text, history: history.slice(0, -1) }),
        signal: abort.signal
      });
      if (!response.ok || !response.body) throw new Error('voice_service_unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const handleLine = line => {
        if (epoch !== generation || !line.trim()) return;
        const evt = JSON.parse(line);
        switch (evt.type) {
          case 'text':
            assistantText += (assistantText ? ' ' : '') + evt.text;
            transcript.textContent = 'MAVI: ' + assistantText;
            break;
          case 'audio':
            pcmToAudio(evt.data, epoch);
            break;
          case 'error':
            setStatus('A conexão de voz falhou. Tente novamente.');
            break;
          case 'complete':
            if (assistantText) {
              history.push({ role: 'assistant', content: assistantText.slice(0, 700) });
              if (history.length > 8) history.splice(0, history.length - 8);
            }
            break;
        }
      };
      while (epoch === generation) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 1);
          handleLine(line);
        }
        if (buffer.length > 1_000_000) throw new Error('stream_limit');
      }
      if (buffer.trim() && epoch === generation) handleLine(buffer);
    } catch (err) {
      if (epoch === generation && err.name !== 'AbortError') {
        setStatus('A MAVI não conseguiu responder. Verifique as APIs.');
      }
    } finally {
      if (epoch === generation) {
        streamFinished = true;
        controller = null;
        if (!activeSources.size && listening) setStatus('Ouvindo você');
      }
    }
  }
  function startRecognition() {
    if (!listening || !recognition || connecting) return;
    try {
      connecting = true;
      recognition.start();
    } catch (_) {
      connecting = false;
    }
  }
  async function startCall() {
    if (!SpeechApi || !(window.AudioContext || window.webkitAudioContext)) {
      setStatus('Este navegador não oferece reconhecimento de fala contínuo.');
      return;
    }
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      recognition = new SpeechApi();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => { connecting = false; setStatus('Ouvindo você'); };
      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const phrase = (result[0]?.transcript || '').trim();
          if (!phrase || echoOfAssistant(phrase)) continue;
          if (!result.isFinal) {
            if (phrase.split(/\s+/).length >= 3 && (controller || activeSources.size)) {
              interrupt(); // Barge-in: stop speaking while the person is still talking.
              setStatus('Estou ouvindo...');
            }
          } else {
            void performTurn(phrase);
          }
        }
      };
      recognition.onerror = event => {
        connecting = false;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopCall();
          setStatus('Permissão do microfone negada.');
        } else if (listening && event.error !== 'no-speech' && event.error !== 'aborted') {
          setStatus('Microfone indisponível (' + event.error + ').');
        }
      };
      recognition.onend = () => {
        connecting = false;
        if (listening) window.setTimeout(startRecognition, 300);
      };
      listening = true;
      startStop.textContent = 'Encerrar ligação';
      startRecognition();
    } catch (_) {
      setStatus('Não foi possível iniciar o áudio.');
    }
  }
  function stopCall() {
    listening = false;
    interrupt();
    connecting = false;
    try { recognition?.stop(); } catch (_) {}
    recognition = null;
    if (startStop) startStop.textContent = 'Iniciar ligação';
    setStatus('Ligação encerrada');
  }
  async function init() {
    try {
      const response = await fetch('/api/admin/sonic-call/capabilities', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok || !(await response.json()).available) return;
    } catch (_) { return; }
    launch = button('MAVI · Ligar', 'mavi-call-launch', () => {
      panel.hidden = !panel.hidden;
      launch.setAttribute('aria-expanded', String(!panel.hidden));
      if (panel.hidden) stopCall();
    });
    launch.setAttribute('aria-expanded', 'false');
    launch.setAttribute('aria-controls', 'maviSonicPanel');
    panel = document.createElement('section');
    panel.id = 'maviSonicPanel';
    panel.className = 'mavi-call-panel';
    panel.setAttribute('aria-label', 'Chamada de voz com a MAVI');
    panel.hidden = true;
    const title = document.createElement('strong');
    title.textContent = 'MAVI · Conversa ao vivo';
    status = document.createElement('p');
    status.className = 'mavi-call-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Microfone desligado';
    transcript = document.createElement('p');
    transcript.className = 'mavi-call-transcript';
    transcript.setAttribute('aria-live', 'polite');
    transcript.textContent = 'Você pode conversar naturalmente e interromper a resposta.';
    startStop = button('Iniciar ligação', 'mavi-call-primary', () => {
      if (listening) stopCall(); else void startCall();
    });
    muteButton = button('Silenciar MAVI', 'mavi-call-secondary', () => {
      muted = !muted;
      if (muted) releaseSources();
      muteButton.textContent = muted ? 'Ativar som' : 'Silenciar MAVI';
    });
    const hint = document.createElement('small');
    hint.textContent = 'Teste administrativo · use fones para evitar eco · não manuseie dirigindo.';
    const controls = document.createElement('div');
    controls.className = 'mavi-call-controls';
    controls.append(startStop, muteButton);
    panel.append(title, status, transcript, controls, hint);
    document.body.append(launch, panel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else void init();
})();
