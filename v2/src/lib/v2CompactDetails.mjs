/** Extra geometry fused into the existing VANO Compacto WebGL mesh.
 * Dimensions/origin and one-draw-call rendering remain unchanged.
 * Faces are double sided via the existing GL state; no textures or new layers.
 */
const POS_SCALE=4096;
const LIGHT=[222,236,244],GLASS=[28,54,72],GLASS_LIGHT=[60,98,119];
const TRIM=[25,31,37],RUBBER=[31,34,37],CHROME=[198,209,216];
const BODY_EDGE=[242,144,55],WHEEL=[124,139,150],SPOKE=[207,215,220];
const REAR=[242,47,35],HEAD=[242,247,246],AMBER=[246,169,46];
const PI=Math.PI;
const vertices=[];
function face(a,b,c,color){
 const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const m=Math.hypot(...n);if(m<0.000001)return;
 const normal=n.map(x=>Math.round(x/m*127));
 for(const p of [a,b,c])vertices.push({p,normal,color});
}
function quad(a,b,c,d,color){face(a,b,c,color);face(a,c,d,color);}
function strip(a,b,width,color){
 const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d);if(len<0.000001)return;
 // Thin 3D trim strip in the surface's near-tangent vertical plane.
 const w=width/2,offset=[-d[2]/len*w,0,d[0]/len*w];
 quad(a.map((v,i)=>v+offset[i]),b.map((v,i)=>v+offset[i]),
   b.map((v,i)=>v-offset[i]),a.map((v,i)=>v-offset[i]),color);
}
function bar(a,b,width,height,color){
 const z0=height*.5,x=width*.5;
 // Clockwise rectangle with consistent face normals is not required (no culling).
 quad([a[0]-x,a[1]-z0,a[2]],[b[0]-x,b[1]-z0,b[2]],
 [b[0]+x,b[1]+z0,b[2]],[a[0]+x,a[1]+z0,a[2]],color);
}
function discX(x,y,z,r,color,segments=12){
 for(let i=0;i<segments;i++){
  const a=i*2*PI/segments,b=(i+1)*2*PI/segments;
  face([x,y,z],[x,y+Math.sin(a)*r,z+Math.cos(a)*r],
    [x,y+Math.sin(b)*r,z+Math.cos(b)*r],color);
 }
}
function makeWheel(sign,z){
 const x=sign*1.007,y=.445;
 discX(x,y,z,.295,RUBBER,20);
 discX(x+sign*.008,y,z,.231,WHEEL,20);
 discX(x+sign*.014,y,z,.17,TRIM,16);
 for(let k=0;k<10;k++){
  const a=k*2*PI/10,b=a+.07,rr=.172;
  quad([x+sign*.021,y+Math.sin(a)*.047,z+Math.cos(a)*.047],
   [x+sign*.021,y+Math.sin(a)*rr,z+Math.cos(a)*rr],
   [x+sign*.021,y+Math.sin(b)*rr,z+Math.cos(b)*rr],
   [x+sign*.021,y+Math.sin(b)*.047,z+Math.cos(b)*.047],SPOKE);
 }
 discX(x+sign*.026,y,z,.055,CHROME,12);
}
// Windshield: the existing dark 3D glass is retained; add subtle highlight
// wedges, surround/upper tint and two raised black wiper blades.
quad([-.43,1.812,-.865],[-.11,1.816,-.865],
 [-.21,1.295,-1.326],[-.51,1.295,-1.326],GLASS_LIGHT);
quad([-.44,1.817,-.866],[.43,1.817,-.866],
 [.47,1.325,-1.305],[-.47,1.325,-1.305],GLASS);
quad([-.40,1.819,-.870],[-.21,1.819,-.870],
 [-.29,1.365,-1.270],[-.48,1.365,-1.270],GLASS_LIGHT);
// Windshield upper sun strip and side seals.
quad([-.46,1.826,-.863],[.46,1.826,-.863],
 [.50,1.755,-.925],[-.50,1.755,-.925],TRIM);
quad([-.515,1.32,-1.315],[-.479,1.32,-1.315],
 [-.443,1.823,-.869],[-.473,1.823,-.869],TRIM);
quad([.479,1.32,-1.315],[.515,1.32,-1.315],
 [.473,1.823,-.869],[.443,1.823,-.869],TRIM);
bar([-.48,1.33,-1.313],[.08,1.335,-1.303],.022,.018,RUBBER);
bar([.48,1.337,-1.311],[-.04,1.344,-1.297],.022,.018,RUBBER);
// Rear hatch glass, highlight and rear-window defogger threads.
quad([-.46,1.835,.658],[.46,1.835,.658],
 [.52,1.305,1.268],[-.52,1.305,1.268],GLASS);
quad([-.39,1.830,.671],[-.08,1.83,.671],
 [-.23,1.345,1.229],[-.48,1.345,1.229],GLASS_LIGHT);
for(const y of [.18,.37,.56,.75]){
 const t=y;
 const z=.674+(1.253-.674)*t,alt=1.837+(1.307-1.837)*t;
 bar([-.38-(t*.10),alt,z],[.38+(t*.10),alt,z],.009,.009,CHROME);
}
// Detailed left and right glass, twin doors and recessed B pillars.
for(const sign of [-1,1]){
 const x=n=>sign*n;
 // Side window upper and lower edges are copied from the original roof geometry.
 quad([x(.682),1.715,.555],[x(.788),1.234,.899],
   [x(.805),1.23,.18],[x(.675),1.722,.145],GLASS);
 quad([x(.676),1.720,.065],[x(.814),1.234,.055],
   [x(.795),1.214,-1.140],[x(.646),1.738,-.713],GLASS);
 // Side glass reflections on fore and aft upper edges.
 quad([x(.688),1.705,.51],[x(.718),1.553,.62],
   [x(.806),1.246,.49],[x(.803),1.246,.34],GLASS_LIGHT);
 quad([x(.676),1.713,-.064],[x(.704),1.57,-.136],
   [x(.785),1.248,-.84],[x(.773),1.247,-1.03],GLASS_LIGHT);
 // Pillars, window surrounds and B-pillar: thin dark non-animated geometry.
 quad([x(.668),1.728,.086],[x(.688),1.728,.086],
   [x(.822),1.216,.086],[x(.793),1.216,.086],TRIM);
 quad([x(.645),1.742,-.735],[x(.667),1.742,-.735],
   [x(.808),1.215,-1.149],[x(.785),1.215,-1.149],TRIM);
 // Split side door seams, door handles with inset shadows.
 quad([x(.854),1.11,.06],[x(.860),1.11,.072],
   [x(.865),.52,.072],[x(.859),.52,.06],BODY_EDGE);
 for(const z of [-.62,.81]){
  quad([x(.871),1.085,z-.12],[x(.892),1.085,z-.12],
   [x(.892),1.085,z+.12],[x(.871),1.085,z+.12],TRIM);
  quad([x(.895),1.093,z-.08],[x(.895),1.093,z+.08],
   [x(.895),1.11,z+.08],[x(.895),1.11,z-.08],CHROME);
 }
 // Small realistic orange side repeater embedded in the existing mirror.
 quad([x(1.09),1.251,-.962],[x(1.132),1.251,-.962],
   [x(1.132),1.272,-.955],[x(1.09),1.272,-.955],AMBER);
 makeWheel(sign,-1.1);makeWheel(sign,1.17);
 // Two-piece swept LED headlights over front headlight corners.
 quad([x(.44),.883,-1.806],[x(.593),.863,-1.787],
   [x(.649),.805,-1.761],[x(.46),.825,-1.799],HEAD);
 quad([x(.51),.860,-1.806],[x(.635),.830,-1.778],
   [x(.653),.811,-1.773],[x(.529),.831,-1.804],CHROME);
 // Tail lamp glass and corner reflector.
 quad([x(.45),.932,1.870],[x(.706),.956,1.840],
   [x(.725),.856,1.829],[x(.48),.840,1.870],REAR);
 quad([x(.48),.944,1.874],[x(.663),.953,1.850],
   [x(.676),.938,1.843],[x(.50),.932,1.872],HEAD);
}
// Windshield grille, emblem, bonnet edge and lower rear hatch seams.
for(let i=-4;i<=4;i++){
 const x=i*.086;
 bar([x,.592,-1.803],[x,.775,-1.801],.018,.020,TRIM);
}
bar([-.50,.571,-1.807],[.50,.571,-1.807],.032,.024,CHROME);
bar([-.37,.807,-1.806],[.37,.807,-1.806],.012,.013,TRIM);
bar([-.62,.50,1.834],[.62,.50,1.834],.021,.015,TRIM);
quad([-.15,1.861,-.82],[.15,1.861,-.82],
 [.12,1.865,-.74],[-.12,1.865,-.74],CHROME);
// Stabilize door/roof outlines with geometric strips, without increasing size.
strip([-.52,1.867,-.74],[.52,1.867,-.74],.014,CHROME);
strip([-.50,1.865,.63],[.50,1.865,.63],.014,CHROME);

export const COMPACT_DETAIL_VERTEX_COUNT=vertices.length;
export const COMPACT_DETAIL_TRIANGLES=vertices.length/3;
export function compactDetailVertexBytes(){
 const out=new Uint8Array(vertices.length*12),view=new DataView(out.buffer);
 for(let i=0;i<vertices.length;i++){
  const {p,normal,color}=vertices[i],at=i*12;
  for(let j=0;j<3;j++){
   const v=Math.round(p[j]*POS_SCALE);
   if(!Number.isFinite(v)||v< -32768||v>32767)throw Error('Compact detail vertex bounds');
   view.setInt16(at+j*2,v,true);view.setInt8(at+6+j,normal[j]);out[at+9+j]=color[j];
  }
 }
 return out;
}
