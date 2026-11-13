/** The approved reference hatchback now fully replaces the old GLB-based
 * faceted vehicle. The existing WebGL renderer and 3.662m scale are unchanged.
 * One packed, cached interleaved triangle buffer; one drawArrays call.
 */
import {REFERENCE_COMPACT_VERTEX_COUNT,referenceCompactVertexBytes} from './v2CompactReference.mjs';
export const COMPACT_LENGTH=3.662;
export const COMPACT_VERTEX_COUNT=REFERENCE_COMPACT_VERTEX_COUNT;
export const compactVertexBytes=()=>referenceCompactVertexBytes();
