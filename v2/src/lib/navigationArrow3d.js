/** VANO Atlas 3D — procedural marker, not a raster sprite.
 * One local SVG coordinate system at every heading. The Mapbox Marker maps
 * this plane to the camera pitch; stacked contours make the rim extruded.
 * All paths and gradients are static. No GPS/location data is rendered here.
 */
export const NAV_ARROW_VIEW_BOX='0 0 80 100';
export const NAV_ARROW_OUTLINE='M40 10 Q43 10 45 14 L72 66 Q76 72 71 75 Q69 77 65 75 L40 67 L15 75 Q10 77 8 73 Q6 70 9 65 L35 14 Q37 10 40 10 Z';

export function navigationArrowSvg(){
  const outline=NAV_ARROW_OUTLINE;
  return `<svg class="vano-arrow3d-svg" viewBox="${NAV_ARROW_VIEW_BOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="vano-arrow3d-side" x1="0" y1="0" x2=".12" y2="1">
        <stop offset="0" stop-color="#d3dce1"/><stop offset=".5" stop-color="#a5b3bf"/><stop offset="1" stop-color="#647580"/>
      </linearGradient>
      <linearGradient id="vano-arrow3d-rim" x1=".2" y1="0" x2=".76" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f8fbfd"/><stop offset="1" stop-color="#d8e2e7"/>
      </linearGradient>
      <linearGradient id="vano-arrow3d-orange" x1=".18" y1=".04" x2=".82" y2=".94">
        <stop offset="0" stop-color="#ffb065"/><stop offset=".32" stop-color="#ff851b"/><stop offset="1" stop-color="#f36a06"/>
      </linearGradient>
    </defs>
    <ellipse class="vano-arrow3d-shadow" cx="40" cy="88" rx="25" ry="6" fill="#23302d" opacity=".18"/>
    <path class="vano-arrow3d-extrusion" d="${outline}" transform="translate(0 9)" fill="url(#vano-arrow3d-side)" stroke="#8494a1" stroke-width="1.4"/>
    <path d="${outline}" transform="translate(0 5)" fill="#d2dce2" opacity=".96"/>
    <path class="vano-arrow3d-rim" d="${outline}" fill="url(#vano-arrow3d-rim)" stroke="#f6f9fa" stroke-width="1.4"/>
    <path class="vano-arrow3d-face" d="M40 19 Q42 19 43 22 L64 65 Q65 68 61 66 L42 59 Q40 58 38 59 L19 66 Q15 68 17 64 L37 22 Q38 19 40 19 Z"
      fill="url(#vano-arrow3d-orange)" stroke="#f96d09" stroke-width=".8"/>
    <path d="M39 23 Q40 20 41 23 L58 56" fill="none" stroke="#ffdeb0" stroke-width="2" stroke-linecap="round" opacity=".46"/>
  </svg>`;
}
