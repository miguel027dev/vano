import React,{useEffect,useRef} from 'react';
import {ArrowLeft,Search,X,MapPin,MoveRight,LoaderCircle} from 'lucide-react';

export default function FullscreenDestinationSearch({
  query,onQuery,onClose,onPick,suggestions=[],searchBusy=false,searchError='',nearby=false,
  demo=false,searchRef
}){
  const panelRef=useRef(null);
  useEffect(()=>{
    const old=document.activeElement;
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const nodes=[...panelRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled])')||[]];
        if(!nodes.length)return;
        if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
        else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    document.body.classList.add('v3-fullscreen-search-active');
    requestAnimationFrame(()=>searchRef?.current?.focus({preventScroll:true}));
    return()=>{
      document.removeEventListener('keydown',keydown);
      document.body.classList.remove('v3-fullscreen-search-active');
      if(old?.isConnected&&typeof old.focus==='function')old.focus({preventScroll:true});
    };
  },[]);
  const handleKey=e=>{
    if(e.key==='Enter'&&!searchBusy&&suggestions.length){e.preventDefault();onPick(suggestions[0]);}
    if(e.key==='ArrowDown'){
      const first=panelRef.current?.querySelector('.v3-search-result');
      if(first){e.preventDefault();first.focus();}
    }
  };
  return <section ref={panelRef} className="v3-search-overlay" role="dialog" aria-modal="true" aria-labelledby="v3-search-title">
    <header className="v3-search-header">
      <button type="button" onClick={onClose} className="v3-search-back" aria-label="Voltar ao mapa"><ArrowLeft size={21}/></button>
      <div><small>VANO MAPS</small><h2 id="v3-search-title">Para onde vamos?</h2></div>
    </header>
    <div className="v3-search-bar"><Search size={21}/><input ref={searchRef} role="combobox" aria-expanded={suggestions.length>0}
       aria-controls="v3-search-options" aria-autocomplete="list" aria-label="Buscar endereço ou lugar"
       autoComplete="off" enterKeyHint="search" value={query} placeholder="Busque um endereço, lugar ou café"
       onChange={e=>onQuery(e.target.value)} onKeyDown={handleKey}/>
       {searchBusy&&<LoaderCircle size={19} className="v3-search-spinner" aria-label="Buscando"/>}
       {query&&<button type="button" className="v3-search-clear" onClick={()=>{onQuery('');searchRef.current?.focus();}} aria-label="Limpar busca"><X size={18}/></button>}
    </div>
    <div className="v3-search-scroll" id="v3-search-options" role="listbox" aria-label="Sugestões de endereços">
      <div className="v3-search-subhead">{query.trim()?'RESULTADOS DA BUSCA':nearby?'PERTO DE VOCÊ':'DESCUBRA UM DESTINO'}</div>
      {suggestions.map((place,i)=><button type="button" key={place.id||i}
         role="option" aria-selected={false} className="v3-search-result" onClick={()=>onPick(place)}>
        <span className="v3-search-result-icon"><MapPin size={19}/></span>
        <span><strong>{place.name}</strong><small>{place.address||'Local encontrado'}</small></span>
        <MoveRight size={18} className="v3-search-result-arrow"/>
      </button>)}
      {!searchBusy&&!suggestions.length&&<div className="v3-search-empty" role="status">
        <span className="v3-search-empty-icon"><Search size={26}/></span>
        <strong>{query.trim()?'Nenhum destino encontrado':'Encontre seu próximo destino'}</strong>
        <p>{searchError||(!query.trim()?'Procure por endereços, comércios, cafés e pontos de interesse.':demo?'A busca depende da configuração de mapas.':'Tente outro endereço, nome ou CEP.')}</p>
      </div>}
    </div>
    <footer className="v3-search-footer">Busca VANO Maps · Os resultados dependem dos dados disponíveis</footer>
  </section>;
}
