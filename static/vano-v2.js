(() => {
  'use strict';
  function setup() {
    if (document.getElementById('v2Dock')) return;
    const search = document.querySelector('#welcomeState .planner-search-row');
    const preset = document.querySelector('#welcomeState .planner-presets');
    const nearby = document.querySelector('#welcomeState .nearby-services');
    const field = document.getElementById('destinationInput');
    if (!search || !preset || !nearby || !field) return;

    document.body.classList.add('vano-v2');

    // The V1 origin field must keep its DOM ID for routing, but never be
    // displayed in the V2 search control. Moving its container to the hidden
    // welcome panel prevents its legacy styles from breaking the new header.
    const internalOrigin = search.querySelector('.origin-hidden');
    if (internalOrigin) {
      internalOrigin.setAttribute('aria-hidden', 'true');
      internalOrigin.hidden = true;
      internalOrigin.querySelectorAll('input,button').forEach(control => {
        control.tabIndex = -1;
      });
      document.getElementById('welcomeState')?.appendChild(internalOrigin);
    }
    const dock = document.createElement('section');
    dock.id = 'v2Dock';
    dock.setAttribute('aria-label', 'Busca de endereços e destinos');
    const shortcuts = document.createElement('nav');
    shortcuts.id = 'v2Shortcuts';
    shortcuts.setAttribute('aria-label', 'Atalhos e locais próximos');
    dock.append(search, shortcuts);
    document.body.appendChild(dock);

    // Keep original controls and their listeners, only change the V2 presentation.
    const adjustButton = document.getElementById('prefsBtn');
    if (adjustButton) adjustButton.hidden = true;
    const headerMenu = document.getElementById('optionsBtn');
    const searchRow = dock.querySelector('.planner-location-row');
    const magnifier = searchRow?.querySelector('.planner-search-icon');
    if (magnifier) {
      magnifier.setAttribute('aria-hidden', 'true');
      magnifier.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7.5"/><path d="m16.5 16.5 5 5"/></svg>';
    }
    if (headerMenu && searchRow) {
      headerMenu.setAttribute('title', 'Opções e perfil');
      searchRow.appendChild(headerMenu);
    }

    for (const id of ['quickHome', 'quickWork', 'quickRoutine']) {
      const button = document.getElementById(id);
      if (button) shortcuts.appendChild(button);
    }
    const labels = {
      'restaurantes': 'Restaurantes',
      'hospitais': 'Hospitais',
      'farmácias': 'Farmácias',
      'postos de combustível': 'Postos',
      'estacionamento': 'Estacionar'
    };
    for (const [key, label] of Object.entries(labels)) {
      const button = [...nearby.querySelectorAll('[data-nearby-query]')]
        .find(el => el.dataset.nearbyQuery === key);
      if (!button) continue;
      const name = button.querySelector('b');
      if (name) name.textContent = label;
      shortcuts.appendChild(button);
    }
    // Map V1 has late-loading !important rules for its bottom card. Keep the
    // V2 search geometry stable even when those legacy styles arrive later.
    const card = dock.querySelector('.planner-search-card');
    const setStrong = (element, properties) => {
      if (!element) return;
      for (const [name, value] of Object.entries(properties)) {
        element.style.setProperty(name, value, 'important');
      }
    };
    function layoutV2() {
      const small = window.innerWidth <= 700;
      const compact = window.innerWidth <= 359;
      const cardHeight = small ? '60px' : '64px';
      const rowHeight = small ? '54px' : '56px';
      setStrong(search, {
        display:'block', width:'100%', height:cardHeight,
        'min-height':cardHeight, 'max-height':cardHeight,
        margin:'0px', padding:'0px',
        'grid-template-columns':'none', transform:'none'
      });
      setStrong(card, {
        display:'block', width:'100%', 'max-width':'100%', height:cardHeight,
        'min-height':cardHeight, 'max-height':cardHeight,
        'box-sizing':'border-box', left:'0px', right:'auto', top:'0px',
        margin:'0px', transform:'none', background:'#ffffff',
        padding:small?'3px 8px':'4px 10px',
        border:'1px solid rgba(28,42,57,.10)',
        'box-shadow':'0 5px 20px rgba(22,37,52,.15)',
        'border-radius':small?'30px':'32px'
      });
      setStrong(searchRow, {
        display:'grid', width:'100%', height:rowHeight, 'min-height':rowHeight,
        'max-height':rowHeight, 'grid-template-columns':small
          ? '38px minmax(0,1fr) 38px'
          : '46px minmax(0,1fr) 46px',
        'align-items':'center', gap:'0px', margin:'0px', padding:'0px',
        left:'0px', top:'0px', transform:'none'
      });
      setStrong(headerMenu, {
        width:small?'38px':'42px', height:small?'38px':'42px',
        'min-width':small?'38px':'42px', 'min-height':small?'38px':'42px',
        'max-height':small?'38px':'42px', position:'relative',
        left:'auto', right:'auto', top:'auto', bottom:'auto', margin:'0px'
      });
      setStrong(field, {
        width:'100%', 'min-width':'0px', height:rowHeight,
        'min-height':rowHeight, 'font-size':compact?'13px':small?'15px':'16px',
        'box-sizing':'border-box', padding:'0px 2px', margin:'0px',
        'line-height':'normal'
      });
      setStrong(shortcuts, {
        display:'flex', height:small?'55px':'57px',
        'min-height':'0px', 'max-height':'57px', 'flex-wrap':'nowrap',
        'align-items':'flex-start', 'overflow-x':'auto',
        'overflow-y':'hidden', width:'100%', margin:'0px'
      });
      for (const button of shortcuts.querySelectorAll('button')) {
        setStrong(button, {
          display:'inline-flex', position:'relative', 'flex-direction':'row',
          'flex-shrink':'0', width:'auto', height:small?'42px':'44px',
          'min-height':small?'42px':'44px',
          'max-height':small?'42px':'44px',
          'border-radius':'24px', margin:'0px'
        });
      }
    }
    layoutV2();

    field.setAttribute('placeholder', 'Buscar endereço, lugar ou destino');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('aria-label', 'Buscar endereço, lugar ou destino');

    const sheet = document.getElementById('planSheet');
    const route = document.getElementById('routeState');
    const app = document.getElementById('wsApp');
    const results = document.getElementById('searchResults');

    // Legacy V1 places mobile results relative to the bottom planner.
    // V2 uses a fixed top search, so anchor the portal to the visible field.
    function alignResults() {
      if (!results || !results.classList.contains('show') ||
          !results.classList.contains('search-results-portal')) return;
      if (document.body.classList.contains('vano-search-fullscreen-active')) return;
      const anchor = dock.querySelector('.planner-search-card');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleHeight = vv?.height || window.innerHeight;
      const viewportOffset = vv?.offsetTop || 0;
      const top = Math.round(rect.bottom + 8);
      const maxHeight = Math.max(84, Math.min(400, visibleHeight - (top - viewportOffset) - 14));
      const props = {
        position: 'fixed', top: top + 'px', bottom: 'auto',
        left: Math.round(rect.left) + 'px', right: 'auto',
        width: Math.round(rect.width) + 'px',
        'max-height': Math.round(maxHeight) + 'px'
      };
      for (const [name, value] of Object.entries(props)) {
        if (results.style.getPropertyValue(name) !== value ||
            results.style.getPropertyPriority(name) !== 'important') {
          results.style.setProperty(name, value, 'important');
        }
      }
    }
    function update() {
      const navigating = ['body-nav', 'is-navigating', 'navigating', 'navigation-active']
        .some(c => document.body.classList.contains(c));
      const hasRoute = route && getComputedStyle(route).display !== 'none';
      const searching = document.activeElement === field ||
        Boolean(results && results.classList.contains('show')) ||
        Boolean(app && app.classList.contains('search-open'));
      dock.classList.toggle('v2-has-route', Boolean(hasRoute));
      dock.classList.toggle('v2-is-navigating', navigating);
      dock.classList.toggle('v2-searching', searching);
      alignResults();
    }
    field.addEventListener('focus', () => {
      update();
    });
    field.addEventListener('blur', () => requestAnimationFrame(update));
    const observer = new MutationObserver(update);
    if (route) observer.observe(route, {attributes:true,attributeFilter:['style','class']});
    if (sheet) observer.observe(sheet, {attributes:true,attributeFilter:['class']});
    if (app) observer.observe(app, {attributes:true,attributeFilter:['class']});
    if (results) observer.observe(results, {attributes:true,attributeFilter:['class','style']});
    window.visualViewport?.addEventListener('resize', update, {passive:true});
    window.addEventListener('resize', () => {layoutV2();update()}, {passive:true});
    observer.observe(document.body, {attributes:true,attributeFilter:['class']});
    update();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, {once:true});
  } else setup();
})();

/* VANO full-screen planning enhancement. Loaded only in V2 preview. */
/* VANO Maps V3 planner experience — additive UI, retains the current routing/search engine. */
(() => {
  'use strict';
  function setupPlannerV3() {
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
    '<div id="vanoSearchResultsSlot" class="vano-search-results-slot" aria-live="polite"></div>',
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
  function numeric(v) { return v == null || v === '' ? Infinity : Number.isFinite(+v) ? +v : Infinity; }
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
      const transfers = route.transfers != null && Number.isFinite(+route.transfers) ? +route.transfers : null;
      const walk = route.walking_seconds != null && Number.isFinite(+route.walking_seconds) ? fmt(+route.walking_seconds) : null;
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPlannerV3, {once:true});
  else setupPlannerV3();
})();
