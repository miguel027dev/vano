/** Local MAVI speech follows the visible reply, without silently dropping
 * everything after 400 characters. Keep below Android LocalVoice's 1200-char
 * safety limit and bound WebView sessions that omit an end event.
 */
export function maviLocalSpeechText(text){
  return String(text??'').trim().slice(0,1100);
}
export function maviLocalSpeechTimeoutMs(text){
  const size=maviLocalSpeechText(text).length;
  return Math.min(65000,Math.max(17000,size*95));
}
