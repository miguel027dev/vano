/** Handle Chromium/WebView transcripts without submitting an interim result prematurely. */
export function maviSpeechTranscripts(results){
  if(!results)return {final:'',interim:''};
  const rows=Array.from(results);
  const finals=[],interims=[];
  for(const row of rows){
    const words=String(row?.[0]?.transcript||'').trim().slice(0,360);
    if(!words)continue;
    (row?.isFinal===false?interims:finals).push(words);
  }
  return {final:finals.join(' ').trim().slice(0,360),interim:interims.join(' ').trim().slice(0,360)};
}
