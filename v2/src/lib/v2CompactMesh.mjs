/** Original uploaded geometry; positions, normals, colors and part IDs remain float32. */
import {createVanoCompacto} from './vanoUploadedCompact.mjs';
const model=createVanoCompacto();
export const COMPACT_LENGTH=model.bounds.length;
export const COMPACT_VERTEX_COUNT=model.vertices;
const vertices=new Float32Array(model.vertices*10);
for(let i=0;i<model.vertices;i++){
 vertices.set(model.positions.subarray(i*3,i*3+3),i*10);
 vertices.set(model.normals.subarray(i*3,i*3+3),i*10+3);
 vertices.set(model.colors.subarray(i*3,i*3+3),i*10+6);
 vertices[i*10+9]=model.partIds[i];
}
export const compactVertexBytes=()=>vertices;
