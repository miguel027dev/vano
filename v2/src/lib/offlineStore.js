/** Private device storage. Cached account data never grants server authorization. */
let opening;
function db(){
  if(!globalThis.indexedDB)return Promise.reject(Error('Device storage unavailable'));
  if(!opening)opening=new Promise((resolve,reject)=>{const req=indexedDB.open('vano-offline-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>{opening=null;reject(req.error);};});
  return opening;
}
export async function readOffline(key){try{const store=await db();return await new Promise((resolve,reject)=>{const req=store.transaction('records').objectStore('records').get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});}catch{return null;}}
export async function writeOffline(key,value){try{const store=await db();await new Promise((resolve,reject)=>{const tx=store.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});return true;}catch{return false;}}
export async function deleteOffline(key){try{const store=await db();await new Promise((resolve,reject)=>{const tx=store.transaction('records','readwrite');tx.objectStore('records').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch{}}
export async function clearPrivateOffline(){await Promise.all(['bootstrap','active-trip','history-queue'].map(deleteOffline));}
export function cachedBootstrap(value){if(!value)return null;const {csrfToken,...snapshot}=value;return {...snapshot,user:value.user?{...value.user,isAdmin:false}:null,cachedAt:Date.now()};}
export function validTrip(value,owner,now=Date.now()){
  if(!value||value.version!==1||value.owner!==owner||!value.destination?.coords||!value.route?.geometry?.coordinates?.length||!Number.isFinite(value.savedAt)||value.savedAt>now+5000||now-value.savedAt>24*3600000)return null;
  return value;
}
