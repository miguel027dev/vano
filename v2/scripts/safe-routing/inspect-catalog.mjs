import {inspectGeoSampaCatalog} from '../../server/safe-routing/geosampa-wfs.mjs';
const result=await inspectGeoSampaCatalog();
console.log(JSON.stringify(result,null,2));
