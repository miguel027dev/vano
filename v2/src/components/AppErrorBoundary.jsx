import React from 'react';
import {Link} from 'react-router-dom';
/** A mapping fault must not black out the whole application. */
export default class AppErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error('VANO interface:',error,info?.componentStack);}
  render(){if(this.state.error)return <main className="vano-recovery" role="alert"><span className="vano-recovery-symbol">!</span><h1>Não foi possível abrir esta tela</h1><p>Esta tela encontrou um problema de renderização. Tente abri-la novamente; trajetos salvos podem ser recuperados.</p><div className="vano-recovery-actions"><button onClick={()=>window.location.reload()}>Tentar novamente</button><Link to="/ajuda">Ajuda</Link></div><small>Detalhes técnicos disponíveis no console do navegador (F12).</small></main>;return this.props.children;}
}
