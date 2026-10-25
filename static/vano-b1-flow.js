/* B1: progressive route selection for the standard user map.
   The original map engine owns routing, GPS, navigation and map styles. */
(() => {
  'use strict';
  if (window.VANO_B1_FLOW !== true || window.__VANO_NATIVE_SCREEN_HANDOFF) return;

  let pendingCamera = false;
  let cameraToken = 0;
  let mapWithGestureListener = null;
  const $ = id => document.getElementById(id);

  function updateArrival(route) {
    const target = $('b1Arrival');
    const minutes = Number(route?.duration_min);
    if (!target || !Number.isFinite(minutes) || minutes < 0) {
      if (target) target.textContent = '';
      return;
    }
    const arrival = new Date(Date.now() + Math.round(minutes * 60000));
    target.textContent = 'Chegada ' + arrival.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  }

  function syncButton() {
    const btn = $('startTripBtn');
    if (!btn || btn.classList.contains('is-starting')) return;
    const label = btn.querySelector('.start-trip-copy b');
    if (label && label.textContent !== 'Iniciar navegação') label.textContent = 'Iniciar navegação';
    const description = btn.querySelector('.start-trip-copy small');
    if (description) description.hidden = true;
    btn.setAttribute('aria-label', 'Iniciar navegação');
  }

  function startCameraDescent(map, route, origin, reducedMotion) {
    if (!pendingCamera) return;
    pendingCamera = false;
    const coordinates = route?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !map) return;

    const token = ++cameraToken;
    if (mapWithGestureListener !== map) {
      mapWithGestureListener = map;
      map.on('dragstart', () => { cameraToken++; });
      map.on('rotatestart', () => { cameraToken++; });
    }
    const first = coordinates[0];
    const next = coordinates.find(point => Math.hypot(point[0] - first[0], point[1] - first[1]) > .00002) || coordinates[1];
    const lat = Number(first[1]) * Math.PI / 180;
    const dx = (next[0] - first[0]) * Math.cos(lat);
    const dy = next[1] - first[1];
    const bearing = Number.isFinite(dx + dy) && Math.hypot(dx,dy) > 0 ? Math.atan2(dx,dy) * 180 / Math.PI : map.getBearing();
    const start = origin && Number.isFinite(+origin.lat) && Number.isFinite(+origin.lon)
      ? [+origin.lon, +origin.lat] : first;

    // The overview is drawn by the existing engine. Descend only after it has
    // reached its map frame; never fight an active navigation camera.
    let completed = false;
    let fallbackTimer = null;
    const descend = () => {
      if (completed) return;
      completed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      map.off('moveend', descend);
      if (token !== cameraToken || document.body.classList.contains('body-nav')) return;
      const vh = window.visualViewport?.height || window.innerHeight;
      const vw = window.visualViewport?.width || window.innerWidth;
      const padding = {
        top: Math.round(Math.min(160, vh * .19)),
        bottom: Math.round(Math.min(290, vh * .33)),
        left: Math.round(Math.max(20, vw * .05)),
        right: Math.round(Math.max(20, vw * .05))
      };
      try {
        const camera = {center:start,zoom:16.35,pitch:34,bearing,padding,retainPadding:false,
          duration:reducedMotion ? 0 : 1050,essential:!reducedMotion,
          easing:t => 1 - Math.pow(1-t,3)};
        if (reducedMotion) map.jumpTo(camera);
        else map.easeTo(camera);
      } catch (error) {
        console.debug('[VANO B1:camera]', error);
      }
    };
    if (reducedMotion) descend();
    else {
      map.once('moveend', descend);
      // If fitBounds made no movement, the browser will not emit moveend.
      fallbackTimer = setTimeout(descend, 1000);
    }
  }

  window.__vanoB1Flow = {
    onRouteDrawn: ({map,route,origin,reducedMotion}) => {
      updateArrival(route);
      syncButton();
      startCameraDescent(map,route,origin,!!reducedMotion);
    }
  };

  function setup() {
    const confirm = $('destinationConfirm');
    const routeState = $('routeState');
    const modeSegment = $('routeModeSegment');
    const routeTime = routeState?.querySelector('.route-time');
    const action = $('startTripBtn');
    if (!confirm || !routeState || !modeSegment || !routeTime || !action || $('b1RoutePreview')) return;
    document.body.classList.add('vano-b1');

    const transport = document.createElement('div');
    transport.id = 'b1Transport';
    transport.innerHTML = `
      <div class="b1-handle" aria-hidden="true"></div>
      <div class="b1-transport-head">
        <div><h2>Como você vai?</h2><p>Escolha seu meio de transporte</p></div>
        <button type="button" class="b1-edit-destination" aria-label="Alterar destino">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>
      <div class="b1-transport-options" role="group" aria-label="Meio de transporte">
        <button type="button" data-b1-transport="driving">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-1-7a3 3 0 0 0-3-2H9a3 3 0 0 0-3 2l-1 7Z"/><path d="M4 13h16M7 17v2m10-2v2"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/></svg>
          <span>Carro</span>
        </button>
        <button type="button" data-b1-transport="motorcycle">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m8 17 3-7 3 7h2l2-5h-5l-2-3H8m7 0h3"/></svg>
          <span>Moto</span>
        </button>
        <button type="button" data-b1-transport="walking">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="m10 21 2-6-3-4-3 3m3-3 3-4 4 3 2 1m-6 4 5 6"/></svg>
          <span>A pé</span>
        </button>
      </div>`;
    confirm.append(transport);
    transport.querySelector('.b1-edit-destination').addEventListener('click', () => $('editDestinationBtn')?.click());

    transport.querySelectorAll('[data-b1-transport]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const profile = button.dataset.b1Transport;
        const existing = routeState.querySelector('[data-profile="' + profile + '"]');
        const confirmButton = $('confirmDestinationBtn');
        if (!existing || !confirmButton) return;
        cameraToken++;
        pendingCamera = true;
        transport.querySelectorAll('[data-b1-transport]').forEach(item => {
          item.classList.toggle('selected',item === button);
          item.disabled = true;
        });
        // Use the existing routing controls, not a parallel routing request.
        existing.click();
        modeSegment.querySelector('[data-route-mode="fastest"]')?.click();
        confirmButton.click();
        window.setTimeout(() => {
          transport.querySelectorAll('[data-b1-transport]').forEach(item => { item.disabled = false; });
        }, 350);
      });
    });

    const preview = document.createElement('section');
    preview.id = 'b1RoutePreview';
    preview.setAttribute('aria-label','Prévia do trajeto');
    preview.innerHTML = `
      <div class="b1-handle" aria-hidden="true"></div>
      <div class="b1-route-head">
        <div><h2>Escolha sua prioridade</h2><p>Escolha como quer chegar</p></div>
      </div>
      <div id="b1PriorityHost"></div>
      <div class="b1-trip-summary">
        <div id="b1DurationHost"></div>
        <span id="b1Arrival"></span>
      </div>
      <div id="b1ActionHost"></div>`;
    routeState.prepend(preview);
    const fastest = modeSegment.querySelector('[data-route-mode="fastest"]');
    if (fastest) modeSegment.prepend(fastest);
    const safe = modeSegment.querySelector('[data-route-mode="safest"]');
    fastest?.querySelector('.route-option-copy b') && (fastest.querySelector('.route-option-copy b').textContent = 'Mais rápida');
    safe?.querySelector('.route-option-copy b') && (safe.querySelector('.route-option-copy b').textContent = 'Mais segura');
    $('b1PriorityHost').append(modeSegment);
    $('b1DurationHost').append(routeTime);
    $('b1ActionHost').append(action);
    syncButton();
    new MutationObserver(syncButton).observe(action, {subtree:true,childList:true});

    // When users cancel/reselect a destination, an old camera transition must
    // never resume over the new state.
    new MutationObserver(() => {
      if (confirm.classList.contains('show')) {
        cameraToken++;
        pendingCamera = false;
      }
    }).observe(confirm,{attributes:true,attributeFilter:['class']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
