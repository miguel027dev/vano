(()=>{
  if(window.top!==window||window.__vanoNativeRuntime)return;
  window.__vanoNativeRuntime=true;
  const call=data=>{try{if(window.VanoHost?.postMessage){window.VanoHost.postMessage(JSON.stringify(data));return 'ok';}return prompt('VANO_NATIVE',JSON.stringify(data));}catch{return '';}};
  window.__vanoBack=()=>{
    const close=document.querySelector('.v5-point-popover')&&document.querySelector('.v5-point-more[aria-expanded="true"]');
    if(close){close.click();return true;}
    const modal=document.querySelector('.v5-editor .modal-title button,.search-results-head button');
    if(modal){modal.click();return true;}return false;
  };
  document.addEventListener('click',event=>{
    const anchor=event.target.closest?.('a[href]');if(!anchor||event.defaultPrevented)return;
    const url=new URL(anchor.href,location.href);
    if(url.origin===location.origin&&url.pathname==='/api/auth/google/start'&&!url.searchParams.has('link')){
      event.preventDefault();event.stopImmediatePropagation();call({action:'google'});
    }
  },true);
  if(!navigator.share)navigator.share=async data=>{call({action:'share',title:data.title||'',text:data.text||'',url:data.url||''});};
  function install(){
    if(!document.body)return;
    document.documentElement.classList.add('vano-android-shell');
    let lastRoute='',lastWake=null,readyRoute='';
    const sync=()=>{
      if(lastRoute!==location.pathname){lastRoute=location.pathname;call({action:'route',path:lastRoute});}
      const active=!document.hidden&&!!document.querySelector('.map-page.in-navigation')&&!document.querySelector('.vano-retained-map[aria-hidden="true"]');
      if(active!==lastWake){lastWake=active;call({action:'wake',active});}
      if(location.pathname!=='/mapa'&&readyRoute!==location.pathname&&document.querySelector('main:not(.app-loading),.side-nav')){readyRoute=location.pathname;call({action:'pageReady'});}
    };
    let pending=false;const queue=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;sync();});};
    new MutationObserver(queue).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
    setTimeout(()=>{if(!document.querySelector('.vano-retained-map')&&document.querySelector('.mapboxgl-canvas,.leaflet-tile-loaded'))call({action:'firstFrame',backend:'legacy-compat'});},3000);
    document.addEventListener('visibilitychange',sync);window.addEventListener('popstate',sync);sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
