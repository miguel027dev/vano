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
    field.setAttribute('placeholder', 'Buscar endereço, lugar ou destino');
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
      const rect = dock.querySelector('.planner-search-card').getBoundingClientRect();
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
    window.addEventListener('resize', update, {passive:true});
    observer.observe(document.body, {attributes:true,attributeFilter:['class']});
    update();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, {once:true});
  } else setup();
})();