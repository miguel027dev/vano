/* Embedded VANO maps can be resized by a host screen without a window resize.
   Reenable Mapbox gestures and keep its canvas dimensions in sync. */
(() => {
  'use strict';
  let observer = null;
  let observedContainer = null;

  function restore() {
    const map = window.__VANO_MAP_BRIDGE?.getMap?.();
    if (!map) return false;
    for (const gesture of ['dragPan', 'touchZoomRotate', 'scrollZoom', 'doubleClickZoom']) {
      try { map[gesture]?.enable?.(); } catch (_) {}
    }
    try {
      const canvas = map.getCanvas?.();
      if (canvas) {
        canvas.style.touchAction = 'none';
        canvas.style.pointerEvents = 'auto';
      }
      const container = map.getContainer?.();
      if (container && typeof ResizeObserver === 'function' && observedContainer !== container) {
        observer?.disconnect();
        observedContainer = container;
        observer = new ResizeObserver(() => {
          requestAnimationFrame(() => { try { map.resize?.(); } catch (_) {} });
        });
        observer.observe(container);
      }
      map.resize?.();
    } catch (_) {}
    return true;
  }

  function initialize() {
    if (restore()) return;
    let attempts = 0;
    const poll = setInterval(() => {
      if (restore() || ++attempts >= 24) clearInterval(poll);
    }, 250);
  }

  window.addEventListener('vano:map-ready', initialize);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
  window.addEventListener('pageshow', restore);
  window.addEventListener('orientationchange', () => setTimeout(restore, 120));
  window.addEventListener('resize', restore, { passive: true });
})();
