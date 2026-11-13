/** Approved VANO artwork. Viewports reuse one cached atlas without redrawing icons.
 * The closed catalog never interpolates user-provided markup or URLs. */
const ATLAS='/assets/incidents/vano-incidents-6a217198.png';
const POLICE='/assets/incidents/vano-police-ff9ba5ef.png';
const CELLS=Object.freeze({
  acidente:['0 225 445 355',ATLAS,1254,1254],
  obstaculo:['455 205 355 375',ATLAS,1254,1254],
  fiscalizacao:['305 138 920 740',POLICE,1536,1024],
  alagamento:['5 710 410 370',ATLAS,1254,1254],
  via_fechada:['433 700 390 365',ATLAS,1254,1254],
  transito:['835 675 419 400',ATLAS,1254,1254]
});
export function reportArtworkSvg(type){
  const [viewBox,href,width,height]=CELLS[type]||CELLS.obstaculo;
  return `<svg class="vano-report-artwork" viewBox="${viewBox}" width="48" height="48" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><image href="${href}" width="${width}" height="${height}"/></svg>`;
}
/** Keep illustrations facing the driver; only their visual scale follows depth.
 * Transform the inner artwork, never Mapbox's position-bearing outer element. */
export function reportArtworkScale(zoom=16,pitch=0,screenY=.7){
  const z=Number.isFinite(zoom)?zoom:16;
  const p=Number.isFinite(pitch)?Math.max(0,Math.min(85,pitch)):0;
  const y=Number.isFinite(screenY)?Math.max(0,Math.min(1,screenY)):.7;
  const zoomScale=Math.max(.78,Math.min(1.04,.88+(z-14)*.04));
  return Math.max(.68,Math.min(1.04,zoomScale*(1-(p/85)*(1-y)*.18)));
}
