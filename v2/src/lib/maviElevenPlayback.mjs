import {fetchMaviAudio,fetchMaviAudioStream} from './api.js';

/**
 * Browser /v2 authorized MAVI voice player (Cartesia/ElevenLabs). Deliberately isolated from navigation TTS.
 * Fetch streamed MP3 securely, decode with the browser and await audio ended.
 * First release prioritizes reliability over experimental MediaSource playback:
 * a provider failure always hands control back to local speechSynthesis.
 */
/** Play the MP3 while the authorized POST is still streaming from Render.
 * No signed speech tokens are placed in a URL or exposed to third-party CDNs.
 * The legacy blob implementation remains the fallback where MSE MP3 is absent.
 */
async function playMaviStream(ticket,{signal,audioFactory,urlApi}){
 const response=await fetchMaviAudioStream(ticket,{signal});
 if(signal?.aborted||!response.body?.getReader)throw Error('mavi_voice_stream_unavailable');
 const source=new MediaSource();
 const objectUrl=urlApi.createObjectURL(source);
 const audio=audioFactory();
 let reader=null,buffer=null,timer=null,finished=false;
 try{
  await new Promise((resolve,reject)=>{
   let opened=false,readingDone=false,started=false,total=0;
   const queue=[];
   const cleanup=()=>{
    clearTimeout(timer);
    signal?.removeEventListener?.('abort',cancel);
    source.removeEventListener?.('sourceopen',onOpen);
    audio.removeEventListener?.('ended',complete);
    audio.removeEventListener?.('error',fail);
    buffer?.removeEventListener?.('updateend',updated);
    buffer?.removeEventListener?.('error',fail);
   };
   const fail=()=>{if(finished)return;finished=true;cleanup();reject(Error('mavi_voice_stream_failed'));};
   const complete=()=>{if(finished)return;finished=true;cleanup();resolve();};
   const cancel=()=>{try{audio.pause?.();reader?.cancel?.()}catch{}fail();};
   const pump=()=>{
    if(finished||!buffer||buffer.updating)return;
    if(queue.length){
     try{buffer.appendBuffer(queue.shift());}catch{fail();}
    }else if(readingDone&&source.readyState==='open'){
     try{source.endOfStream();}catch{fail();}
    }
   };
   const updated=()=>{
    if(!started&&buffer?.buffered?.length){
     started=true;
     try{Promise.resolve(audio.play()).catch(fail);}catch{fail();return;}
    }
    pump();
   };
   const onOpen=()=>{
    if(opened||finished)return;opened=true;
    try{buffer=source.addSourceBuffer('audio/mpeg');}
    catch{fail();return;}
    buffer.addEventListener('updateend',updated);
    buffer.addEventListener('error',fail);
    const read=async()=>{
     reader=response.body.getReader();
     while(!finished&&!signal?.aborted){
      const next=await reader.read();
      if(next.done){readingDone=true;pump();return;}
      if(!next.value?.byteLength)continue;
      total+=next.value.byteLength;
      if(total>2_000_000)throw Error('mavi_voice_oversize');
      queue.push(next.value);pump();
     }
    };
    void read().catch(fail);
   };
   if(signal?.aborted){fail();return;}
   signal?.addEventListener?.('abort',cancel,{once:true});
   audio.addEventListener('ended',complete,{once:true});
   audio.addEventListener('error',fail,{once:true});
   source.addEventListener('sourceopen',onOpen,{once:true});
   audio.preload='auto';audio.volume=1;
   // A stuck source cannot lock the assistant's listening loop.
   timer=setTimeout(fail,30000);
   try{audio.src=objectUrl;}catch{fail();}
  });
 }finally{
  finished=true;
  try{reader?.cancel?.()}catch{}
  try{audio.pause?.()}catch{}
  try{audio.removeAttribute?.('src');audio.load?.()}catch{}
  try{if(source.readyState==='open')source.endOfStream();}catch{}
  urlApi.revokeObjectURL(objectUrl);
 }
}

export async function playMaviVoice(ticket,{signal,audioFactory=()=>new Audio(),urlApi=URL}={}){
 if(signal?.aborted)throw new Error('mavi_voice_cancelled');
 const progressive=typeof MediaSource!=='undefined'&&
  typeof MediaSource.isTypeSupported==='function'&&MediaSource.isTypeSupported('audio/mpeg')&&
  typeof ReadableStream!=='undefined';
 if(progressive)return playMaviStream(ticket,{signal,audioFactory,urlApi});
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
