
(() => {
  'use strict';
  function setup(){
    if(document.getElementById('v2Dock'))return;
    const search=document.querySelector('#welcomeState .planner-search-row');
    const preset=document.querySelector('#welcomeState .planner-presets');
    const nearby=document.querySelector('#welcomeState .nearby-services');
    if(!search||!preset||!nearby)return;
    document.body.classList.add('vano-v2');
    const dock=document.createElement('section');dock.id='v2Dock';dock.setAttribute('aria-label','Pesquisa e destinos rápidos');
    const shortcuts=document.createElement('nav');shortcuts.id='v2Shortcuts';shortcuts.setAttribute('aria-label','Destinos e locais próximos');
    dock.append(search,shortcuts);
    document.body.appendChild(dock);
    for(const id of ['quickHome','quickWork','quickRoutine']){
      const button=document.getElementById(id);if(button)shortcuts.appendChild(button);
    }
    const labels={'restaurantes':'Restaurantes','hospitais':'Hospitais','farmácias':'Farmácias','postos de combustível':'Postos','estacionamento':'Estacionar'};
    for(const key of Object.keys(labels)){
      const button=[...nearby.querySelectorAll('[data-nearby-query]')].find(el=>el.dataset.nearbyQuery===key);
      if(button){button.querySelector('b').textContent=labels[key];shortcuts.appendChild(button)}
    }
    const input=document.getElementById('destinationInput');
    if(input)input.setAttribute('placeholder','Buscar endereço ou lugar');
    const sheet=document.getElementById('planSheet');
    const route=document.getElementById('routeState');
    function update(){
      const navigating=Boolean(document.body.classList.contains('is-navigating')||document.body.classList.contains('navigating')||document.body.classList.contains('navigation-active'));
      const showingRoute=Boolean(route&&getComputedStyle(route).display!=='none');
      dock.classList.toggle('v2-is-navigating',navigating);
      dock.classList.toggle('v2-has-route',showingRoute);
      if(showingRoute&&!navigating){dock.style.opacity='0';dock.style.pointerEvents='none'}
      else{dock.style.opacity='';dock.style.pointerEvents=''}
    }
    const observer=new MutationObserver(update);
    if(sheet)observer.observe(sheet,{attributes:true,attributeFilter:['class']});
    if(route)observer.observe(route,{attributes:true,attributeFilter:['style','class']});
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
