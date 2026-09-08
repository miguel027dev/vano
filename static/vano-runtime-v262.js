(()=>{
  'use strict';
  const BUILD=(window.VANO&&window.VANO.build)||'262.0.0';
  const DEFAULT_TIMEOUT=15000;
  class VanoHttpError extends Error{
    constructor(message,{status=0,code='',data=null,retryAfter='',url=''}={}){super(message);this.name='VanoHttpError';this.status=status;this.code=code;this.data=data;this.retryAfter=retryAfter;this.url=url;}
  }
  function combineSignal(external,timeoutMs){
    const controller=new AbortController();
    let timer=0;
    const abort=()=>{try{controller.abort(external?.reason||new DOMException('Aborted','AbortError'))}catch{controller.abort()}};
    if(external){if(external.aborted)abort();else external.addEventListener('abort',abort,{once:true});}
    if(timeoutMs>0)timer=setTimeout(()=>{try{controller.abort(new DOMException('Timeout','TimeoutError'))}catch{controller.abort()}},timeoutMs);
    return {signal:controller.signal,clear:()=>{if(timer)clearTimeout(timer);if(external)external.removeEventListener?.('abort',abort)}};
  }
  async function readBody(response){
    const type=(response.headers.get('content-type')||'').toLowerCase();
    if(type.includes('application/json')){
      try{return await response.json()}catch{return null}
    }
    const text=await response.text().catch(()=> '');
    return text?{message:text.slice(0,800),raw:true}:null;
  }
  async function fetchJSON(url,options={},timeoutMs=DEFAULT_TIMEOUT){
    const merged=combineSignal(options.signal,timeoutMs);
    const started=performance.now();
    try{
      const response=await fetch(url,{credentials:'same-origin',...options,signal:merged.signal});
      const data=await readBody(response);
      if(!response.ok){
        const message=(data&&typeof data==='object'&&(data.message||data.detail||data.error))||`HTTP ${response.status}`;
        throw new VanoHttpError(String(message),{status:response.status,code:String(data?.code||data?.error||''),data,retryAfter:response.headers.get('retry-after')||'',url:String(url)});
      }
      return {response,data:data||{},elapsedMs:performance.now()-started};
    }catch(error){
      if(error?.name==='AbortError'||error?.name==='TimeoutError'||merged.signal.aborted){
        const reason=merged.signal.reason;
        if(reason?.name==='TimeoutError'||error?.name==='TimeoutError')throw new VanoHttpError('A solicitação demorou mais do que o esperado.',{code:'timeout',url:String(url)});
      }
      if(error instanceof VanoHttpError)throw error;
      throw new VanoHttpError(navigator.onLine===false?'Sem conexão com a internet.':'Não foi possível conectar ao servidor.',{code:navigator.onLine===false?'offline':'network_error',url:String(url)});
    }finally{merged.clear()}
  }
  function ensureToastHost(){
    let host=document.getElementById('vanoGlobalToasts');if(host)return host;
    host=document.createElement('div');host.id='vanoGlobalToasts';host.className='vano-global-toasts';host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','false');document.body.appendChild(host);return host;
  }
  function toast(message,type='info',duration=4200){
    const host=ensureToastHost(),node=document.createElement('div');node.className=`vano-global-toast is-${type}`;node.setAttribute('role',type==='error'?'alert':'status');
    const span=document.createElement('span');span.textContent=String(message||'');node.appendChild(span);
    const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fechar aviso');close.textContent='×';close.addEventListener('click',()=>node.remove());node.appendChild(close);host.appendChild(node);
    requestAnimationFrame(()=>node.classList.add('show'));setTimeout(()=>{node.classList.remove('show');setTimeout(()=>node.remove(),180)},Math.max(1800,duration));return node;
  }
  function confirmDialog({title='Confirmar ação',message='',confirmText='Confirmar',cancelText='Cancelar',danger=false}={}){
    return new Promise(resolve=>{
      const previous=document.activeElement,overlay=document.createElement('div');overlay.className='vano-confirm-overlay';overlay.innerHTML=`<div class="vano-confirm-card" role="dialog" aria-modal="true" aria-labelledby="vanoConfirmTitle"><h2 id="vanoConfirmTitle"></h2><p></p><div><button type="button" data-cancel></button><button type="button" data-confirm></button></div></div>`;
      const card=overlay.querySelector('.vano-confirm-card'),h=card.querySelector('h2'),p=card.querySelector('p'),cancel=card.querySelector('[data-cancel]'),ok=card.querySelector('[data-confirm]');h.textContent=title;p.textContent=message;cancel.textContent=cancelText;ok.textContent=confirmText;ok.classList.toggle('danger',!!danger);
      const finish=value=>{document.removeEventListener('keydown',key);overlay.remove();try{previous?.focus?.()}catch{}resolve(value)};const key=e=>{if(e.key==='Escape'){e.preventDefault();finish(false);return}if(e.key==='Tab'){const focus=[cancel,ok],i=focus.indexOf(document.activeElement);e.preventDefault();focus[(i+(e.shiftKey?-1:1)+focus.length)%focus.length].focus()}};cancel.onclick=()=>finish(false);ok.onclick=()=>finish(true);overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});document.addEventListener('keydown',key);document.body.appendChild(overlay);setTimeout(()=>cancel.focus(),0);
    });
  }
  function setBusy(button,busy,label){if(!button)return;if(busy){button.dataset.vanoOldHtml=button.innerHTML;button.disabled=true;button.setAttribute('aria-busy','true');if(label)button.textContent=label}else{button.disabled=false;button.removeAttribute('aria-busy');if(button.dataset.vanoOldHtml){button.innerHTML=button.dataset.vanoOldHtml;delete button.dataset.vanoOldHtml}window.lucide?.createIcons?.()}}
  function safeCSV(value){const s=String(value??'');return /^[=+\-@]/.test(s)?`'${s}`:s}
  function networkHint(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return c?{effectiveType:c.effectiveType||'',downlink:Number(c.downlink)||null,rtt:Number(c.rtt)||null,saveData:!!c.saveData}:{} }
  document.addEventListener('submit',event=>{
    const form=event.target?.closest?.('form[data-vano-confirm]');if(!form||form.dataset.vanoConfirmed==='1')return;event.preventDefault();const message=form.dataset.vanoConfirm||'Confirmar esta ação?',submitter=event.submitter;confirmDialog({title:'Confirmar ação',message,confirmText:form.dataset.vanoConfirmText||'Confirmar',danger:form.dataset.vanoDanger==='1'}).then(ok=>{if(!ok)return;form.dataset.vanoConfirmed='1';try{form.requestSubmit(submitter||undefined)}catch{form.submit()}});
  },true);
  window.VANO_RUNTIME={BUILD,VanoHttpError,fetchJSON,toast,confirm:confirmDialog,setBusy,safeCSV,networkHint};
  window.addEventListener('offline',()=>toast('Você está sem conexão. Algumas funções podem ficar indisponíveis.','error',6000));
  window.addEventListener('online',()=>toast('Conexão restabelecida.','success',2600));
})();
