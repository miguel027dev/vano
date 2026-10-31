/**
 * Dedicated /v2 admin live microphone transcription.
 * Browser holds one getUserMedia track; sends bounded voice turns (not ambient
 * audio) to the existing Groq/OpenAI STT providers. Keys stay server-side.
 */
export const MAX_LIVE_AUDIO_BYTES=1_500_000;
const SUPPORTED=new Map([
 ['audio/webm','webm'],['audio/ogg','ogg'],['audio/mp4','mp4'],
 ['audio/wav','wav'],['audio/x-m4a','m4a']
]);
export function liveSttProvider(env=process.env){
 const groq=String(env.GROQ_API_KEY||'').trim();
 if(groq.length>16)return {
  url:'https://api.groq.com/openai/v1/audio/transcriptions',
  apiKey:groq,model:'whisper-large-v3-turbo'
 };
 const openai=String(env.OPENAI_API_KEY||'').trim();
 if(openai.length>16)return {
  url:'https://api.openai.com/v1/audio/transcriptions',
  apiKey:openai,model:'whisper-1'
 };
 return null;
}
export function liveSttMime(value){
 const mime=String(value||'').split(';',1)[0].trim().toLowerCase();
 return SUPPORTED.has(mime)?{mime,ext:SUPPORTED.get(mime)}:null;
}
export async function transcribeMaviLiveAudio(bytes,mime,{provider=liveSttProvider(),fetcher=fetch}={}){
 if(!provider)throw Error('stt_not_configured');
 const format=liveSttMime(mime);
 if(!format)throw Error('stt_media_unsupported');
 if(!bytes||bytes.byteLength<1800||bytes.byteLength>MAX_LIVE_AUDIO_BYTES)
  throw Error('stt_audio_size');
 const form=new FormData();
 form.set('file',new Blob([bytes],{type:format.mime}), 'mavi-turn.'+format.ext);
 form.set('model',provider.model);
 form.set('language','pt');
 form.set('response_format','json');
 let response;
 try{response=await fetcher(provider.url,{
  method:'POST',headers:{Authorization:'Bearer '+provider.apiKey},
  body:form,signal:AbortSignal.timeout(14000)
 });}catch{throw Error('stt_provider_unavailable');}
 if(!response.ok)throw Error('stt_provider_unavailable');
 const payload=await response.json().catch(()=>({}));
 const transcript=typeof payload.text==='string'?
  payload.text.replace(/[\\u0000-\\u001f\\u007f]/g,' ').trim().slice(0,360):'';
 if(transcript.length<2)throw Error('stt_no_speech');
 return transcript;
}
