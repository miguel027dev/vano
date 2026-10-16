/** Privacy-first command gate: only text following the spoken name MAVI is actionable.
 * This runs locally AFTER the browser returns its transcript. Web Speech itself
 * may still use a remote browser vendor recognizer.
 */
export function normalizeMaviSpeech(value) {
  return String(value || '').slice(0,400).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function extractMaviCommand(transcript) {
  const spoken=normalizeMaviSpeech(transcript);
  const wake=spoken.match(/^(?:(?:ei|oi|ola|hey|o|ok) )?(?:mavi|mavy|mave|marvi)(?: |$)/);
  if(!wake)return null;
  return spoken.slice(wake[0].length).trim();
}
export function maviConfirmation(command) {
  const s=normalizeMaviSpeech(command);
  // A new calculation request must never accidentally approve a pending route.
  if(/\b(outra|outro|nova|novo|recalcula|recalcular|procura|buscar|calcula)\b/.test(s))return null;
  if(/^(?:nao|cancelar|cancela|mantem|manter|deixa|prefiro a atual|fica com a atual|nao troca)\b/.test(s) ||
     /\b(nao gostei|nao quero|mantem essa|mantem a atual|deixa como esta)\b/.test(s))return 'reject';
  if(/^(?:sim|aceito|confirma|confirmar|confirmado|pode|ok|fechado)\b/.test(s) ||
     /\b(gostei dessa|gostei desta|pode ser essa|pode ser esta|pode trocar|troca a rota|trocar a rota|troque a rota|usa essa|usar essa|siga por essa|vamos nessa)\b/.test(s))
    return 'accept';
  return null;
}
export function maviRearmDelay({silentCount=0,hardCount=0}={}) {
  if(hardCount>=3)return null; // Stop instead of infinitely retrying a broken service.
  if(hardCount>0)return Math.min(12000,2000*Math.pow(2,hardCount-1));
  return Math.min(6500,900+Math.max(0,silentCount)*1200);
}
