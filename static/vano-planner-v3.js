/* VANO Maps V3 planner experience — additive UI, retains the current routing/search engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const field = $('destinationInput');
  const results = $('searchResults');
  const searchRow = document.querySelector('#welcomeState .planner-search-row') ||
    document.querySelector('#v2Dock .planner-search-row');
  const routeState = $('routeState');
  if (!field || !results || !searchRow || !routeState) return;

  const originalParent = searchRow.parentNode;
  const originalSibling = searchRow.nextSibling;
  const overlay = document.createElement('section');
  overlay.id = 'vanoSearchFullscreen';
  overlay.className = 'vano-search-fullscreen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'vanoSearchFullscreenTitle');
  overlay.hidden = true;
  overlay.innerHTML = [
    '<header class="vano-search-fullscreen-header">',
    ' <button type="button" class="vano-search-back" aria-label="Voltar ao mapa"><span aria-hidden="true">‹</span></button>',
    ' <div><small>VANO MAPS</small><h2 id="vanoSearchFullscreenTitle">Para onde vamos?</h2></div>',
    '</header>',
    '<div class="vano-search-field-slot"></div>',
    '<div class="vano-search-results-slot" aria-live="polite"></div>',
    '<div class="vano-search-empty"><span class="vano-search-empty-icon" aria-hidden="true">⌕</span>',
    ' <b>Encontre seu próximo destino</b><p>Busque por endereço, café, comércio ou ponto de interesse.</p></div>',
    '<footer class="vano-search-fullscreen-foot">Resultados e endereços fornecidos pelas fontes de busca do VANO.</footer>'
  ].join('');
  document.body.appendChild(overlay);
  const fieldSlot = overlay.querySelector('.vano-search-field-slot');
  const resultSlot = overlay.querySelector('.vano-search-results-slot');
  const backButton = overlay.querySelector('.vano-search-back');
  const searchCard = searchRow.querySelector('.planner-search-card');
  const defaultCardBackground = searchCard?.style.getPropertyValue('background') || '';
  const defaultCardPriority = searchCard?.style.getPropertyPriority('background') || '';
  let searching = false;
  let wasFocused = false;
  let closeQueued = false;

  function syncSearchContent() {
    const hasResults = results.classList.contains('show') && results.children.length > 0;
    overlay.classList.toggle('has-search-results', hasResults);
  }
  function openSearch(focus = true) {
    if (searching) return;
    if ($('activeNav')?.classList.contains('show')) return;
    searching = true;
    wasFocused = document.activeElement === field;
    overlay.hidden = false;
    document.body.classList.add('vano-search-fullscreen-active');
    fieldSlot.appendChild(searchRow);
    searchCard?.style.setProperty('background','#242831','important');
    if (results.parentNode !== resultSlot) resultSlot.appendChild(results);
    syncSearchContent();
    if (focus) requestAnimationFrame(() => field.focus({preventScroll:true}));
  }
  function closeSearch({restoreFocus = false} = {}) {
    if (!searching) return;
    searching = false;
    document.body.classList.remove('vano-search-fullscreen-active');
    if (originalSibling?.parentNode === originalParent) originalParent.insertBefore(searchRow, originalSibling);
    else originalParent.appendChild(searchRow);
    searchRow.querySelector('.planner-search-card')?.appendChild(results);
    ['left','right','top','bottom','width','max-height'].forEach(k => results.style.removeProperty(k));
    results.classList.remove('search-results-portal');
    delete results.dataset.placement;
    overlay.hidden = true;
    if (defaultCardBackground)
      searchCard?.style.setProperty('background',defaultCardBackground,defaultCardPriority);
    else searchCard?.style.removeProperty('background');
    if (document.activeElement === field) field.blur();
    if (restoreFocus && !wasFocused) {
      const trigger = document.querySelector('#v2Dock input#destinationInput');
      if (trigger) trigger.focus({preventScroll:true});
    }
  }
  backButton.addEventListener('click', () => closeSearch());
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
    }
  });
  // Open before the native focus/keyboard sequence; the original input is not cloned.
  field.addEventListener('pointerdown', e => {
    if (!searching && (e.button === 0 || e.pointerType === 'touch')) {
      e.preventDefault();
      openSearch(true);
    }
  });
  field.addEventListener('focus', () => {
    if (!searching) {
      openSearch(false);
      requestAnimationFrame(() => field.focus({preventScroll:true}));
    }
  });
  results.addEventListener('click', e => {
    if (!e.target.closest('.search-item,.search-suggestion')) return;
    if (closeQueued) return;
    closeQueued = true;
    // Preserve the map core's own result handlers and destination confirmation.
    setTimeout(() => {
      closeQueued = false;
      closeSearch();
    }, 40);
  });
  new MutationObserver(syncSearchContent).observe(results, {
    attributes:true, attributeFilter:['class'], childList:true
  });
  window.addEventListener('pagehide', () => { if (searching) closeSearch(); }, {once:true});

  const modeRow = routeState.querySelector('.travel');
  if (!modeRow) return;
  const baseModes = ['driving','motorcycle','walking'];
  const availableButtons = baseModes.map(profile =>
    modeRow.querySelector('[data-profile="' + profile + '"]')).filter(Boolean);
  for (const button of availableButtons) {
    const profile = button.dataset.profile;
    const copy = button.querySelector('.route-option-copy');
    if (!copy) continue;
    let eta = copy.querySelector('[data-vano-eta]') || copy.querySelector('small');
    if (!eta) {
      eta = document.createElement('small');
      copy.appendChild(eta);
    }
    eta.dataset.vanoEta = profile;
    eta.textContent = 'Ver rota';
  }
  const publicButton = document.createElement('button');
  publicButton.type = 'button';
  publicButton.className = 'vano-public-mode';
  publicButton.dataset.vanoTransit = 'true';
  publicButton.setAttribute('aria-pressed', 'false');
  publicButton.innerHTML = '<span class="route-option-icon" aria-hidden="true">🚌</span>' +
    '<span class="route-option-copy"><b>Público</b><small data-vano-eta="transit">Consultar</small></span>';
  modeRow.appendChild(publicButton);
  const publicPanel = document.createElement('section');
  publicPanel.id = 'vanoTransitRoutes';
  publicPanel.className = 'vano-transit-routes';
  publicPanel.hidden = true;
  publicPanel.innerHTML = [
    '<div class="vano-transit-heading"><div><small>MOBILIDADE URBANA</small><h3>Transporte público</h3>',
    '<p>Ônibus, metrô e conexões disponíveis para sua viagem.</p></div></div>',
    '<div class="vano-transit-filters" role="group" aria-label="Ordenar itinerários">',
    '<button type="button" data-transit-sort="fastest" aria-pressed="true">Mais rápida</button>',
    '<button type="button" data-transit-sort="walking" aria-pressed="false">Menos caminhada</button>',
    '<button type="button" data-transit-sort="transfers" aria-pressed="false">Menos baldeações</button>',
    '</div>',
    '<div class="vano-transit-list" aria-live="polite" role="status"></div>',
    '<p class="vano-transit-foot">A previsão total deve incluir caminhada, espera e baldeações. Confirme os horários com a operadora.</p>'
  ].join('');
  modeRow.closest('.vano-route-mode-row')?.insertAdjacentElement('afterend', publicPanel);
  const publicList = publicPanel.querySelector('.vano-transit-list');
  const sortButtons = [...publicPanel.querySelectorAll('[data-transit-sort]')];
  const etaElements = new Map([...routeState.querySelectorAll('[data-vano-eta]')]
    .map(el => [el.dataset.vanoEta, el]));
  let transitActive = false;
  let transitAbort = null;
  let transitSort = 'fastest';
  let transitRoutes = [];
  const hiddenRouteLayers = new Map();
  const previewLayerIds = [
    'route-shadow','route-alternatives','route-selected-glow','route-selected',
    'route-progress','route-selected-flow','traffic-route-core','traffic-route-glow'
  ];
  function setRoutePreviewVisibility(visible) {
    const map = window.__VANO_MAP_BRIDGE?.getMap?.();
    if (!map?.getLayer) return;
    for (const id of previewLayerIds) {
      if (!map.getLayer(id)) continue;
      try {
        if (!visible) {
          if (!hiddenRouteLayers.has(id))
            hiddenRouteLayers.set(id,map.getLayoutProperty(id,'visibility') || 'visible');
          map.setLayoutProperty(id,'visibility','none');
        } else if (hiddenRouteLayers.has(id)) {
          map.setLayoutProperty(id,'visibility',hiddenRouteLayers.get(id));
          hiddenRouteLayers.delete(id);
        }
      } catch (_) {}
    }
  }
  window.addEventListener('vano:themechange',() => {
    if (transitActive) setTimeout(() => setRoutePreviewVisibility(false),400);
  });
  let estimatesKey = '';
  let estimateAbort = null;
  let estimateBusy = false;
  const estimateCache = new Map();
  let lastActiveEta = '';
  const fmt = seconds => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return minutes >= 60
      ? Math.floor(minutes / 60) + 'h ' + (minutes % 60 ? (minutes % 60) + 'min' : '')
      : minutes + ' min';
  };
  function setEta(mode, text) {
    const element = etaElements.get(mode);
    if (element && element.textContent !== text) element.textContent = text;
  }
  function plannerSnapshot() {
    return window.__VANO_MAP_BRIDGE?.getPlannerSnapshot?.() || null;
  }
  function pointKey(point) {
    return point && Number.isFinite(+point.lat) && Number.isFinite(+point.lon)
      ? (+point.lat).toFixed(5) + ',' + (+point.lon).toFixed(5) : '';
  }
  function sourceKey(snapshot) {
    if (!snapshot?.origin || !snapshot?.destination) return '';
    return pointKey(snapshot.origin) + '>' + pointKey(snapshot.destination);
  }
  function routeDuration(route) {
    const seconds = Number(route?.duration);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  function currentEta(snapshot) {
    const seconds = routeDuration(snapshot?.selectedRoute);
    if (baseModes.includes(snapshot?.profile) && seconds !== null && snapshot?.routeReady) {
      setEta(snapshot.profile, fmt(seconds));
      const key = sourceKey(snapshot);
      if (key) estimateCache.set(key + ':' + snapshot.profile, {duration:seconds, at:Date.now()});
    }
  }
  async function previewOtherModes(snapshot) {
    const key = sourceKey(snapshot);
    if (!key || estimateBusy || transitActive || !window.VANO_BOOT?.loggedIn ||
        document.visibilityState === 'hidden' || !$('routeState')?.offsetParent) return;
    const profiles = baseModes.filter(p => {
      if (p === snapshot.profile) return false;
      const cached = estimateCache.get(key + ':' + p);
      return !cached || Date.now() - cached.at > (cached.unavailable ? 45000 : 120000);
    });
    if (!profiles.length) return;
    estimateBusy = true;
    estimateAbort?.abort();
    const controller = new AbortController();
    estimateAbort = controller;
    try {
      for (const profile of profiles) {
        if (controller.signal.aborted || sourceKey(plannerSnapshot()) !== key) break;
        setEta(profile, 'Calculando…');
        const qs = new URLSearchParams({
          start_lat:String(snapshot.origin.lat),start_lon:String(snapshot.origin.lon),
          end_lat:String(snapshot.destination.lat),end_lon:String(snapshot.destination.lon),
          mode:'fastest',profile,prefetch:'1',
          local_hour:String(new Date().getHours())
        });
        const timeout = setTimeout(() => controller.abort(), 14000);
        try {
          const response = await fetch('/api/route?' + qs, {
            signal:controller.signal, credentials:'same-origin', headers:{Accept:'application/json'}
          });
          if (!response.ok) throw new Error('unavailable');
          const json = await response.json();
          const available = (json.routes || []).map(routeDuration).filter(x => x !== null);
          if (!available.length) throw new Error('no-routes');
          const duration = Math.min(...available);
          estimateCache.set(key + ':' + profile, {duration,at:Date.now()});
          if (sourceKey(plannerSnapshot()) === key) setEta(profile, fmt(duration));
        } catch (_) {
          if (!controller.signal.aborted && sourceKey(plannerSnapshot()) === key) {
            estimateCache.set(key + ':' + profile, {unavailable:true,at:Date.now()});
            setEta(profile, 'Indisponível');
          }
        } finally { clearTimeout(timeout); }
      }
    } finally { estimateBusy = false; }
  }
  function writeTransitMessage(title, subtitle) {
    publicList.replaceChildren();
    const card = document.createElement('div');
    card.className = 'vano-transit-empty-state';
    const heading = document.createElement('b');
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = subtitle;
    card.append(heading, copy);
    publicList.appendChild(card);
  }
  function numeric(v) { return Number.isFinite(+v) ? +v : Infinity; }
  function renderTransit() {
    if (!transitRoutes.length) {
      writeTransitMessage('Sem itinerários verificados',
        'Ainda não foi possível consultar ônibus e metrô para esta origem e destino.');
      return;
    }
    const list = [...transitRoutes].sort((a,b) => {
      const value = item => transitSort === 'walking' ? numeric(item.walking_seconds)
        : transitSort === 'transfers' ? numeric(item.transfers)
        : numeric(item.duration_seconds);
      return value(a) - value(b) || numeric(a.duration_seconds) - numeric(b.duration_seconds);
    });
    publicList.replaceChildren();
    for (const route of list) {
      const card = document.createElement('details');
      card.className = 'vano-transit-card';
      const heading = document.createElement('summary');
      const title = document.createElement('strong');
      title.textContent = String(route.label || 'Itinerário de transporte público');
      const duration = document.createElement('b');
      duration.textContent = Number.isFinite(+route.duration_seconds) && +route.duration_seconds > 0
        ? fmt(+route.duration_seconds) : 'Sem ETA';
      heading.append(title, duration);
      const information = document.createElement('p');
      const transfers = Number.isFinite(+route.transfers) ? +route.transfers : null;
      const walk = Number.isFinite(+route.walking_seconds) ? fmt(+route.walking_seconds) : null;
      information.textContent = [walk ? walk + ' caminhando' : '',
        transfers !== null ? transfers + ' baldeação(ões)' : ''].filter(Boolean).join(' · ');
      card.append(heading,information);
      for (const leg of Array.isArray(route.legs) ? route.legs : []) {
        const segment = document.createElement('div');
        segment.className = 'vano-transit-leg';
        segment.textContent = [leg.mode,leg.line,leg.from,leg.to].filter(Boolean).join(' · ');
        card.appendChild(segment);
      }
      publicList.appendChild(card);
    }
    const fastest = transitRoutes.map(x => numeric(x.duration_seconds))
      .filter(x => x > 0 && Number.isFinite(x));
    setEta('transit', fastest.length ? fmt(Math.min(...fastest)) : 'Indisponível');
  }
  async function loadTransit() {
    transitAbort?.abort();
    const snapshot = plannerSnapshot();
    if (!sourceKey(snapshot)) {
      setEta('transit','Sem origem');
      writeTransitMessage('Defina a origem e o destino',
        'Ative o GPS ou escolha um ponto de partida antes de consultar o transporte público.');
      return;
    }
    const controller = new AbortController();
    transitAbort = controller;
    writeTransitMessage('Consultando itinerários…', 'Buscando rotas de transporte público verificadas.');
    const qs = new URLSearchParams({
      start_lat:String(snapshot.origin.lat),start_lon:String(snapshot.origin.lon),
      end_lat:String(snapshot.destination.lat),end_lon:String(snapshot.destination.lon)
    });
    try {
      const response = await fetch('/api/transit/itineraries?' + qs, {
        signal:controller.signal, credentials:'same-origin', headers:{Accept:'application/json'}
      });
      if (!response.ok) throw new Error('transit-unavailable');
      const json = await response.json();
      if (controller.signal.aborted || sourceKey(plannerSnapshot()) !== sourceKey(snapshot)) return;
      transitRoutes = Array.isArray(json.routes) ? json.routes : [];
      setEta('transit','Indisponível');
      renderTransit();
    } catch (_) {
      if (controller.signal.aborted) return;
      transitRoutes = [];
      setEta('transit','Indisponível');
      writeTransitMessage('Transporte público ainda indisponível',
        'O VANO ainda não tem um planejador de ônibus e metrô habilitado neste ambiente. Nenhum horário foi estimado.');
    }
  }
  function setTransitActive(active) {
    transitActive = active;
    routeState.classList.toggle('vano-transit-active', active);
    publicButton.classList.toggle('active', active);
    publicButton.setAttribute('aria-pressed', String(active));
    publicPanel.hidden = !active;
    if (active) {
      availableButtons.forEach(button => button.classList.remove('active'));
      setRoutePreviewVisibility(false);
      loadTransit();
    } else {
      setRoutePreviewVisibility(true);
      transitAbort?.abort();
      transitRoutes = [];
    }
  }
  publicButton.addEventListener('click', () => setTransitActive(true));
  for (const button of availableButtons) {
    button.addEventListener('click', () => {
      if (transitActive) setTransitActive(false);
    });
  }
  for (const button of sortButtons) button.addEventListener('click', () => {
    transitSort = button.dataset.transitSort;
    sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    if (transitActive) renderTransit();
  });
  let previousRouteSignature = '';
  function sync() {
    const snapshot = plannerSnapshot();
    if (!snapshot) return;
    const key = sourceKey(snapshot);
    if (key && key !== estimatesKey) {
      estimatesKey = key;
      estimateAbort?.abort();
      for (const profile of baseModes) setEta(profile,'Ver rota');
      setEta('transit','Consultar');
      if (transitActive) loadTransit();
    }
    if (!snapshot.routeReady || !key) return;
    currentEta(snapshot);
    for (const p of baseModes) {
      if (p === snapshot.profile) continue;
      const cached = estimateCache.get(key + ':' + p);
      if (cached && !cached.unavailable && Date.now() - cached.at < 120000) setEta(p,fmt(cached.duration));
      if (cached?.unavailable && Date.now() - cached.at < 45000) setEta(p,'Indisponível');
    }
    if (!transitActive) previewOtherModes(snapshot);
    const routeSig = key + ':' + snapshot.profile + ':' + (snapshot.selectedRoute?.id || '');
    if (previousRouteSignature && routeSig !== previousRouteSignature && transitActive) setTransitActive(false);
    previousRouteSignature = routeSig;
  }
  window.addEventListener('vano:map-ready',sync);
  const updateInterval = setInterval(sync,1100);
  window.addEventListener('pagehide',() => {
    setRoutePreviewVisibility(true);
    clearInterval(updateInterval);
    estimateAbort?.abort();
    transitAbort?.abort();
  },{once:true});
  sync();
})();
