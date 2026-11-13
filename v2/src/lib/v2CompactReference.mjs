/** Orange low-poly hatchback built directly as 3D triangles from the approved
 * VANO car reference. Keep the car at the same local origin and scale:
 * front -Z, rear +Z, total 3.662m. No camera/GPS logic is touched.
 */
const SCALE=4096;
export const REFERENCE_COMPACT_PALETTE=Object.freeze({
 orange:[255,122,26],orangeLight:[255,140,43],orangeShade:[239,105,18],
 orangeSide:[245,112,20],orangeRoof:[255,128,30],
 glass:[31,45,67],glassFront:[34,49,71],glassRear:[29,42,62],
 glassSide:[27,40,60],glassReflection:[44,59,82],
 tire:[36,39,42],tireSide:[47,50,53],tireHub:[65,69,72],
 tail:[194,34,39],tailLight:[212,48,50],bumper:[39,42,44],
 headlight:[224,229,218]
});
const P=REFERENCE_COMPACT_PALETTE,vertices=[];
function triangle(a,b,c,color){
 const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
 const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const len=Math.hypot(...cross);
 if(len<1e-7)return; // Do not emit degenerate faces from collinear polygon edges.
 const normal=cross.map(x=>Math.round(x/len*127));
 for(const position of [a,b,c])vertices.push({position,normal,color:P[color]});
}
function quad(a,b,c,d,color){triangle(a,b,c,color);triangle(a,c,d,color);}
function poly(points,color){for(let i=1;i<points.length-1;i++)triangle(points[0],points[i],points[i+1],color);}
// Wide, short, faceted toy-hatchback body with bevelled corners.
const stations=[
 [-1.831,.76,.82],[-1.67,.85,.92],[-1.32,.91,.98],[-.90,.94,1],
 [-.30,.95,1],[.50,.96,1],[1.12,.96,.99],[1.59,.95,.94],[1.831,.83,.85]
];
function ring([z,w,h]){
 return [[-w*.79,.245,z],[-w,.34,z],[-w,.74,z],[-w*.91,h-.045,z],
   [0,h+.057,z],[w*.91,h-.045,z],[w,.74,z],[w,.34,z],[w*.79,.245,z],[0,.245,z]];
}
const loops=stations.map(ring);
for(let i=0;i<loops.length-1;i++)for(let j=0;j<10;j++){
 const k=(j+1)%10;
 const color=[2,3,4,5].includes(j)?'orangeLight':
   [1,6].includes(j)?'orangeSide':[0,7].includes(j)?'orangeShade':'orange';
 quad(loops[i][j],loops[i+1][j],loops[i+1][k],loops[i][k],color);
}
poly(loops[0].slice().reverse(),'orangeShade');poly(loops.at(-1),'orange');
// Geometric orange A/C pillars enclosing the oversize continuous navy glass.
const frontBaseL=[-.77,1.075,-1.18],frontBaseR=[.77,1.075,-1.18];
const frontRoofL=[-.65,1.73,-.60],frontRoofR=[.65,1.73,-.60];
const rearRoofL=[-.65,1.735,.50],rearRoofR=[.65,1.735,.50];
const rearBaseL=[-.79,1.075,1.28],rearBaseR=[.79,1.075,1.28];
quad(frontBaseL,frontBaseR,frontRoofR,frontRoofL,'orangeRoof');
quad(frontRoofL,frontRoofR,rearRoofR,rearRoofL,'orangeRoof');
quad(rearRoofL,rearRoofR,rearBaseR,rearBaseL,'orangeShade');
for(const side of [-1,1]){
 const f0=side<0?frontBaseL:frontBaseR,f1=side<0?frontRoofL:frontRoofR;
 const r1=side<0?rearRoofL:rearRoofR,r0=side<0?rearBaseL:rearBaseR;
 quad(f0,f1,r1,r0,side<0?'orangeShade':'orangeSide');
}
// Panes project beyond the orange shell: no z-fighting or orange diagonal
// leaking through the glass at shallow map pitches.
quad([-.665,1.09,-1.202],[.665,1.09,-1.202],
 [.553,1.744,-.630],[-.553,1.744,-.630],'glassFront'); // windshield
quad([-.56,1.745,-.57],[.56,1.745,-.57],
 [.555,1.746,.495],[-.555,1.746,.495],'glass'); // navy roof glass
quad([-.555,1.752,.530],[.555,1.752,.530],
 [.69,1.09,1.324],[-.69,1.09,1.324],'glassRear'); // wraparound rear glass
quad([-.53,1.748,-.012],[.53,1.748,-.012],
 [.53,1.749,.010],[-.53,1.749,.010],'glassReflection'); // subtle glass division
for(const side of [-1,1]){
 const s=n=>side*n;
 // Wide orange window frames, simple tinted trapezoids on both sides.
 quad([s(.784),1.20,-1.06],[s(.683),1.712,-.565],
   [s(.679),1.715,-.058],[s(.801),1.205,-.045],'glassSide');
 quad([s(.801),1.205,.075],[s(.676),1.718,.079],
   [s(.676),1.718,.467],[s(.801),1.206,1.045],'glassSide');
 poly([[s(.799),1.208,.56],[s(.711),1.53,.57],
   [s(.812),1.21,.93]],'glassSide');
}
quad([-.59,1.758,-.61],[.59,1.758,-.61],
 [.61,1.764,-.51],[-.61,1.764,-.51],'orangeRoof');
// Large trapezoidal matte-black lower rear bumper.
poly([[-.58,.34,1.840],[.58,.34,1.840],
 [.72,.245,1.839],[-.72,.245,1.839]],'bumper');
// Distinct red, slanted tail lights on the broad low-poly rear hatch.
for(const side of [-1,1]){
 const x=n=>side*n;
 poly([[x(.39),.89,1.839],[x(.77),.885,1.838],
   [x(.72),.704,1.844],[x(.45),.725,1.844]],'tail');
 poly([[x(.42),.876,1.845],[x(.72),.87,1.844],
   [x(.68),.834,1.849],[x(.45),.839,1.849]],'tailLight');
 // Low-key front headlights (not visible from trailing navigation camera).
 poly([[x(.40),.87,-1.831],[x(.68),.845,-1.832],
   [x(.72),.78,-1.833],[x(.47),.80,-1.835]],'headlight');
}
// Solid, rectangular orange mirror housings instead of thin details.
function cuboid(x0,x1,y0,y1,z0,z1,color){
 const A=[x0,y0,z0],B=[x1,y0,z0],C=[x1,y1,z0],D=[x0,y1,z0],
 E=[x0,y0,z1],F=[x1,y0,z1],G=[x1,y1,z1],H=[x0,y1,z1];
 quad(A,B,C,D,color);quad(E,H,G,F,color);quad(A,E,F,B,color);
 quad(B,F,G,C,color);quad(C,G,H,D,color);quad(D,H,E,A,color);
}
for(const side of [-1,1]){
 cuboid(side<0?-1.18:.89,side<0?-.89:1.18,
   1.20,1.35,-.92,-.65,'orange');
}
// Thick black disc-shaped wheels. No chrome rims or sporting spokes.
function wheel(x,y,z,sign){
 const segments=14,radius=.355,outer=x+sign*.18,inner=x-sign*.055;
 const circle=(side,r,color)=>{
  const xx=x+sign*side;
  for(let i=0;i<segments;i++){
   const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
   triangle([xx,y,z],[xx,y+Math.sin(a)*r,z+Math.cos(a)*r],
    [xx,y+Math.sin(b)*r,z+Math.cos(b)*r],color);
  }
 };
 for(let i=0;i<segments;i++){
  const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
  quad([inner,y+Math.sin(a)*radius,z+Math.cos(a)*radius],
   [outer,y+Math.sin(a)*radius,z+Math.cos(a)*radius],
   [outer,y+Math.sin(b)*radius,z+Math.cos(b)*radius],
   [inner,y+Math.sin(b)*radius,z+Math.cos(b)*radius],i%3===0?'tireSide':'tire');
 }
 circle(.18,radius,'tireSide');circle(.188,.24,'tire');
 circle(.191,.098,'tireHub');
}
for(const sign of [-1,1]){
 wheel(sign*.91,.40,-1.26,sign);
 wheel(sign*.93,.40,1.25,sign);
}
export const REFERENCE_COMPACT_VERTEX_COUNT=vertices.length;
export const REFERENCE_COMPACT_TRIANGLES=vertices.length/3;
let cache;
export function referenceCompactVertexBytes(){
 if(cache)return cache;
 const out=new Uint8Array(vertices.length*12),view=new DataView(out.buffer);
 for(let i=0;i<vertices.length;i++){
  const {position,normal,color}=vertices[i],offset=i*12;
  for(let axis=0;axis<3;axis++){
   const value=Math.round(position[axis]*SCALE);
   if(!Number.isFinite(value)||Math.abs(value)>32767)throw Error('Compact geometry overflow');
   view.setInt16(offset+axis*2,value,true);
   view.setInt8(offset+6+axis,normal[axis]);
   out[offset+9+axis]=color[axis];
  }
 }
 cache=out;return cache;
}
