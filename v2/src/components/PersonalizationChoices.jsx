import React from 'react';
import {
 Pill,Dumbbell,SquareParking,Fuel,Plane,PlugZap,TrainFront,Ticket,Utensils,
 ShoppingCart,ShoppingBag,Hospital,GraduationCap,ShieldCheck,Coffee,Check,CheckCheck,
 X,Clock3,Map
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
export default function PersonalizationChoices({settings,onSettingsChange,poiVisible,onPoiChange}){
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
 </div>;
}
