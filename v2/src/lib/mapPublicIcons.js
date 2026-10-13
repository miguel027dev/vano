/** VANO map icon family — small static SVG glyphs in accessible touch targets.
 * Icons are rendered from a closed enum; untrusted tags are never interpolated.
 */
export const ICON_THEME=Object.freeze({
 radar:['camera','#ff781e'],semaforo:['signal','#283f52'],lombada:['bump','#f6a000'],pare:['stop','#ed3345'],
 preferencia:['yield','#f6a000'],placa:['sign','#e58d00'],travessia:['crossing','#375d8f'],
 ferrovia:['rail','#de4f43'],obra:['works','#fa8021'],hospital:['medical','#dc3245'],
 saude:['medical','#21a469'],bombeiros:['fire','#ec3a35'],'policia-base':['shield','#2279dc'],
 combustivel:['fuel','#ff8a19'],estacionamento:['parking','#2e83d1'],eletroposto:['bolt','#15956b'],
 'relato-transito':['traffic','#d54c3b'],'relato-obra':['works','#fa8021'],
 'relato-acidente':['incident','#dc3546'],'relato-risco':['alert','#dc3546'],
 'relato-radar':['camera','#ff781e']
});
const GLYPHS={
 camera:'<rect x="3" y="6" width="15" height="12" rx="2.8"/><circle cx="10.5" cy="12" r="3"/><path d="M20 9q3 3 0 6"/>',
 signal:'<rect x="7" y="2" width="10" height="20" rx="4"/><circle cx="12" cy="6.4" r="1.3" fill="#f34043" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="#ffcb2a" stroke="none"/><circle cx="12" cy="17.6" r="1.3" fill="#21b55f" stroke="none"/>',
 bump:'<path d="M2 18h20M4 17q2-11 8-11t8 11"/><path d="M9 10v6m6-6v6"/>',
 stop:'<path d="m8 2 8 0 6 6v8l-6 6H8l-6-6V8z"/><path d="M8 12h8"/>',
 yield:'<path d="m12 21 10-18H2z"/><path d="M12 8v5m0 4v.5"/>',
 sign:'<path d="M12 3v18M6 6h12v8H6z"/><path d="M9 10h6"/>',
 crossing:'<path d="M3 19h18M7 19l3-7 3 2 3-6M10 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>',
 rail:'<path d="M4 4l16 16M20 4 4 20M2 10h20M12 2v20"/>',
 works:'<path d="M8 3h8l5 18H3zM6 15h12M8 10h8"/>',
 medical:'<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
 fire:'<path d="M12 2q3 6-1 10q5-1 6-5q7 12-4 15Q2 22 5 12q1-4 7-10Z"/>',
 shield:'<path d="M12 2 21 6v7q0 6-9 9q-9-3-9-9V6z"/><path d="m8 13 3 3 5-6"/>',
 fuel:'<path d="M4 21V4h11v17H4Zm0-10h11M15 8h3l3 4v7q0 3-3 2"/>',
 parking:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 18V6h4a4 4 0 0 1 0 8H9"/>',
 bolt:'<path d="M14 2 5 13h7l-2 9 9-12h-7z"/>',
 traffic:'<path d="M3 18h18M6 15V9h12v6M4 9l3-4h10l3 4M6 15h12M6 19v2M18 19v2"/>',
 incident:'<path d="M4 9h7v7H4zM14 9h6v7h-6M11 4l1 4 3-4M5 20h5m4 0h5"/>',
 alert:'<path d="m12 2 10 19H2zM12 9v5m0 3v.6"/>'
};
export function iconMeta(type){return ICON_THEME[type]||['alert','#616a70'];}
export function iconSvg(type){
 const [glyph,color]=iconMeta(type);
 const inner=GLYPHS[glyph]||GLYPHS.alert;
 return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';
}
export function selectPublicPins(features=[],project=()=>null,zoom=15,max=52){
 if(!Array.isArray(features)||!Number.isFinite(zoom)||zoom<13.6)return [];
 const candidates=features.filter(f=>Array.isArray(f?.coords)&&f.coords.length===2&&ICON_THEME[f.type]);
 candidates.sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
 const result=[],occupied=new Set(),size=zoom>=16?35:zoom>=15?42:53;
 for(const f of candidates){
  if(result.length>=max)break;
  if(zoom<14.5&&f.type!=='radar'&&Number(f.priority)<72)continue;
  const pos=project(f.coords);
  if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))continue;
  const cell=Math.floor(pos.x/size)+':'+Math.floor(pos.y/size);
  if(occupied.has(cell))continue;
  occupied.add(cell);result.push(f);
 }
 return result;
}

/** Bound the camera viewport to a small safe geographic query at current zoom. */
export function mapFeatureBBox(map,backend){
 const zoom=map.getZoom();
 if(!Number.isFinite(zoom)||zoom<13.6)return null;
 const center=map.getCenter(),longitude=Number(center.lng),latitude=Number(center.lat);
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(latitude)>84)return null;
 const b=map.getBounds();
 const spanLon=Math.min(.028,(Number(b.getEast())-Number(b.getWest()))/2+.003);
 const spanLat=Math.min(.025,(Number(b.getNorth())-Number(b.getSouth()))/2+.003);
 if(!(spanLat>0&&spanLon>0))return null;
 return [longitude-spanLon,latitude-spanLat,longitude+spanLon,latitude+spanLat].map(n=>+n.toFixed(5));
}
