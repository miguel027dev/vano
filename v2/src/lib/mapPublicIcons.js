/** VANO map icon family — small static SVG glyphs in accessible touch targets.
 * Icons are rendered from a closed enum; untrusted tags are never interpolated.
 */
export const ICON_THEME=Object.freeze({
 radar:['radar-device','#ff781e'],semaforo:['signal','#283f52'],lombada:['bump','#f6a000'],pare:['stop','#ed3345'],
 preferencia:['yield','#f6a000'],placa:['sign','#e58d00'],travessia:['crossing','#283440'],
 ferrovia:['rail','#CB713E'],rotatoria:['roundabout','#506879'],obra:['works','#fa8021'],hospital:['medical','#dc3245'],
 saude:['medical','#21a469'],bombeiros:['fire','#ec3a35'],'policia-base':['shield','#2279dc'],
 combustivel:['fuel','#ff8a19'],estacionamento:['parking','#3979BC'],banco:['bank','#596675'],eletroposto:['bolt','#15956b'],
 'relato-transito':['traffic','#d54c3b'],'relato-obra':['works','#fa8021'],'alerta-via':['alert','#c85325'],
 'relato-acidente':['incident','#dc3546'],'relato-risco':['alert','#dc3546'],
 'relato-radar':['radar-device','#ff781e'],
 'mercado':['market','#2E9B63'],
 'supermercado':['basket','#3979BC'],
 'shopping':['bag','#7961B6'],
 'estacao-recarga':['charge','#188E65'],
 'carregador-eletrico':['plug','#228A6F'],
 'restaurante':['utensils','#CA713C'],
 'fastfood':['burger','#B8872F'],
 'cafeteria':['coffee','#A57652'],
 'hotel':['bed','#8263B1'],
 'escola':['school','#B78328'],
 'academia':['fitness','#228C56'],
 'parque':['trees','#298A51'],
 'petshop':['paw','#B467AC'],
 'correios':['mail','#795EB7'],
 'farmacia':['medical','#2398AF'],
 'lavarapido':['wash','#317EBC'],
 'terminal-onibus':['bus','#377DB9'],
 'estacao-trem':['train','#3187B4'],
 'estacao-ferroviaria':['railstation','#4385A8'],
 'aeroporto':['plane','#5282CA']
});
const GLYPHS={
 camera:'<rect x="3" y="6" width="15" height="12" rx="2.8"/><circle cx="10.5" cy="12" r="3"/><path d="M20 9q3 3 0 6"/>',
 'radar-device':'<rect x="5" y="3" width="14" height="12" rx="2.1"/><path d="M5 6h14"/><circle cx="12" cy="10" r="2.5"/><path d="M12 15v6M8.5 21h7"/>',
 signal:'<rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="6.4" r="1.3" fill="#f34043" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="#ffcb2a" stroke="none"/><circle cx="12" cy="17.6" r="1.3" fill="#21b55f" stroke="none"/>',
 bump:'<path d="M2 18h20M4 17q2-11 8-11t8 11"/><path d="M9 10v6m6-6v6"/>',
 stop:'<path d="m8 2 8 0 6 6v8l-6 6H8l-6-6V8z"/><path d="M8 12h8"/>',
 yield:'<path d="m12 21 10-18H2z"/><path d="M12 8v5m0 4v.5"/>',
 sign:'<path d="M12 3v18M6 6h12v8H6z"/><path d="M9 10h6"/>',
 crossing:'<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
 rail:'<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
 roundabout:'<circle cx="12" cy="12" r="2.2"/><path d="M7.7 5.6a7.7 7.7 0 0 1 10.7 3.1m-.1 0-.3-3.5m.3 3.5-3.5-.6M19 11.8a7.7 7.7 0 0 1-7 7.8m0 0 2.9 2m-2.9-2 2.8-2.1M9 18.8a7.7 7.7 0 0 1-4.2-10m0 0-2.2 2.6m2.2-2.6 2.9 1.7"/>',
 // Closed static SVG: amber beacons, reflective barricade slats and grounded feet.
 works:'<circle cx="12" cy="3.9" r="1.45" fill="#F9AA2D" stroke="#945017" stroke-width=".75"/><rect x="3.1" y="7.3" width="17.8" height="9.4" rx="1.7" fill="#FFF4DE" stroke="#995115" stroke-width="1.35"/><path d="M7.6 7.9 3.7 13.2M13.4 7.9 7.5 16M19.1 7.9 13.4 16" stroke="#ED7928" stroke-width="2.5" stroke-linecap="butt"/><path d="M7.4 17v3.7m9.2-3.7v3.7M5.3 21h4.3m4.8 0h4.3" stroke="#995115" stroke-width="1.6" stroke-linecap="round"/>',
 medical:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
 fire:'<path d="M12 2q3 6-1 10q5-1 6-5q7 12-4 15Q2 22 5 12q1-4 7-10Z"/>',
 shield:'<path d="M12 2 21 6v7q0 6-9 9q-9-3-9-9V6z"/><path d="m8 13 3 3 5-6"/>',
 fuel:'<path d="M4 21V4h11v17H4Zm0-10h11M15 8h3l3 4v7q0 3-3 2"/>',
 parking:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
 bank:'<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
 bolt:'<path d="M14 2 5 13h7l-2 9 9-12h-7z"/>',
 traffic:'<path d="M3 18h18M6 15V9h12v6M4 9l3-4h10l3 4M6 15h12M6 19v2M18 19v2"/>',
 incident:'<path d="M4 9h7v7H4zM14 9h6v7h-6M11 4l1 4 3-4M5 20h5m4 0h5"/>',
 alert:'<path d="m12 2 10 19H2zM12 9v5m0 3v.6"/>',
 market:'<path d="M3.5 10h17L18.5 4h-13z"/><path d="M4 10v2a2 2 0 0 0 4 0v-2m0 0v2a2 2 0 0 0 4 0v-2m0 0v2a2 2 0 0 0 4 0v-2m0 0v2a2 2 0 0 0 4 0v-2"/><path d="M5 14v7h14v-7M9 21v-6h6v6"/>',
 basket:'<path d="M4 11h16l-2 10H6L4 11Z"/><path d="m8 11 4-7 4 7"/><path d="M9 14v4m6-4v4"/>',
 bag:'<path d="M4 8h16l-1.2 13H5.2L4 8ZM9 10V6a3 3 0 0 1 6 0v4"/>',
 // Simplified charger silhouette: no narrow cable or overlapping strokes at 19–21px.
 charge:'<rect x="4.5" y="2.5" width="15" height="19" rx="3.25" stroke-width="1.65"/><path d="m13.8 5.5-5.1 7h3.4L11 18.6l4.8-8h-3.4z" fill="#188E65" stroke="none"/>',
 plug:'<path d="M8 3v5m8-5v5M6 8h12v5a6 6 0 0 1-6 6v3M12 12l-2 3h3l-1 2"/>',
 utensils:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 3v18M20 3c-4 2-6 6-6 11h6"/>',
 burger:'<path d="M4 11a8 8 0 0 1 16 0H4ZM4 19h16M3 14h18M5 16h14M8 7h.01M12 6h.01M16 7h.01"/>',
 coffee:'<path d="M4 8h13v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8ZM17 10h2a3 3 0 0 1 0 6h-2M8 3v3m4-4v4"/>',
 bed:'<path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M3 16h18M3 20v1M21 20v1M7 10V7h10v3M12 7v3"/>',
 school:'<path d="M3 21V9l9-6 9 6v12H3Z"/><circle cx="12" cy="9" r="2"/><path d="M12 8v1l1 .5M8 21v-7h8v7"/>',
 fitness:'<path d="M2 10v4M5 7v10M8 9v6m8-6v6m3-8v10m3-7v4M8 12h8"/>',
 trees:'<path d="m6 3-4 8h3l-3 5h8l-3-5h3L6 3ZM17 5l-4 7h3l-3 5h8l-3-5h3l-4-7ZM6 16v6m11-5v5"/>',
 paw:'<circle cx="5.5" cy="9" r="1.5"/><circle cx="10" cy="5.5" r="1.5"/><circle cx="15" cy="5.5" r="1.5"/><circle cx="19.5" cy="9" r="1.5"/><path d="M12 12c-2.5 0-3.5 2-5.2 3.3C4 17.4 6 21 9 20c2-1 4-1 6 0 3 1 5-2.6 2.2-4.7C15.5 14 14.5 12 12 12Z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 7 8-7"/>',
 wash:'<path d="M6 15 8 9h8l2 6M5 15h14v5H5zM8 20h1m6 0h1M7 3v2m5-3v3m5-2v2"/>',
 bus:'<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M7 8h10M8 16h1m6 0h1M7 20v2m10-2v2M9 5h6"/>',
 train:'<rect x="5" y="2" width="14" height="18" rx="4"/><path d="M8 6h8M8 11h8M8 16h1m6 0h1M8 20l-3 3m11-3 3 3"/>',
 railstation:'<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M7 7h10M7 12h10M8 16h1m6 0h1M8 19l-3 4m11-4 3 4"/>',
 plane:'<path d="M12 2c1.1 0 1.6 1 1.6 2.5v6.1l7 4.3v2.3l-7-2.4v5.1l2.7 1.5V23L12 21.8 7.7 23v-1.6l2.7-1.5v-5.1l-7 2.4v-2.3l7-4.3V4.5C10.4 3 10.9 2 12 2Z"/>'
};
export function iconMeta(type){return ICON_THEME[type]||['alert','#616a70'];}
export function iconSvg(type){
 const [glyph,color]=iconMeta(type);
 const inner=GLYPHS[glyph]||GLYPHS.alert;
 return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';
}
/** Stable world-grid duplicate detection; independent of viewport panning. */
export function stableWorldCell(coords,_zoom){
 if(!Array.isArray(coords)||coords.length<2||!coords.every(Number.isFinite))return '';
 const z=18,cellSize=30;
 const lat=Math.max(-85,Math.min(85,coords[1]))*Math.PI/180;
 const world=512*Math.pow(2,z);
 const x=(coords[0]+180)/360*world;
 const merc=Math.log(Math.tan(Math.PI/4+lat/2));
 const y=(1-merc/Math.PI)/2*world;
 return Math.floor(x/cellSize)+':'+Math.floor(y/cellSize);
}
/** Separate budgets for total markers, road signs and semaphores. */
export function publicPinDensity(viewport,zoom=14,max=52,{navigation=false}={}){
 const width=Number(viewport?.width),height=Number(viewport?.height);
 const valid=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0;
 const area=valid?width*height:650000;
 // A distant overview may show more landmarks; street-level exploration
 // requires fewer pins so the actual road and street names remain legible.
 const zoomFactor=navigation?.78:zoom<14?1:zoom<16?.85:.60;
 const absoluteMax=Math.max(1,Math.floor(Number.isFinite(max)?max:52));
 const displayMax=valid?Math.max(navigation?10:12,Math.min(86,Math.round(area/10500*zoomFactor))):absoluteMax;
 const total=Math.min(absoluteMax,displayMax);
 return {
  total,
  roadMax:Math.max(2,Math.min(total,Math.ceil(total*(navigation?.55:.27)))),
  signalMax:Math.max(2,Math.min(16,Math.round(area/75000*(navigation?1:zoomFactor)))),
  minSpacing:navigation?58:zoom>=16?66:zoom<14?53:52,
  signalSpacing:zoom<16?112:94,
  typeMax:Math.max(3,Math.ceil(total*(navigation?.28:.20)))
 };
}
const PIN_URGENT=new Set(['radar','relato-acidente','relato-risco','relato-obra','relato-transito','relato-radar','obra','alerta-via']);
const PIN_SERVICES=new Set([
 'hospital','saude','bombeiros','policia-base','combustivel','eletroposto','estacionamento',
 'farmacia','escola','estacao-recarga','carregador-eletrico','terminal-onibus',
 'estacao-trem','estacao-ferroviaria','aeroporto'
]);
const PIN_ROAD=new Set(['semaforo','lombada','pare','preferencia','placa','travessia','ferrovia','rotatoria']);
// Only road guidance, active traffic alerts and essential stops survive navigation.
const PIN_NAVIGATION_ESSENTIAL=new Set(['hospital','farmacia','estacionamento']);
export function navigationPinAllowed(type){return PIN_URGENT.has(type)||PIN_ROAD.has(type)||PIN_NAVIGATION_ESSENTIAL.has(type);}
const pinPriority=(a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.id).localeCompare(String(b.id));
/** Round-robin across types to keep variety when one class dominates source tiles. */
function diversePinOrder(list){
 const buckets=new Map();
 for(const f of [...list].sort(pinPriority)){
  if(!buckets.has(f.type))buckets.set(f.type,[]);
  buckets.get(f.type).push(f);
 }
 const groups=[...buckets.values()].sort((a,b)=>pinPriority(a[0],b[0])),ordered=[];
 let more=true;
 while(more){more=false;for(const group of groups)if(group.length){ordered.push(group.shift());more=true;}}
 return ordered;
}
export function selectPublicPins(features=[],project=()=>null,zoom=12.4,max=52,viewport=null,options={}){
 if(!Array.isArray(features)||!Number.isFinite(zoom))return [];
 const navigation=options?.navigation===true;
 const rules=publicPinDensity(viewport,zoom,max,{navigation});
 const hidden=new Set(['farmacia','hotel','mercado','supermercado','cafeteria','escola','petshop']);
 const candidates=features.filter(f=>Array.isArray(f?.coords)&&f.coords.length===2&&ICON_THEME[f.type]&&!hidden.has(f.type)&&(!navigation||navigationPinAllowed(f.type)));
 const urgent=diversePinOrder(candidates.filter(f=>PIN_URGENT.has(f.type)));
 const services=diversePinOrder(candidates.filter(f=>PIN_SERVICES.has(f.type)&&!PIN_URGENT.has(f.type)));
 const businesses=diversePinOrder(candidates.filter(f=>!PIN_SERVICES.has(f.type)&&!PIN_ROAD.has(f.type)&&!PIN_URGENT.has(f.type)));
 const road=diversePinOrder(candidates.filter(f=>PIN_ROAD.has(f.type)));
 const chosen=[],positions=[],cells=new Set(),counts=new Map();
 let roadCount=0,signalCount=0;
 function addFrom(pool,until){
  for(const f of pool){
   if(chosen.length>=until||chosen.length>=rules.total)break;
   if(!PIN_URGENT.has(f.type)&&(counts.get(f.type)||0)>=rules.typeMax)continue;
   if(PIN_ROAD.has(f.type)&&roadCount>=rules.roadMax)continue;
   if(f.type==='semaforo'&&signalCount>=rules.signalMax)continue;
   let p;
   try{p=project(f.coords);}catch{continue;}
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
   if(viewport&&Number.isFinite(viewport.width)&&Number.isFinite(viewport.height)&&
      (p.x< -36||p.y< -36||p.x>viewport.width+36||p.y>viewport.height+36))continue;
   const cell=stableWorldCell(f.coords,zoom);
   if(!cell||cells.has(cell))continue;
   if(positions.some(other=>{
    const radius=f.type==='semaforo'&&other.type==='semaforo'?rules.signalSpacing:rules.minSpacing;
    const dx=p.x-other.x,dy=p.y-other.y;
    return dx*dx+dy*dy<radius*radius;
   }))continue;
   chosen.push(f);positions.push({x:p.x,y:p.y,type:f.type});cells.add(cell);
   counts.set(f.type,(counts.get(f.type)||0)+1);
   if(PIN_ROAD.has(f.type))roadCount++;
   if(f.type==='semaforo')signalCount++;
  }
 }
 if(navigation){
  // On-road focus: incidents/radars first, traffic signs next, essential
  // stops last. Commercial POIs cannot reserve or consume any icon slots.
  addFrom(urgent,rules.total);
  addFrom(road,rules.total);
  addFrom(services,rules.total);
 }else{
  // Exploring the map: retain a variety of genuinely mapped places, with a
  // stronger density cap at close zoom and fewer collisions in city centres.
  addFrom(urgent,Math.min(rules.total,Math.max(3,Math.ceil(rules.total*.42))));
  addFrom(services,Math.min(rules.total,chosen.length+Math.max(2,Math.ceil(rules.total*.24))));
  addFrom(businesses,Math.min(rules.total,chosen.length+Math.max(2,Math.ceil(rules.total*.18))));
  addFrom(road,Math.min(rules.total,chosen.length+Math.min(rules.roadMax,Math.max(2,Math.ceil(rules.total*.12)))));
  addFrom(urgent,rules.total);
  addFrom(services,rules.total);
  addFrom(businesses,rules.total);
  addFrom(road,rules.total);
 }
 return chosen.sort(pinPriority);
}
/** Bound the camera viewport to a small safe geographic query at current zoom. */
export function mapFeatureBBox(map,backend){
 const zoom=map.getZoom();
 if(!Number.isFinite(zoom)||zoom<11.6)return null;
 const center=map.getCenter(),longitude=Number(center.lng),latitude=Number(center.lat);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(latitude)>84)return null;
 const b=map.getBounds();
 const spanLon=Math.min(.028,(Number(b.getEast())-Number(b.getWest()))/2+.003);
 const spanLat=Math.min(.025,(Number(b.getNorth())-Number(b.getSouth()))/2+.003);
 if(!(spanLat>0&&spanLon>0))return null;
 return [longitude-spanLon,latitude-spanLat,longitude+spanLon,latitude+spanLat].map(n=>+n.toFixed(5));
}

/** Public camera snapshots are indexed locally by viewport. Unlike POIs,
 * radar lookup covers the visible map instead of just a small center patch.
 * One bounded request is issued after the user finishes panning.
 */
export function mapRadarBBox(map){
 const zoom=Number(map.getZoom());
 if(!Number.isFinite(zoom)||zoom<11.6)return null;
 const center=map.getCenter(),lng=Number(center.lng),lat=Number(center.lat);
 if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lat)>84)return null;
 const b=map.getBounds(),west=Number(b.getWest()),east=Number(b.getEast());
 const south=Number(b.getSouth()),north=Number(b.getNorth());
 if(![west,east,south,north].every(Number.isFinite)||east<=west||north<=south)return null;
 const left=Math.max(-180,lng-.149,west-.002),right=Math.min(180,lng+.149,east+.002);
 const bottom=Math.max(-85,lat-.149,south-.002),top=Math.min(85,lat+.149,north+.002);
 if(left>=right||bottom>=top)return null;
 return [left,bottom,right,top].map(x=>+x.toFixed(5));
}


/** V2 admin visual-only filter: retain semaphore observations for route evidence
 * without putting floating signal chips over the simulation or map.
 * Public /mapa keeps its existing POIs and the road graph remains unchanged.
 */
export function filterV2TrafficSignalPins(pins=[],{v2Experience=false,hiddenIds=null}={}){
 return (Array.isArray(pins)?pins:[]).filter(item=>
  !hiddenIds?.has(item.id)&&!(v2Experience&&item.type==='semaforo'));
}
