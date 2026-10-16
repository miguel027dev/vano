/** Route operations must not depend on Web Speech synthesis completing.
 * Call the routing function synchronously and isolate audio cue exceptions.
 * The returned promise resolves/rejects solely with the routing operation.
 */
export function dispatchMaviRoute(command,runRoute,notify=()=>{}){
 let operation;
 try{operation=Promise.resolve(runRoute(command));}
 catch(error){operation=Promise.reject(error);}
 try{Promise.resolve(notify()).catch(()=>{});}catch{/* audio is optional */}
 return operation;
}
