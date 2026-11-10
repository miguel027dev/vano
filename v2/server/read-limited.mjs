/** Read third-party HTTP responses with a hard byte budget, including chunked transfers.
 * Avoids allocating an arbitrary-sized body before checking Content-Length.
 */
export async function readLimitedText(response,maxBytes){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw RangeError('Invalid byte budget');
 const claimed=Number(response?.headers?.get?.('content-length')||0);
 if(claimed>maxBytes)throw Error('upstream-too-large');
 if(!response?.body?.getReader){
   const text=typeof response?.text==='function'?await response.text():
     JSON.stringify(await response.json());
   if(Buffer.byteLength(text,'utf8')>maxBytes)throw Error('upstream-too-large');
   return text;
 }
 const reader=response.body.getReader();
 const chunks=[];let bytes=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     bytes+=value.byteLength;
     if(bytes>maxBytes){
       await reader.cancel().catch(()=>{});
       throw Error('upstream-too-large');
     }
     chunks.push(Buffer.from(value));
   }
   return Buffer.concat(chunks,bytes).toString('utf8');
 }finally{reader.releaseLock();}
}
