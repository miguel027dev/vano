/** V2-only native WebGL marker. Shares the map context and existing GPS animation.
 * No extra renderer, canvas, RAF, textures, GLB loader or third-party dependency.
 */
export const V2_COMPACT_ID='vano-v2-compact';
const validPoint=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<85.051129;
export const compactEnabled=d=>Boolean(d?.active!==false&&d?.v2Experience&&d?.vehicle==='carro');
export function compactScreenLength(width=400){return width<390?46:52;}
export function compactWorldScale({zoom=17,pitch=0,width=400,length=3.7}={}){
 const safeZoom=Number.isFinite(zoom)?Math.max(0,Math.min(24,zoom)):17;
 const safePitch=Number.isFinite(pitch)?Math.max(0,Math.min(85,pitch)):0;
 // Compensate foreshortening gently; never inflate the car at steep pitch.
 const compensation=Math.max(.70,Math.cos(safePitch*Math.PI/180));
 return compactScreenLength(width)/(512*2**safeZoom*length*compensation);
}
export function compactModelMatrix(point,heading,scale,out=new Float64Array(16)){
 const a=(Number.isFinite(heading)?heading:0)*Math.PI/180,c=Math.cos(a)*scale,s=Math.sin(a)*scale;
 // Model -Z points north, Y becomes altitude; clockwise bearings turn east.
 out.set([c,s,0,0, 0,0,scale,0, -s,c,0,0, point.x,point.y,point.z||0,1]);return out;
}
export function multiplyMatrices(a,b,out=new Float32Array(16)){
 for(let column=0;column<4;column++)for(let row=0;row<4;row++){
  let v=0;for(let k=0;k<4;k++)v+=a[k*4+row]*b[column*4+k];out[column*4+row]=v;
 }return out;
}
const VERTEX=`attribute vec3 position,normal,color;
uniform mat4 matrix;uniform vec3 light;varying vec3 shade;
void main(){vec3 n=normalize(normal);float lit=.70+.30*abs(dot(n,light));
shade=color*lit;gl_Position=matrix*vec4(position/4096.,1.);}`;
const FRAGMENT=`precision mediump float;varying vec3 shade;
void main(){gl_FragColor=vec4(shade,1.);}`;
let meshPromise;
const loadMesh=()=>meshPromise??=(import('./v2CompactMesh.mjs'));

export function createCompactLayer(mesh,mapboxgl,state){
 const model=new Float64Array(16),matrix=new Float32Array(16);
 let map,gl,program,buffer,vao,locations,drawn=false;
 const shaders=[];
 const dispose=()=>{if(!gl)return;try{if(vao)gl.deleteVertexArray(vao);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);}catch{}vao=buffer=program=null;shaders.length=0;drawn=false;};
 const compile=(type,source)=>{const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('compact shader');return shader;};
 const layer={id:V2_COMPACT_ID,type:'custom',renderingMode:'3d',
  get ready(){return drawn&&!state.failed;},
  onAdd(instance,context){map=instance;gl=context;
   try{
    if(typeof gl.createVertexArray!=='function')throw Error('compact needs WebGL2');
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('compact program');
    vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.compactVertexBytes(),gl.STATIC_DRAW);
    for(const [name,type,normalized,offset] of [['position',gl.SHORT,false,0],['normal',gl.BYTE,true,6],['color',gl.UNSIGNED_BYTE,true,9]]){
     const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,type,normalized,12,offset);
    }
    locations={matrix:gl.getUniformLocation(program,'matrix'),light:gl.getUniformLocation(program,'light')};gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
   }catch{state.failed=true;dispose();}
  },
  render(context,projection){
   if(state.failed||!state.enabled||!program||!validPoint(state.point))return;
   // Current Mapbox versions provide a matrix; tolerate the projection wrapper too.
   const view=projection?.defaultProjectionData?.mainMatrix||projection;
   if(view?.length!==16)return;
   try{
    const origin=mapboxgl.MercatorCoordinate.fromLngLat(state.point,.12);
    const scale=compactWorldScale({zoom:map.getZoom(),pitch:map.getPitch(),width:map.getCanvas().clientWidth,length:mesh.COMPACT_LENGTH});
    compactModelMatrix(origin,state.heading,scale,model);multiplyMatrices(view,model,matrix);
    // Combine in double precision on CPU before uploading: no world-origin jitter.
    gl.useProgram(program);gl.bindVertexArray(vao);gl.uniformMatrix4fv(locations.matrix,false,matrix);
    const a=(state.heading||0)*Math.PI/180;
    gl.uniform3f(locations.light,-.35*Math.cos(a)-.25*Math.sin(a),.902,.35*Math.sin(a)-.25*Math.cos(a));
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
    gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES,0,mesh.COMPACT_VERTEX_COUNT);drawn=true;
    gl.bindVertexArray(null);gl.useProgram(null);
    // Mapbox resets its tracked GL state after custom layers. Never clear its depth/color.
   }catch{state.failed=true;drawn=false;}
  },
  onRemove(){dispose();}
 };return layer;
}

/** Returns true only after a native car has rendered; caller then hides the arrow.
 * Failure or a style switch immediately restores the existing location marker.
 */
export function syncV2Compact(map,mapboxgl,data,point,heading=0,visible=true){
 const enabled=visible&&compactEnabled(data)&&validPoint(point)&&(!map.getProjection||map.getProjection()?.name==='mercator');
 let state=map._vanoCompact;
 if(!enabled){if(state){state.enabled=false;if(map.getLayer?.(V2_COMPACT_ID))map.removeLayer(V2_COMPACT_ID);state.layer=null;}return false;}
 if(!state){state=map._vanoCompact={enabled:true,point,heading,failed:false,mesh:null,layer:null,disposed:false,needsOrder:false};
  // Diffed themes emit styledata without necessarily emitting style.load.
  // Compare layer IDs only on style events, outside the animation hot path.
  const styleChanged=()=>{const stamp=map.getStyle?.()?.layers?.map(l=>l.id).join('|');if(stamp!==state.styleStamp){state.styleStamp=stamp;state.needsOrder=true;}};
  map.on?.('styledata',styleChanged);map.on?.('style.load',styleChanged);
  map.once?.('remove',()=>{state.disposed=true;state.enabled=false;map.off?.('styledata',styleChanged);map.off?.('style.load',styleChanged);});
  loadMesh().then(mesh=>{if(!state.disposed){state.mesh=mesh;map.triggerRepaint?.();}}).catch(()=>{state.failed=true;});
 }
 const changed=!state.enabled||state.point?.[0]!==point[0]||state.point?.[1]!==point[1]||state.heading!==heading;
 state.enabled=true;state.point=point;state.heading=Number.isFinite(heading)?heading:0;
 if(state.failed||!state.mesh||state.disposed)return false;
 if(!map.getLayer?.(V2_COMPACT_ID)){
  if(!map.isStyleLoaded?.())return false;
  try{state.layer=createCompactLayer(state.mesh,mapboxgl,state);map.addLayer(state.layer);map.triggerRepaint?.();}catch{state.failed=true;return false;}
 }
 // A diffed style can retain custom layers below its new background. Restore
 // top ordering once per style load, never serialize the style in the RAF loop.
 if(state.needsOrder&&map.isStyleLoaded?.()){
  map.moveLayer?.(V2_COMPACT_ID);state.needsOrder=false;map.triggerRepaint?.();
 }
 if(changed)map.triggerRepaint?.();
 return Boolean(state.layer?.ready);
}
