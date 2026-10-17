/** VANO community occurrences — shared, dependency-free reporting policy. */
export const REPORT_TYPES=Object.freeze([
  {id:'via_fechada',name:'Rua fechada',color:'#de5c4d',ttlMinutes:2160},
  {id:'transito',name:'Trânsito',color:'#da9136',ttlMinutes:120},
  {id:'fiscalizacao',name:'Blitz',color:'#6684c5',ttlMinutes:180},
  {id:'acidente',name:'Acidente',color:'#d16a44',ttlMinutes:480},
  {id:'alagamento',name:'Alagamento',color:'#418dc3',ttlMinutes:720},
  {id:'obstaculo',name:'Obstáculo',color:'#8e7ec7',ttlMinutes:480}
]);
const BY_TYPE=new Map(REPORT_TYPES.map(type=>[type.id,type]));
const PATHS={
  via_fechada:'<path d="M4 9h16v6H4zM6 15v5m12-5v5M7 9V6m10 3V6"/><path d="m6.5 14 3-5m2 5 3-5m2 5 2.5-4"/>',
  transito:'<path d="M4 16V9.8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V16l-2 2H6zM6 18v2m12-2v2M4 12h16M7 7.8V5h10v2.8"/><path d="M8 15h1m6 0h1"/>',
  fiscalizacao:'<path d="M12 3 4.5 6v6c0 5 3.5 7.8 7.5 9 4-1.2 7.5-4 7.5-9V6z"/><path d="M9 12h6m-3-3v6"/>',
  acidente:'<path d="M12 3 2 20h20z"/><path d="M12 9v5m0 3h.01" stroke-width="2.5"/><path d="m5.5 15-2-1m15 1 2-1"/>',
  alagamento:'<path d="M12 3c-2.5 3.3-4.5 5.8-4.5 8.2a4.5 4.5 0 0 0 9 0C16.5 8.8 14.5 6.3 12 3z"/><path d="M2.5 19c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 5 0M3 22c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/>',
  obstaculo:'<path d="m9 5 6 0 5 15H4zM7.2 11h9.6M5.8 16h12.4M8 5 10 2h4l2 3"/>'
};
export const isReportType=type=>BY_TYPE.has(type);
export const reportType=type=>BY_TYPE.get(type)||null;
export function reportIconSvg(type){
  const path=PATHS[type]||PATHS.obstaculo;
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
export function reportExpiration(record){
  const created=Date.parse(record?.createdAt||'');
  const ttl=reportType(record?.type)?.ttlMinutes;
  if(!Number.isFinite(created)||!ttl)return NaN;
  const requested=Date.parse(record?.expiresAt||'');
  return Math.min(created+ttl*60_000,Number.isFinite(requested)?requested:Infinity);
}
export function validReportCoords(point){
  return Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)
    &&Math.abs(point[0])<=180&&Math.abs(point[1])<=85;
}
export function publicReportsInBBox(reports,bbox,now=Date.now()){
  if(!Array.isArray(reports)||!Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite))return [];
  const [west,south,east,north]=bbox;
  return reports.filter(record=>record && isReportType(record.type)
    &&['nao_verificado','verificado'].includes(record.status)
    &&validReportCoords(record.coords)
    &&record.coords[0]>=west&&record.coords[0]<=east&&record.coords[1]>=south&&record.coords[1]<=north
    &&reportExpiration(record)>now)
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
    .slice(0,80).map(record=>({
      id:record.id,type:record.type,
      // Approximate street location. Never expose owner ID, device, or precise GPS.
      coords:record.coords.map(n=>Number(n.toFixed(3))),
      createdAt:record.createdAt,expiresAt:new Date(reportExpiration(record)).toISOString(),
      status:record.status,
      description:String(record.description||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,150)
    }));
}
export function metersApart(a,b){
  if(!validReportCoords(a)||!validReportCoords(b))return Infinity;
  const rad=Math.PI/180,dlon=(a[0]-b[0])*rad,dlat=(a[1]-b[1])*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function closeReports(reports,gps,previousIds=new Set(),now=Date.now()){
  if(!validReportCoords(gps))return [];
  return (Array.isArray(reports)?reports:[]).filter(r=>validReportCoords(r.coords)
    &&isReportType(r.type)&&['nao_verificado','verificado'].includes(r.status)
    &&reportExpiration(r)>now
    &&metersApart(gps,r.coords)<=(previousIds.has(r.id)?750:600))
    .sort((a,b)=>metersApart(gps,a.coords)-metersApart(gps,b.coords)).slice(0,24);
}
export function reportQueryBBox(gps){
  if(!validReportCoords(gps)||Math.abs(gps[1])>70)return null;
  const lat=0.012,lon=Math.min(.032,lat/Math.cos(gps[1]*Math.PI/180));
  return [gps[0]-lon,gps[1]-lat,gps[0]+lon,gps[1]+lat].map(n=>Number(n.toFixed(5))).join(',');
}
