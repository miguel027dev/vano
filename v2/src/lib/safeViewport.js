/** Responsive camera padding around actual map overlays, never around guessed phone sizes.
 * Rects use map-relative CSS pixels and an explicit top/bottom edge.
 */
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function computeSafeViewport({width,height,overlays=[],navigation=false,motorcycle=false,markerRadius=42}={}) {
  const w=Number.isFinite(width)?Math.max(1,width):360;
  const h=Number.isFinite(height)?Math.max(1,height):640;
  const guard=clamp(markerRadius+12,30,68);
  let top=clamp(24+h*.018,24,42),bottom=clamp(30+h*.025,30,50);
  for(const r of overlays){
    if(!r||!Number.isFinite(r.top)||!Number.isFinite(r.bottom))continue;
    if(r.edge==='top')top=Math.max(top,clamp(r.bottom+guard,0,h));
    if(r.edge==='bottom')bottom=Math.max(bottom,clamp(h-r.top+guard,0,h));
  }
  // Leave a useful center area on short landscape / small phones. A safe camera
  // cannot physically fit through two touching cards; the available area wins.
  const minCenter=clamp(h*.23,75,158),available=Math.max(0,h-minCenter);
  if(top+bottom>available){
    const ratio=available/Math.max(1,top+bottom);
    top*=ratio;bottom*=ratio;
  }
  const horizontal=clamp(w*.06,14,28);
  // Moto Focus anchors the rider slightly lower in the AVAILABLE map area,
  // never in the raw viewport that also contains navigation overlays.
  if(motorcycle){
    const usable=h-top-bottom;
    const extra=Math.max(0,usable-minCenter);
    top+=Math.min(usable*.22,extra);
  }
  const padding={top:Math.round(top),bottom:Math.round(bottom),left:Math.round(horizontal),right:Math.round(horizontal)};
  const centerY=(padding.top+h-padding.bottom)/2;
  const visibleHeight=Math.max(0,h-padding.top-padding.bottom);
  // Pixel clearance behind the projected GPS arrow. Camera look-ahead is
  // bounded by this, preventing high-speed follow from pushing it under cards.
  const maxBehindPx=Math.max(0,visibleHeight/2-guard);
  return {padding,centerY,visibleHeight,maxBehindPx,
    compact:visibleHeight<170,markerRadius:guard,mode:navigation?'navigating':'free'};
}

/** Monitor projected marker vs. interface obstacles without adjusting GPS coordinates. */
export function markerIntersectsOverlay(point,overlay,diameter=82,clearance=10){
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!overlay)return false;
  const radius=diameter/2+clearance;
  return point[0]+radius>overlay.left&&point[0]-radius<overlay.right
    &&point[1]+radius>overlay.top&&point[1]-radius<overlay.bottom;
}
