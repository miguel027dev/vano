/* VANO Admin · views, truthful metrics, and the existing VANO Mapbox 3D style. */
(() => {
  'use strict';
  const root = document.querySelector('[data-admin350-root]');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navButtons = [...root.querySelectorAll('[data-admin-view]')];
  const dash = $('adminDashboardView');
  const routeView = $('adminRoutesView');
  const status = $('adminMapStatus');
  const boot = window.VANO_ADMIN_MAP_BOOT || {};
  let map = null, markers = [], initialized = false;
  let selected = null;

  const setStatus = (message, state = 'loading') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };

  function initMap() {
    if (initialized) { if (map) window.requestAnimationFrame(() => map.resize()); return; }
    initialized = true;
    if (!window.mapboxgl || !boot.token) {
      setStatus('Mapa 3D indisponível: a configuração Mapbox não está ativa. Abra o mapa principal para verificar a conexão.', 'error');
      return;
    }
    try {
      window.mapboxgl.accessToken = boot.token;
      map = new window.mapboxgl.Map({
        container: 'adminRouteMap',
        style: boot.style,
        center: [-46.655, -23.555],
        zoom: 11.4,
        pitch: 62,
        bearing: -18,
        antialias: true,
        attributionControl: true,
        cooperativeGestures: false,
        dragPan: true,
        scrollZoom: true,
        touchZoomRotate: true,
        trackResize: true,
      });
      map.addControl(new window.mapboxgl.NavigationControl({showCompass:true, visualizePitch:true}), 'top-right');
      map.addControl(new window.mapboxgl.FullscreenControl(), 'top-right');
      map.on('load', () => {
        setStatus('Mapa 3D carregado.', 'ready');
        map.resize();
        if (selected) focusRecord(selected);
      });
      map.on('error', e => {
        if (!map.loaded()) {
          setStatus('Não foi possível carregar o mapa 3D. Verifique o acesso ao Mapbox e tente novamente.', 'error');
        }
        if (window.console?.warn) console.warn('VANO admin map:', e.error?.message || 'erro Mapbox');
      });
    } catch (e) {
      setStatus('Não foi possível inicializar o mapa 3D. Verifique a conexão ou abra o mapa principal.', 'error');
      if (window.console?.warn) console.warn('VANO admin map:', e.message);
    }
  }

  function focusRecord(button) {
    selected = button;
    root.querySelectorAll('[data-admin-route]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    const detail = $('adminSelectedRoute');
    if (detail) detail.textContent = button.dataset.routeDescription || 'Rota selecionada';
    if (!map || !map.loaded()) return;
    markers.forEach(marker => marker.remove());
    markers = [];
    const {originLat, originLon, destinationLat, destinationLon} = button.dataset;
    const values = [originLon, originLat, destinationLon, destinationLat].map(Number);
    if (values.some(value => !Number.isFinite(value)) || Math.abs(values[0]) > 180 || Math.abs(values[2]) > 180 || Math.abs(values[1]) > 90 || Math.abs(values[3]) > 90) {
      setStatus('Coordenadas do histórico indisponíveis para esta rota.', 'error'); return;
    }
    const start = [values[0], values[1]], end = [values[2], values[3]];
    try {
      [start, end].forEach((coord, index) => {
        const el = document.createElement('div');
        el.className = 'vano-map-pin' + (index ? ' is-end' : '');
        el.setAttribute('aria-hidden','true');
        markers.push(new window.mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat(coord).addTo(map));
      });
      const bounds = new window.mapboxgl.LngLatBounds(start, start).extend(end);
      map.fitBounds(bounds, {padding:75, maxZoom:15.8, duration:reduceMotion()?0:950, pitch:58, bearing:-18});
      setStatus('Pontos de origem e destino exibidos. O histórico não contém a geometria nem o GPS ao vivo.', 'info');
    } catch (e) {
      setStatus('Não foi possível enquadrar os pontos deste trajeto.', 'error');
    }
  }

  function switchView(name, shouldUpdateHistory = true) {
    const routes = name === 'routes';
    if (dash) dash.hidden = routes;
    if (routeView) routeView.hidden = !routes;
    navButtons.forEach(btn => {
      const active = btn.dataset.adminView === (routes ? 'routes':'dashboard');
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
    });
    if (shouldUpdateHistory) {
      history.replaceState(history.state, '', routes ? '#acompanhar-rotas' : '#dashboard');
    }
    if (routes) initMap();
    window.scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'});
  }

  navButtons.forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    switchView(button.dataset.adminView);
  }));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#acompanhar-rotas') switchView('routes', false);
    else if (location.hash === '#dashboard') switchView('dashboard', false);
  });
  root.querySelectorAll('[data-admin-route]').forEach(button => {
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click', () => focusRecord(button));
  });
  $('adminMapReset')?.addEventListener('click', () => {
    selected = null;
    markers.forEach(marker => marker.remove()); markers = [];
    root.querySelectorAll('[data-admin-route]').forEach(b => b.setAttribute('aria-pressed','false'));
    if ($('adminSelectedRoute')) $('adminSelectedRoute').textContent='Selecione um trajeto para mostrar origem e destino.';
    if (map) map.flyTo({center:[-46.655,-23.555],zoom:11.4,pitch:62,bearing:-18,duration:reduceMotion()?0:850});
    setStatus('Selecione uma rota recente para visualizar os pontos no mapa.', 'info');
  });

  const bars = [...root.querySelectorAll('[data-admin-activity-bar]')];
  const values = bars.map(el => Math.max(0,Number(el.dataset.value)||0));
  const max = Math.max(1,...values);
  bars.forEach((el, i) => {
    const height = values[i] ? Math.max(7,(values[i]/max)*100) : 2;
    el.style.setProperty('--h', height.toFixed(1)+'%');
    el.setAttribute('aria-label', (el.dataset.label || 'Métrica') + ': ' + values[i].toLocaleString('pt-BR'));
  });

  if (location.hash === '#acompanhar-rotas') switchView('routes',false);
  else switchView('dashboard',false);
})();
