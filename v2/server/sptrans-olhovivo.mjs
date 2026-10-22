/** SPTrans Olho Vivo v2.1 diagnostic bridge.
 * Real KMZ data is transient and NEVER persisted or fed to car routing
 * until direction, vehicle applicability, format and reuse rights are verified.
 * Token and session cookies stay exclusively in the server.
 */
import {inflateRawSync} from 'node:zlib';

const BASE='https://api.olhovivo.sptrans.com.br/v2.1';
const MAX_WIRE=2_500_000, MAX_KML=3_000_000, REFRESH_MS=10*60*1000;
const stamp=clock=>new Date(clock()).toISOString();
const unescapeXml=text=>String(text).replace(/&(?:amp|lt|gt|quot|apos);/g,m=>({
 '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[m]);

export function inspectSptransKml(xml){
 if(typeof xml!=='string'||xml.length>MAX_KML||/<!DOCTYPE|<!ENTITY/i.test(xml))
  throw Error('invalid-kml');
 if(!/<(?:[\w-]+:)?kml(?:\s|>)/i.test(xml))throw Error('missing-kml');
 let placemarks=0,lines=0,speedFields=0,directionFields=0;
 // Inspect tags only, not the content of individual locations or traffic readings.
 for(const m of xml.matchAll(/<(?:[\w-]+:)?Placemark\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Placemark>/gi)){
  if(++placemarks>25_000)throw Error('too-many-placemarks');
  const block=m[1];
  if(/<(?:[\w-]+:)?LineString\b/i.test(block)&&/<(?:[\w-]+:)?coordinates\b/i.test(block))lines++;
  for(const attr of block.matchAll(/<(?:Data|SimpleData)\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)){
   const key=unescapeXml(attr[1]);
   if(/veloc|speed|km\s*\/?\s*h|v_?med/i.test(key))speedFields++;
   if(/sentido|direction|\bBC\b|\bCB\b/i.test(key))directionFields++;
  }
 }
 return {placemarks,lines,speedFields,directionFields};
}

export function unzipSptransKml(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>MAX_WIRE||buffer.length<22)throw Error('invalid-kmz-size');
 const last=buffer.length-22, first=Math.max(0,last-65535);
 let eocd=-1;
 for(let i=last;i>=first;i--)if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('invalid-kmz-directory');
 const count=buffer.readUInt16LE(eocd+10),offset=buffer.readUInt32LE(eocd+16);
 if(count>64||offset>buffer.length)throw Error('invalid-kmz-index');
 let pos=offset;
 for(let i=0;i<count;i++){
  if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw Error('invalid-kmz-entry');
  const flags=buffer.readUInt16LE(pos+8),method=buffer.readUInt16LE(pos+10);
  const compressed=buffer.readUInt32LE(pos+20),plain=buffer.readUInt32LE(pos+24);
  const nameLen=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32);
  const local=buffer.readUInt32LE(pos+42);
  if(pos+46+nameLen+extra+comment>buffer.length)throw Error('invalid-kmz-name');
  const name=buffer.subarray(pos+46,pos+46+nameLen).toString('utf8');
  pos+=46+nameLen+extra+comment;
  if(!/\.kml$/i.test(name)||name.includes('..'))continue;
  if((flags&1)||![0,8].includes(method)||plain>MAX_KML||compressed>MAX_WIRE)
   throw Error('unsupported-kmz-entry');
  if(local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw Error('invalid-kmz-local');
  const from=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
  if(from+compressed>buffer.length)throw Error('invalid-kmz-payload');
  const raw=buffer.subarray(from,from+compressed);
  const kml=method===0?raw:inflateRawSync(raw,{maxOutputLength:MAX_KML});
  if(kml.length!==plain)throw Error('invalid-kmz-length');
  return kml.toString('utf8');
 }
 throw Error('kmz-without-kml');
}
function sessionCookie(response){
 const raw=response.headers?.getSetCookie?.()||[response.headers?.get?.('set-cookie')||''];
 const cookies=[];
 for(const line of raw){
  const pair=String(line).split(';')[0].trim();
  if(/^[a-zA-Z0-9_.-]{1,64}=[^;\r\n]{1,500}$/.test(pair))cookies.push(pair);
 }
 return cookies.slice(0,4).join('; ');
}
async function readLimited(response,limit){
 const declared=Number(response.headers?.get?.('content-length')||0);
 if(declared>limit)throw Error('upstream-too-large');
 // Use streaming size bounds even when the server does not send Content-Length.
 if(!response.body){const data=Buffer.from(await response.arrayBuffer());if(data.length>limit)throw Error('upstream-too-large');return data;}
 const reader=response.body.getReader(),chunks=[];
 let total=0;
 try{while(true){
  const {done,value}=await reader.read();if(done)break;
  total+=value.byteLength;if(total>limit)throw Error('upstream-too-large');
  chunks.push(Buffer.from(value));
 }}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks,total);
}

export function createSptransOlhoVivo({token='',fetcher=fetch,clock=Date.now,periodMs=REFRESH_MS,onStatus=()=>{}}={}){
 const enabled=typeof token==='string'&&token.trim().length>0;
 let state={configured:enabled,mode:'observation-only',lastAttemptAt:null,
  lastSuccessAt:null,online:false,authenticated:false,kmz:null,
  error:null,affectsRouting:false,persistsTraffic:false};
 let nextAllowed=0,inFlight=null;
 async function probe(){
  const date=stamp(clock), timeoutMs=7000;
  let controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const authUrl=new URL(BASE+'/Login/Autenticar');
   authUrl.searchParams.set('token',token.trim());
   const auth=await fetcher(authUrl.toString(),{method:'POST',redirect:'error',
    headers:{Accept:'application/json'},signal:controller.signal});
   if(!auth.ok)throw Error('auth-http-'+auth.status);
   const cookie=sessionCookie(auth);
   const bytes=await readLimited(auth,1024);
   if(bytes.toString('utf8').trim().replace(/^"|"$/g,'').toLowerCase()!=='true')
    throw Error('auth-denied');
   clearTimeout(timer);controller=new AbortController();
   timer=setTimeout(()=>controller.abort(),timeoutMs);
   const response=await fetcher(BASE+'/KMZ/OutrasVias/BC',{
    method:'GET',redirect:'error',signal:controller.signal,
    headers:{Accept:'application/vnd.google-earth.kmz,application/zip,*/*',
      ...(cookie?{Cookie:cookie}:{})}});
   if(!response.ok)throw Error('kmz-http-'+response.status);
   const data=await readLimited(response,MAX_WIRE);
   const summary=inspectSptransKml(unzipSptransKml(data));
   state={...state,authenticated:true,online:true,error:null,
    lastAttemptAt:date,lastSuccessAt:stamp(clock),
    kmz:{endpoint:'OutrasVias/BC',...summary,interpretedForCar:false}};
  }catch(error){
   const code=error?.name==='AbortError'?'timeout':String(error?.message||'unavailable');
   // Never propagate upstream messages that might contain a URL/token.
   state={...state,online:false,lastAttemptAt:date,
    error:/^(auth-http-\d{3}|auth-denied|kmz-http-\d{3}|invalid-kmz-[\w-]+|invalid-kml|missing-kml|too-many-placemarks|unsupported-kmz-entry|kmz-without-kml|upstream-too-large|timeout)$/.test(code)?code:'provider-unavailable'};
  }finally{
   clearTimeout(timer);
   // Only approved boolean/counter metadata; no token, upstream URL or KMZ.
   try{onStatus({online:state.online,error:state.error,placemarks:state.kmz?.placemarks||0});}catch{}
  }
  return {...state,kmz:state.kmz?{...state.kmz}:null};
 }
 return {
  status(){return {...state,kmz:state.kmz?{...state.kmz}:null};},
  refresh({force=false}={}){
   if(!enabled)return Promise.resolve({...state});
   const now=clock();
   if(inFlight)return inFlight;
   if(!force&&now<nextAllowed)return Promise.resolve({...state});
   nextAllowed=now+Math.max(60_000,periodMs);
   inFlight=probe().finally(()=>{inFlight=null;});
   return inFlight;
  },
  start(){
   if(!enabled)return ()=>{};
   // Never block map startup, route requests or frontend rendering.
   void this.refresh();
   const timer=setInterval(()=>{void this.refresh();},Math.max(60_000,periodMs));
   timer.unref?.();
   return ()=>clearInterval(timer);
  }
 };
}
