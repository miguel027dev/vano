/* A server-anchored, shared countdown. Reopening never restarts eight days. */
(() => {
  'use strict';
  const timer = document.getElementById('androidCountdown');
  if (!timer) return;
  const deadline = Date.parse(timer.dataset.releaseAt);
  const serverNow = Number(timer.dataset.serverNow);
  const started = performance.now();
  const status = document.getElementById('androidStatus');
  const parts = [...timer.querySelectorAll('[data-countdown-part]')];
  let interval;
  if (!Number.isFinite(deadline) || !Number.isFinite(serverNow)) {
    timer.hidden = true;
    return;
  }
  function render() {
    // Use a monotonic clock: an incorrect device clock cannot move the launch.
    const remaining = Math.max(0, Math.ceil((deadline - serverNow - (performance.now() - started)) / 1000));
    const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    parts.forEach((node, index) => {
      const value = String(values[index]).padStart(2, '0');
      if (node.textContent !== value) node.textContent = value;
    });
    if (remaining === 0) {
      timer.hidden = true;
      if (status) status.textContent = 'A previsão chegou. Aguarde a confirmação de disponibilidade.';
      clearInterval(interval);
    }
    return remaining;
  }
  function resume() {
    clearInterval(interval);
    if (!document.hidden && render() > 0) interval = setInterval(render, 1000);
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', () => clearInterval(interval));
  resume();
})();
