/** Geo header only from explicitly trusted proxy; never uses GPS or tracks IP locations. */
export const LANGUAGES = new Set(['pt-BR','pt-PT','fr-FR','en-US']);
export function localeForCountry(value){
  switch(String(value||'').trim().toUpperCase()){
    case 'FR':case 'GF':case 'GP':case 'MQ':case 'RE':case 'YT':case 'MC':return 'fr-FR';
    case 'PT':return 'pt-PT';
    case 'BR':return 'pt-BR';
    case 'GB':case 'US':case 'AU':case 'CA':case 'IE':case 'NZ':return 'en-US';
    default:return null;
  }
}
export function normalizeLocale(raw){
  const tag=String(raw||'').trim().replace('_','-').toLowerCase();
  if(tag==='pt-pt')return 'pt-PT';
  if(tag==='pt-br'||tag==='pt')return 'pt-BR';
  if(tag==='fr'||tag.startsWith('fr-'))return 'fr-FR';
  if(tag==='en'||tag.startsWith('en-'))return 'en-US';
  return null;
}
export function getLocaleSuggestion(headers, trustGeo=false){
  const country=trustGeo?String(headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || '').toUpperCase():'';
  const geo=localeForCountry(country);
  if(geo)return {country,language:geo,source:'country'};
  const accepted=String(headers['accept-language']||'').split(',').map(x=>x.split(';')[0]);
  const browser=accepted.map(normalizeLocale).find(Boolean);
  return {country:null,language:browser||'en-US',source:'browser'};
}
