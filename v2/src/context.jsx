import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {notifyNative} from './lib/nativeShell';
import {readOffline,writeOffline,clearPrivateOffline} from './lib/offlineStore';
import { api, patch, post, remove } from './lib/api';
import { browserLocale, localeForCountry, normalizeLocale, translate, SUPPORTED } from './lib/i18n';
const Ctx = createContext(null);
const defaults = {user:null,preferences:{vehicle:'carro',preferredRoute:'safe',theme:'light',language:browserLocale(),alerts:true,routineTags:[],onboardingComplete:false},favorites:[],history:[],reports:[],routines:[],demo:true};
export function VanoProvider({children}) {
  const [data,setData]=useState(defaults),[loading,setLoading]=useState(true),[error,setError]=useState(''),[toast,setToast]=useState('');
  const refresh=useCallback(async()=>{ try { const next=await api('/bootstrap');
    const manualGuestLanguage=(()=>{try{return normalizeLocale(localStorage.getItem('vano-guest-language'))}catch{return null}})();
    const detected=localeForCountry(next.localeSuggestion?.country)||browserLocale();
    const selected=next.languageExplicit ? next.preferences?.language : next.user ? detected : (manualGuestLanguage||detected);
    next.preferences={...next.preferences,language:SUPPORTED.has(selected)?selected:'en-US'};
    setData(next); setError(''); return next; } catch(e) { setError('Não foi possível conectar. Tente novamente quando houver sinal.'); } finally { setLoading(false); } },[]);
  useEffect(()=>{ refresh();const online=()=>refresh();window.addEventListener('online',online);return()=>window.removeEventListener('online',online); },[refresh]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t); },[toast]);
  const savePreference=async p => { const next=await patch('/preferences',p); if(p.language!==undefined&&!data.user){try{localStorage.setItem('vano-guest-language',p.language)}catch{}}setData(d=>({...d,preferences:next,languageExplicit:p.language!==undefined||d.languageExplicit})); setToast(translate('Preferências salvas',p.language||data.preferences?.language)); return next; };
  const saveFavorite=async item => { await post('/favorites',item); await refresh(); setToast(translate('Lugar salvo',data.preferences?.language)); };
  const deleteFavorite=async id => {await remove(`/favorites/${encodeURIComponent(id)}`);await refresh();setToast(translate('Lugar removido',data.preferences?.language));};
  const saveTrip=async item => {try{await post('/history',item);await refresh();}catch(error){if(!error.offline)throw error;const queue=await readOffline('history-queue')||[];await writeOffline('history-queue',[...queue.slice(-9),{item,owner:data.user?.id||'guest',at:Date.now()}]);}};
  useEffect(()=>{let stopped=false;const sync=async()=>{const queued=await readOffline('history-queue')||[];if(stopped||!queued.length||navigator.onLine===false)return;const remaining=[];for(const record of queued){if(record.owner!==(data.user?.id||'guest'))continue;try{await post('/history',record.item);}catch(error){if(error.offline)remaining.push(record);}}if(!stopped)await writeOffline('history-queue',remaining);};window.addEventListener('online',sync);sync();return()=>{stopped=true;window.removeEventListener('online',sync);};},[data.user?.id]);
  const report=async item=>{await post('/reports',item);await refresh();setToast('Ocorrência registrada como não verificada');};
  const login=async(path,values)=>{const response=await post(`/auth/${path}`,values);if(response.verificationRequired){setToast(response.message);return {verificationRequired:true};}const state=await refresh();notifyNative({action:'session'});setToast(translate('Você entrou no VANO',state?.preferences?.language));return {onboardingComplete:!!state?.preferences?.onboardingComplete};};
  const logout=async()=>{await post('/auth/logout',{});await clearPrivateOffline();setData(defaults);notifyNative({action:'session'});await refresh();setToast(translate('Você saiu da conta',data.preferences?.language));};
  const t=useCallback((key,vars)=>translate(key,data.preferences?.language||browserLocale(),vars),[data.preferences?.language]);
  return <Ctx.Provider value={{...data,t,language:data.preferences?.language||'pt-BR',loading,error,toast,setToast,refresh,savePreference,saveFavorite,deleteFavorite,saveTrip,report,login,logout}}>{children}{toast&&<span className="sr-only" role="status" aria-live="polite">{toast}</span>}</Ctx.Provider>;
}
export const useVano=()=>useContext(Ctx);
