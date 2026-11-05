/** Shared input contract. A map center is never evidence of a user's location. */
export function partnerPlace(input){
 if(!input||typeof input!=='object')return null;
 const p=input.coords??input.position?.coords??input.position??input.location??input.coordinates??input;
 const coords=Array.isArray(p)?p:[p.longitude??p.lng??p.lon,p.latitude??p.lat];
 if(coords.length!==2||!coords.every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(coords[0])>180||Math.abs(coords[1])>90)return null;
 const name=String(input.name||input.label||input.address||'Local selecionado').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,140);
 const accuracy=Number.isFinite(p.accuracy)?p.accuracy:Number.isFinite(input.accuracy)?input.accuracy:null;
 return {coords:[...coords],lat:coords[1],lng:coords[0],name,...(accuracy!==null?{accuracy_m:accuracy}:{})};
}
export function partnerAddress(input){
 const value=typeof input==='string'?input:input?.address??input?.query??input?.text;
 if(typeof value!=='string'||value.trim().length<2||value.length>200||/[\u0000-\u001f\u007f]/.test(value))return null;
 return value.trim();
}
const problem=(code,message)=>Object.assign(new Error(message),{code});
export async function resolvePartnerPlace(value,{search,details}={}){
 const direct=partnerPlace(value);if(direct)return direct;
 if(typeof value?.place_id==='string'&&details){const place=partnerPlace(await details(value.place_id));if(place)return place;}
 const query=partnerAddress(value);if(!query)throw problem('INVALID_PLACE','Envie coordenadas, place_id ou um endereço.');
 const results=await search(query),place=(results||[]).map(partnerPlace).find(Boolean);
 if(!place)throw problem('ADDRESS_NOT_FOUND','Não encontrei esse endereço. Inclua número, bairro e cidade.');
 return {...place,query,resolved:true};
}
export async function locatePartnerUser(nav=globalThis.navigator,{timeoutMs=10000,fallbackTimeoutMs=6000}={}){
 if(!nav?.geolocation?.getCurrentPosition)throw problem('LOCATION_UNAVAILABLE','Localização indisponível. O parceiro pode enviar as coordenadas.');
 const request=high=>new Promise((resolve,reject)=>{
  let done=false;const timeout=high?timeoutMs:fallbackTimeoutMs;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Object.assign(Error('GPS timeout'),{code:3})),timeout+100);
  try{nav.geolocation.getCurrentPosition(position=>{
   const p=partnerPlace(position);if(!p)return finish(problem('INVALID_LOCATION','O navegador não retornou coordenadas válidas.'));
   finish(null,{...p,name:'Minha localização',source:'gps'});
  },e=>finish(e),{enableHighAccuracy:high,timeout,maximumAge:high?0:30000});}catch(e){finish(e);}
 });
 try{return await request(true);}catch(e){
  if(e?.code===1||e?.name==='SecurityError')throw problem('LOCATION_PERMISSION_REQUIRED','Permita a localização no navegador ou envie a origem pelo parceiro.');
  if(e?.code==='INVALID_LOCATION')throw e;
  try{return await request(false);}catch(last){if(last?.code===1)throw problem('LOCATION_PERMISSION_REQUIRED','Permita a localização no navegador ou envie a origem pelo parceiro.');throw problem('LOCATION_UNAVAILABLE','Não foi possível obter o GPS. O parceiro pode enviar a origem.');}
 }
}
