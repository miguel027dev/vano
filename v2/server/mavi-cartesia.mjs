/**
 * Cartesia Sonic TTS for MAVI V2 only. No public arbitrary-text proxy.
 * Called exclusively with text signed by /v2/assistant and session-checked
 * by /v2/assistant/speech. Never expose API key to the browser.
 *
 * MP3 24 kHz / 64 kbps avoids sending uncompressed 44.1 kHz WAV over mobile
 * links, while keeping the existing browser blob player + navigation intact.
 */
import {maviSpeechText,MAVI_VOICE_MAX_BYTES} from './mavi-elevenlabs.mjs';
export const MAVI_CARTESIA_MODEL='sonic-3.6';
export const MAVI_CARTESIA_API_VERSION='2026-08-14';
export const MAVI_CARTESIA_MAX_BYTES=MAVI_VOICE_MAX_BYTES;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_MODELS=new Set(['sonic-3.6','sonic-3.5','sonic-3','sonic-latest']);
export function maviCartesiaConfig(env=process.env){
 const key=String(env.CARTESIA_API_KEY||'').trim();
 const voiceId=String(env.CARTESIA_MAVI_VOICE_ID||'').trim();
 const model=String(env.CARTESIA_MAVI_MODEL||MAVI_CARTESIA_MODEL).trim();
 const enabled=env.VANO_MAVI_CARTESIA_ENABLED==='1'&&key.startsWith('sk_car_')&&
   key.length>=24&&UUID.test(voiceId)&&VALID_MODELS.has(model);
 return {enabled,key,voiceId,model};
}
export function cartesiaVoiceRequest(text,config){
 const speech=maviSpeechText(text);
 if(!config?.enabled||!speech)throw Error('mavi_cartesia_unavailable');
 return {
  endpoint:'https://api.cartesia.ai/tts/bytes',
  init:{
   method:'POST',
   headers:{
    'Authorization':'Bearer '+config.key,
    'Cartesia-Version':MAVI_CARTESIA_API_VERSION,
    'Content-Type':'application/json','Accept':'audio/mpeg'
   },
   body:JSON.stringify({
    model_id:config.model,
    transcript:speech,
    voice:config.voiceId,
    language:'pt',
    output_format:{container:'mp3',sample_rate:24000,bit_rate:64000},
    generation_config:{speed:1,volume:1}
   })
  }
 };
}
export async function fetchMaviCartesiaVoice(text,config,{fetcher=fetch,signal}={}){
 const {endpoint,init}=cartesiaVoiceRequest(text,config);
 let response;
 try{response=await fetcher(endpoint,{...init,signal});}
 catch{throw new Error('mavi_cartesia_transport');}
 if(!response?.ok||!response?.body){
  const error=new Error('mavi_cartesia_provider');
  error.upstreamStatus=Number.isInteger(response?.status)?response.status:null;
  throw error;
 }
 if(!/audio\/(?:mpeg|mp3)|application\/octet-stream/i.test(
   String(response.headers?.get?.('content-type')||'')))
  throw new Error('mavi_cartesia_media');
 const length=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(length)&&length>MAVI_CARTESIA_MAX_BYTES)
  throw new Error('mavi_cartesia_oversize');
 return response;
}
