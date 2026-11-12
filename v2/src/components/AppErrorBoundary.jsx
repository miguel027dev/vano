import React from 'react';
import {Link} from 'react-router-dom';
const MODULE_LOAD_FAILURE=/Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk|ChunkLoadError|Unable to preload CSS|Failed to load module script/i;
const RETRY_WINDOW_MS=5*60*1000;
/** A mapping fault must not black out the whole application. */
export default class AppErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){
    console.error('VANO interface:',error,info?.componentStack);
    // After a deploy the open WebView may reference an older, removed Vite
    // module hash. Refresh once in-place, preserving the current URL, instead
    // of trapping the driver on a help/error page. Never refresh in a loop.
    const message=String(error?.message||error||'');
    if(!MODULE_LOAD_FAILURE.test(message)||typeof window==='undefined'||window.navigator?.onLine===false)return;
    try{
      const key='vano-module-recovery:'+window.location.pathname;
      const now=Date.now(),previous=Number(window.sessionStorage.getItem(key)||0);
      if(previous>0&&now-previous<RETRY_WINDOW_MS)return;
      window.sessionStorage.setItem(key,String(now));
      window.location.reload();
    }catch{/* Browser may block sessionStorage; keep the manual retry button. */}
  }
  render(){
    if(this.state.error)return <main className="vano-recovery" role="alert">
      <span className="vano-recovery-symbol">!</span><h1>Não foi possível abrir esta tela</h1>
      <p>Esta tela encontrou um problema de renderização. Tente abri-la novamente; trajetos salvos podem ser recuperados.</p>
      <div className="vano-recovery-actions"><button onClick={()=>window.location.reload()}>Tentar novamente</button><Link to="/mapa">Abrir mapa</Link><Link to="/ajuda">Ajuda</Link></div>
      <small>Detalhes técnicos disponíveis no console do navegador (F12).</small>
    </main>;
    return this.props.children;
  }
}
