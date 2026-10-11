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
    window.addEventListener('resize', () => {layoutV2();update()}, {passive:true});
    observer.observe(document.body, {attributes:true,attributeFilter:['class']});
    update();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, {once:true});
  } else setup();
})();