import {fetchMaviAudio} from './api.js';

/**
 * Browser /v2 authorized MAVI voice player (Cartesia/ElevenLabs). Deliberately isolated from navigation TTS.
 * Fetch streamed MP3 securely, decode with the browser and await audio ended.
 * First release prioritizes reliability over experimental MediaSource playback:
 * a provider failure always hands control back to local speechSynthesis.
 */
export async function playMaviVoice(ticket,{signal,audioFactory=()=>new Audio(),urlApi=URL}={}){
 if(signal?.aborted)throw new Error('mavi_voice_cancelled');
 const blob=await fetchMaviAudio(ticket,{signal});
 if(signal?.aborted)throw new Error('mavi_voice_cancelled');
 const audio=audioFactory();
 const url=urlApi.createObjectURL(blob);
 let timer;
 try{
   await new Promise((resolve,reject)=>{
     let finished=false;
     const cleanup=()=>{
       clearTimeout(timer);
       signal?.removeEventListener?.('abort',cancel);
       audio.removeEventListener?.('ended',complete);
       audio.removeEventListener?.('error',fail);
     };
     const complete=()=>{if(finished)return;finished=true;cleanup();resolve();};
     const fail=()=>{if(finished)return;finished=true;cleanup();reject(new Error('mavi_voice_playback_failed'));};
     const cancel=()=>{try{audio.pause?.()}catch{}fail();};
     if(signal?.aborted){fail();return;}
     signal?.addEventListener?.('abort',cancel,{once:true});
     audio.addEventListener('ended',complete,{once:true});
     audio.addEventListener('error',fail,{once:true});
     audio.preload='auto';audio.volume=1;
     audio.src=url;
     // Bound stuck media; long messages must also be short by server policy.
     timer=setTimeout(fail,30000);
     try{Promise.resolve(audio.play()).catch(fail);}catch{fail();}
   });
 }finally{
   try{audio.pause?.()}catch{}
   try{audio.removeAttribute?.('src');audio.load?.()}catch{}
   urlApi.revokeObjectURL(url);
 }
}

// Preserve the public named export for older V2 integrations/tests.
export const playMaviEleven=playMaviVoice;
