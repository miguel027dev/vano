/* Readable VANO source; runtime eval/encoded wrapper removed. */
(() => {
  'use strict';

  const MODE_KEY = 'vano.theme.mode.v200';
  const BLACK_META = '#0A0A0B';
  const LIGHT_META = '#FFF8F2';
  const LEGACY_KEYS = ['vano.theme.mode.v60','vano.theme.mode.v57','vano.theme.mode.v56','vano.theme.v55','vano.theme.mode'];
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  const normalize = (value) => String(value || '').toLowerCase() === 'black' ? 'black' : 'light';

  function storedMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved) return normalize(saved);
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return normalize(legacy);
      }
    } catch (_) {}
    return 'light';
  }

  function updateControls(mode) {
    document.querySelectorAll('[data-vano-theme-option]').forEach((button) => {
      const active = normalize(button.dataset.vanoThemeOption) === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    document.querySelectorAll('[data-vano-theme-label]').forEach((node) => {
      node.textContent = mode === 'black' ? 'Usar White' : 'Usar Black';
    });

    document.querySelectorAll('[data-vano-theme-toggle]').forEach((button) => {
      const black = mode === 'black';
      button.classList.toggle('is-black', black);
      button.setAttribute('aria-pressed', black ? 'true' : 'false');
      button.setAttribute('aria-label', black ? 'Ativar modo White' : 'Ativar modo Black');
      button.setAttribute('title', black ? 'Usar mapa claro' : 'Usar mapa Black');
    });

    document.querySelectorAll('[data-theme-state]').forEach((node) => {
      node.textContent = mode === 'black' ? 'Black ativado' : 'White padrão';
    });
    document.querySelectorAll('[data-theme-timezone]').forEach((node) => {
      node.textContent = 'Preferência salva neste dispositivo';
    });
  }

  function apply(mode, { persist = false, reason = 'manual' } = {}) {
    mode = normalize(mode);
    const previous = root.dataset.vanoTheme;
    root.dataset.vanoThemeMode = mode;
    root.dataset.vanoTheme = mode;
    root.style.colorScheme = mode === 'black' ? 'dark' : 'light';
    if (document.body) {
      document.body.dataset.vanoThemeMode = mode;
      document.body.dataset.vanoTheme = mode;
    }
    if (meta) meta.setAttribute('content', mode === 'black' ? BLACK_META : LIGHT_META);

    if (persist) {
      try {
        localStorage.setItem(MODE_KEY, mode);
        // Clear automatic legacy behavior so night time cannot unexpectedly change White to Black.
        for (const key of LEGACY_KEYS) localStorage.removeItem(key);
      } catch (_) {}
    }

    updateControls(mode);
    if (previous !== mode || reason === 'manual') {
      window.dispatchEvent(new CustomEvent('vano:themechange', {
        detail: { theme: mode, mode, automatic: false, reason },
      }));
    }
    return mode;
  }

  function setMode(mode) { return apply(mode, { persist: true, reason: 'manual' }); }
  function refresh(reason = 'refresh') { return apply(storedMode(), { persist: false, reason }); }

  window.VANOTheme = window.VANOTheme = {
    key: MODE_KEY,
    getMode: storedMode,
    get: () => root.dataset.vanoTheme || storedMode(),
    setMode,
    set: setMode,
    refresh,
    resolve: normalize,
  };

  apply(storedMode(), { persist: false, reason: 'boot' });

  document.addEventListener('click', (event) => {
    const option = event.target.closest?.('[data-vano-theme-option]');
    if (option) {
      event.preventDefault();
      setMode(option.dataset.vanoThemeOption);
      return;
    }
    const toggle = event.target.closest?.('[data-vano-theme-toggle]');
    if (toggle) {
      event.preventDefault();
      setMode(root.dataset.vanoTheme === 'black' ? 'light' : 'black');
    }
  });

  document.addEventListener('DOMContentLoaded', () => refresh('dom-ready'));
  window.addEventListener('storage', (event) => {
    if (event.key === MODE_KEY || LEGACY_KEYS.includes(event.key)) refresh('storage');
  });
})();
