/** Share identical simultaneous requests to the original routing engine.
 * No TTL: completed routes are never reused and GPS reroutes are always fresh.
 */
const pendingV1=new Map(),fetcherIdentity=new WeakMap();
let nextFetcherId=1;
function identify(fetcher){
 if(!fetcherIdentity.has(fetcher))fetcherIdentity.set(fetcher,nextFetcherId++);
 return fetcherIdentity.get(fetcher);
}
export async function shareV1Work(compute,args,fetcher){
 const options=args.at(-1)||{};
 if(options.reroute===true)return compute();
 const key=JSON.stringify([...args,identify(fetcher)]);
 const found=pendingV1.get(key);
 if(found)return structuredClone(await found);
 if(pendingV1.size>=48)return compute();
 const pending=Promise.resolve().then(compute);
 pendingV1.set(key,pending);
 try{return structuredClone(await pending);}
 finally{if(pendingV1.get(key)===pending)pendingV1.delete(key);}
}
