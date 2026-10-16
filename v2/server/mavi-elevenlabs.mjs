/**
 * VANO /v2 MAVI ElevenLabs adapter. No public arbitrary-text TTS proxy.
 * All text must be approved by the existing deterministic /assistant endpoint,
 * delivered through a short-lived session-bound signed voice ticket.
 */
export const DEFAULT_MAVI_MODEL = 'eleven_v4_turbo';
export const MAVI_VOICE_MAX_CHARS = 450;
export const MAVI_VOICE_MAX_BYTES = 2_000_000;
export const MAVI_VOICE_TICKET_MS = 45_000;

export function maviElevenConfig(env=process.env){
 const enabled=env.VANO_MAVI_ELEVEN_ENABLED==='1';
 const key=String(env.ELEVENLABS_API_KEY||'').trim();
 const voiceId=String(env.ELEVENLABS_VOICE_ID||'').trim();
 const model=String(env.ELEVENLABS_MODEL_ID||DEFAULT_MAVI_MODEL).trim();
 // A feature flag alone is never sufficient: missing credentials leave old
 // browser TTS operating normally, with no outbound network requests.
 return {
   enabled:enabled&&Boolean(key)&&/^[A-Za-z0-9_-]{12,96}$/.test(voiceId),
   key,voiceId,model
 };
}
export function maviSpeechText(value){
 if(typeof value!=='string')return null;
 const text=value.trim();
 return text.length>=2&&text.length<=MAVI_VOICE_MAX_CHARS&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;
}
export function maviVoiceRequest(text,config){
 if(!config?.enabled||!maviSpeechText(text))throw Error('MAVI voice not configured or text invalid');
 return {
   endpoint:'https://api.elevenlabs.io/v1/text-to-dialogue/stream?output_format=mp3_22050_32',
   init:{
     method:'POST',
     headers:{'xi-api-key':config.key,'Content-Type':'application/json','Accept':'audio/mpeg'},
     body:JSON.stringify({
       model_id:config.model,
       language_code:'pt',
       inputs:[{text,voice_id:config.voiceId}]
     })
   }
 };
}
export async function fetchMaviVoice(text,config,{fetcher=fetch,signal}={}){
 const {endpoint,init}=maviVoiceRequest(text,config);
 let response;
 try{
   response=await fetcher(endpoint,{...init,signal});
 }catch{throw new Error('mavi_voice_unavailable');}
 if(!response?.ok||!response?.body)throw new Error('mavi_voice_provider_failed');
 const type=String(response.headers?.get?.('content-type')||'');
 if(!/audio\/(mpeg|mp3)|application\/octet-stream/i.test(type))
   throw new Error('mavi_voice_bad_media');
 return response;
}
