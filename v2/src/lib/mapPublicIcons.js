/** VANO map icon family — small static SVG glyphs in accessible touch targets.
 * Icons are rendered from a closed enum; untrusted tags are never interpolated.
 */
export const ICON_THEME=Object.freeze({
 radar:['camera','#ff781e'],semaforo:['signal','#283f52'],lombada:['bump','#f6a000'],pare:['stop','#ed3345'],
 preferencia:['yield','#f6a000'],placa:['sign','#e58d00'],travessia:['crossing','#283440'],
 ferrovia:['rail','#CB713E'],rotatoria:['roundabout','#506879'],obra:['works','#fa8021'],hospital:['medical','#dc3245'],
 saude:['medical','#21a469'],bombeiros:['fire','#ec3a35'],'policia-base':['shield','#2279dc'],
 combustivel:['fuel','#ff8a19'],estacionamento:['parking','#3979BC'],banco:['bank','#596675'],eletroposto:['bolt','#15956b'],
 'relato-transito':['traffic','#d54c3b'],'relato-obra':['works','#fa8021'],
 'relato-acidente':['incident','#dc3546'],'relato-risco':['alert','#dc3546'],
 'relato-radar':['camera','#ff781e'],
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
 signal:'<rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="6.4" r="1.3" fill="#f34043" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="#ffcb2a" stroke="none"/><circle cx="12" cy="17.6" r="1.3" fill="#21b55f" stroke="none"/>',
 bump:'<path d="M2 18h20M4 17q2-11 8-11t8 11"/><path d="M9 10v6m6-6v6"/>',
 stop:'<path d="m8 2 8 0 6 6v8l-6 6H8l-6-6V8z"/><path d="M8 12h8"/>',
 yield:'<path d="m12 21 10-18H2z"/><path d="M12 8v5m0 4v.5"/>',
 sign:'<path d="M12 3v18M6 6h12v8H6z"/><path d="M9 10h6"/>',
 crossing:'<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
 rail:'<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
 roundabout:'<circle cx="12" cy="12" r="2.2"/><path d="M7.7 5.6a7.7 7.7 0 0 1 10.7 3.1m-.1 0-.3-3.5m.3 3.5-3.5-.6M19 11.8a7.7 7.7 0 0 1-7 7.8m0 0 2.9 2m-2.9-2 2.8-2.1M9 18.8a7.7 7.7 0 0 1-4.2-10m0 0-2.2 2.6m2.2-2.6 2.9 1.7"/>',
 works:'<path d="M8 3h8l5 18H3zM6 15h12M8 10h8"/>',
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
 market:'<path d="M3 9h18l-2 12H5L3 9ZM5 9l2-5M19 9l-2-5M9 13v4m6-4v4"/>',
 basket:'<path d="M4 10h16l-2 11H6L4 10ZM7 10l4-7m6 7-4-7M9 13v5m6-5v5"/>',
 bag:'<path d="M4 8h16l-1.2 13H5.2L4 8ZM9 10V6a3 3 0 0 1 6 0v4"/>',
 charge:'<rect x="4" y="3" width="12" height="19" rx="2"/><path d="M8 7h4l-3 5h4l-4 6M16 9h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2"/>',
 plug:'<path d="M8 3v5m8-5v5M6 8h12v5a6 6 0 0 1-6 6v3M12 12l-2 3h3l-1 2"/>',
 utensils:'<path d="M4 3v7m3-7v7m3-7v7M4 10h6M7 10v11M17 3c-3 3-3 8 0 10h3V3zM17 13v8"/>',
 burger:'<path d="M4 11a8 8 0 0 1 16 0ZM3 14h18M5 17h14M6 20h12"/>',
 coffee:'<path d="M4 8h13v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8ZM17 10h2a3 3 0 0 1 0 6h-2M8 3v3m4-4v4"/>',
 bed:'<path d="M3 5v16M21 14v7M3 17h18M7 10h5a2 2 0 0 1 2 2v5H7zM14 13h7v4h-7"/>',
 school:'<path d="M3 9 12 3l9 6v12H3zM9 21v-7h6v7M7 11h1m8 0h1"/>',
 fitness:'<path d="M2 10v4M5 7v10M8 9v6m8-6v6m3-8v10m3-7v4M8 12h8"/>',
 trees:'<path d="m6 3-4 8h3l-3 5h8l-3-5h3L6 3ZM17 5l-4 7h3l-3 5h8l-3-5h3l-4-7ZM6 16v6m11-5v5"/>',
 paw:'<circle cx="7" cy="6" r="1"/><circle cx="12" cy="4" r="1"/><circle cx="17" cy="6" r="1"/><circle cx="20" cy="10" r="1"/><path d="M12 11c-3 0-3 5-6 6-1 2 0 4 3 4l3-1 3 1c3 0 4-2 3-4-3-1-3-6-6-6Z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 7 8-7"/>',
 wash:'<path d="M6 15 8 9h8l2 6M5 15h14v5H5zM8 20h1m6 0h1M7 3v2m5-3v3m5-2v2"/>',
 bus:'<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M7 8h10M8 16h1m6 0h1M7 20v2m10-2v2M9 5h6"/>',
 train:'<rect x="5" y="2" width="14" height="18" rx="4"/><path d="M8 6h8M8 11h8M8 16h1m6 0h1M8 20l-3 3m11-3 3 3"/>',
 railstation:'<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M7 7h10M7 12h10M8 16h1m6 0h1M8 19l-3 4m11-4 3 4"/>',
 plane:'<path d="m22 3-8 8-9-4-2 2 8 6-4 5 1 1 6-4 6 4 2-2-4-9 4-8Z"/>'
};
export function iconMeta(type){return ICON_THEME[type]||['alert','#616a70'];}
export function iconSvg(type){
 const [glyph,color]=iconMeta(type);
 const inner=GLYPHS[glyph]||GLYPHS.alert;
 return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';
}
/** World-anchored 20m-ish cells: unchanged while zooming, rotating or
 * moving the camera. Suppress exact/near duplicates, NOT entire icon categories.
 * Display coverage is limited by REAL loaded provider records, not zoom gating.
 */
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
export function selectPublicPins(features=[],project=()=>null,zoom=12.4,max=52,viewport=null){
 if(!Array.isArray(features)||!Number.isFinite(zoom))return [];
 const candidates=features.filter(f=>Array.isArray(f?.coords)&&f.coords.length===2&&ICON_THEME[f.type]);
 // Reserve a reasonable share for hospitals/fuel/health services even if the
 // visible tile happens to have hundreds of signals with higher priorities.
 const services=new Set(['hospital','saude','bombeiros','policia-base','combustivel','eletroposto','estacionamento','farmacia','escola','estacao-recarga','carregador-eletrico']);
 const urgent=new Set(['radar','relato-acidente','relato-risco','relato-obra','relato-transito','relato-radar']);
 const compare=(a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.id).localeCompare(String(b.id));
 const important=candidates.filter(x=>urgent.has(x.type)).sort(compare);
 const reserved=candidates.filter(x=>services.has(x.type)).sort(compare);
 const rest=candidates.filter(x=>!urgent.has(x.type)&&!services.has(x.type)).sort(compare);
 const serviceSlots=Math.max(10,Math.floor(max*.28));
 const ordered=[...important,...reserved.slice(0,serviceSlots),...rest,...reserved.slice(serviceSlots)];
 const output=[],occupied=new Set();
 for(const f of ordered){
  if(output.length>=max)break;
  let p;
  try{p=project(f.coords);}catch{continue;}
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
  if(viewport&&Number.isFinite(viewport.width)&&Number.isFinite(viewport.height)&&
   (p.x< -36||p.y< -36||p.x>viewport.width+36||p.y>viewport.height+36))continue;
  const cell=stableWorldCell(f.coords,zoom);
  if(!cell||occupied.has(cell))continue;
  occupied.add(cell);output.push(f);
 }
 // Urgent locations never lose their slot just because a dense POI layer was
 // loaded later; re-rank the final list to make draw order deterministic.
 return output.sort(compare);
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
