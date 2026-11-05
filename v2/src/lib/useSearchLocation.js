import {useEffect,useState} from 'react';
import {searchGeoBias} from './searchGeoBias.js';
import {watchSearchLocation} from './searchLocationWatch.js';

/** Reuse an existing permission; never request access from a search form. */
export function useSearchLocation(enabled=true){
  const [fix,setFix]=useState(null),[,setClock]=useState(0);
  useEffect(()=>{
    if(!enabled){setFix(null);return;}
    const stop=watchSearchLocation(navigator,setFix);
    // Expire a silent/lost signal even if the user hasn't typed yet.
    const timer=setInterval(()=>setClock(value=>value+1),12000);
    return()=>{clearInterval(timer);stop();};
  },[enabled]);
  return enabled?searchGeoBias(fix?.coords,{gpsGranted:!!fix,fixAt:fix?.sourceAt}):'';
}
