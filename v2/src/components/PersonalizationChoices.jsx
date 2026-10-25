import React from 'react';
import {
 Pill,Dumbbell,SquareParking,Fuel,Plane,PlugZap,TrainFront,Ticket,Utensils,
 ShoppingCart,ShoppingBag,Hospital,GraduationCap,ShieldCheck,Coffee,Check,CheckCheck,
 X,Sun,CloudRain,Snowflake,Moon,Route,Clock3,Map
} from 'lucide-react';
import {POI_CHOICES,DEFAULT_VISIBLE_POIS} from '../lib/mapPoiPreferences.mjs';
import './personalization-choices.css';

const ICONS={pill:Pill,dumbbell:Dumbbell,'square-parking':SquareParking,fuel:Fuel,
 plane:Plane,'plug-zap':PlugZap,'train-front':TrainFront,ticket:Ticket,utensils:Utensils,
 'shopping-cart':ShoppingCart,'shopping-bag':ShoppingBag,hospital:Hospital,
 'graduation-cap':GraduationCap,'shield-check':ShieldCheck,coffee:Coffee};
const ROUTES=[
 {id:'fast',title:'Chegar mais rápido',detail:'Priorizar o menor tempo estimado.',icon:Clock3},
 {id:'safe',title:'Priorizar segurança',detail:'Comparar rotas considerando segurança.',icon:ShieldCheck}
];
function MapArtwork({immersive}){
 return <div className={'pc-map-preview '+(immersive?'pc-map-immersive':'pc-map-clean')} aria-hidden="true">
  {immersive&&<div className="pc-map-weather">{['sun','rain','snow','dusk'].map(x=><i className={'pc-map-weather-'+x} key={x}/>)}</div>}
  <svg className="pc-map-roads" viewBox="0 0 320 170" preserveAspectRatio="none">
   <g fill="none" stroke="#fff" strokeWidth="12" opacity=".85"><path d="M-20 42Q90 8 161 58T345 35"/><path d="M-20 133Q73 105 154 127T342 122"/><path d="M72 -10L120 180M225 -10L277 180"/></g>
   <path d="M12 142Q90 105 129 92T305 28" fill="none" stroke="#ef752f" strokeWidth="7" strokeLinecap="round"/>
  </svg>
  {immersive?<span className="pc-map-weather-icons"><Sun/><CloudRain/><Snowflake/><Moon/></span>:<span className="pc-map-clean-label"><Map size={15}/> VANO CLEAN</span>}
 </div>;
}
export default function PersonalizationChoices({settings,onSettingsChange,poiVisible,onPoiChange,mapExperience,onMapChange}){
 const chosen=new Set(poiVisible);
 const toggle=id=>onPoiChange(chosen.has(id)?poiVisible.filter(x=>x!==id):DEFAULT_VISIBLE_POIS.filter(x=>x===id||chosen.has(x)));
 return <div className="pc-personalization">
  <section className="pc-section">
   <div className="pc-section-title"><span>01 / SUA ROTA</span><h2>Qual caminho combina com você?</h2><p>Defina sua prioridade. O VANO continua oferecendo alternativas de trajeto.</p></div>
   <div className="pc-route-options" role="group" aria-label="Prioridade de rota">{ROUTES.map(item=><button key={item.id} type="button" className={'pc-route-option '+(settings.route===item.id?'is-active':'')} aria-pressed={settings.route===item.id} onClick={()=>onSettingsChange('route',item.id)}><item.icon size={23}/><span><strong>{item.title}</strong><small>{item.detail}</small></span>{settings.route===item.id&&<Check size={18}/>}</button>)}</div>
   <div className="pc-simple-toggles"><label><input type="checkbox" checked={Boolean(settings.tolls)} onChange={e=>onSettingsChange('tolls',e.target.checked)}/><span>Evitar pedágios quando possível</span></label><label><input type="checkbox" checked={Boolean(settings.alerts)} onChange={e=>onSettingsChange('alerts',e.target.checked)}/><span>Mostrar alertas importantes</span></label></div>
  </section>
  <section className="pc-section">
   <div className="pc-section-title"><span>02 / SEUS LUGARES</span><h2>Lugares no mapa</h2><p>Você escolhe quais locais deseja ver. Semáforos, travessias, ferrovias, parques e bancos continuam no mapa.</p></div>
   <div className="pc-place-toolbar"><button type="button" onClick={()=>onPoiChange([...DEFAULT_VISIBLE_POIS])}><CheckCheck size={17}/> Selecionar todos</button><button type="button" onClick={()=>onPoiChange([])}><X size={17}/> Limpar</button><small aria-live="polite">{chosen.size} de {POI_CHOICES.length}</small></div>
   <div className="pc-place-grid">{POI_CHOICES.map(([id,label,icon])=>{const Icon=ICONS[icon]||Map;return <button key={id} type="button" aria-pressed={chosen.has(id)} className={'pc-place '+(chosen.has(id)?'is-active':'')} onClick={()=>toggle(id)}><Icon size={19}/><span>{label}</span>{chosen.has(id)&&<Check size={16}/>}</button>})}</div>
   <p className="pc-help">A disponibilidade dos ícones depende dos dados cartográficos. Sinalização e alertas não são ocultados por estas opções.</p>
  </section>
  <section className="pc-section">
   <div className="pc-section-title"><span>03 / APARÊNCIA</span><h2>Qual estilo de mapa você prefere?</h2><p>O mapa e a rota continuam legíveis nos dois estilos.</p></div>
   <div className="pc-style-grid">{[['clean','Clean','Claro, discreto e sem distrações.'],['immersive','Imersivo','Ambiente visual com sol, chuva, neve e entardecer.']].map(([id,label,detail])=><button key={id} type="button" aria-pressed={mapExperience===id} className={'pc-style-option '+(mapExperience===id?'is-active':'')} onClick={()=>onMapChange(id)}><MapArtwork immersive={id==='immersive'}/><span className="pc-style-name">{label}{mapExperience===id&&<Check size={17}/>}</span><small>{detail}</small></button>)}</div>
  </section>
 </div>;
}
