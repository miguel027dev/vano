"""Bake approved GLB geometry to a dependency-free, one-draw-call marker.
Usage: python3 scripts/pack-compact.py /path/to/VANO_Compacto.glb
"""
import base64,json,struct,sys,hashlib
from pathlib import Path
src=Path(sys.argv[1]);raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);blob=raw[28+n:];out=bytearray();lengths=[]
def accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];assert a['componentType']==5126 and a['type']=='VEC3';return struct.unpack_from('<'+'f'*(a['count']*3),blob,v.get('byteOffset',0)+a.get('byteOffset',0))
def srgb(x):return 12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055
for mesh in doc['meshes']:
 for prim in mesh['primitives']:
  assert 'indices' not in prim
  p=accessor(prim['attributes']['POSITION']);norm=accessor(prim['attributes']['NORMAL']);col=doc['materials'][prim['material']]['pbrMetallicRoughness']['baseColorFactor'][:3];color=bytes(round(max(0,min(1,srgb(x)))*255) for x in col)
  for i in range(0,len(p),3):
   out.extend(struct.pack('<hhhbbb',*(round(x*4096) for x in p[i:i+3]),*(round(max(-1,min(1,x))*127) for x in norm[i:i+3])));out.extend(color);lengths.append(p[i+2])
encoded=base64.b64encode(out).decode();dest=Path(__file__).resolve().parents[1]/'src/lib/v2CompactMesh.mjs'
dest.write_text('// Packed from VANO_Compacto.glb; source SHA256 '+hashlib.sha256(raw).hexdigest()+'\n// Positions: int16 / 4096; normals: normalized int8; sRGB colors: normalized uint8.\nexport const COMPACT_LENGTH='+str(round(max(lengths)-min(lengths),6))+';\nexport const COMPACT_VERTEX_COUNT='+str(len(out)//12)+';\nexport const COMPACT_BASE64='+json.dumps(encoded)+';\nexport function compactVertexBytes(){const s=atob(COMPACT_BASE64);return Uint8Array.from(s,c=>c.charCodeAt(0));}\n')
print('packed',len(out)//36,'triangles,',len(out),'bytes')
