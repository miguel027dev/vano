/** One optional follow-up after a successfully recorded community road incident.
 * Only explicit acceptance runs a search; any proposed route still requires
 * the separate existing MAVI "use this route" confirmation.
 */
import {maviNormalize} from './maviAssistant.mjs';
const OFFERS=Object.freeze({
 transito:Object.freeze({
  question:'Registrei o trânsito aqui. Quer que eu procure uma rota mais rápida?',
  command:'Mavi, rota mais rápida'
 }),
 alagamento:Object.freeze({
  question:'Registrei o alagamento aqui. Quer que eu procure outra rota?',
  command:'Mavi, procura outra rota'
 }),
 obstaculo:Object.freeze({
  question:'Registrei o obstáculo aqui. Quer que eu procure outro caminho?',
  command:'Mavi, procura outra rota'
 }),
 via_fechada:Object.freeze({
  question:'Registrei a rua fechada aqui. Quer que eu procure outra rota?',
  command:'Mavi, procura outra rota'
 })
});
export function maviIncidentOffer(type){return OFFERS[type]||null;}
export function maviIncidentFollowupDecision(value){
 if(typeof value!=='string'||value.length>160)return null;
 const s=maviNormalize(value);
 if(!s||/^(?:como|qual|quando|por que|porque|sera|quanto|e se|nao sei|nao entendi|nao tenho certeza)\b/.test(s))return null;
 if(/^(?:nao|negativo|agora nao|melhor nao|nao obrigado|nao obrigada|deixa|deixa quieto|mantem a rota|mantenha a rota|cancela|cancelar|esquece|depois|mais tarde)(?:\b|$)/.test(s))return 'reject';
 if(/\b(?:nao|talvez|depende|espera|mais tarde|depois)\b/.test(s))return null;
 if(/^(?:(?:sim|claro|quero sim|pode|pode sim|com certeza|isso|bora|manda|vai|beleza)|pode (?:procurar|buscar|recalcular|calcular)(?: (?:outra rota|um novo caminho|uma rota mais rapida))?|quero (?:outra rota|um caminho diferente|uma rota mais rapida|rota mais rapida)|(?:procura|busca|recalcula) outra rota)$/.test(s)){
  // Do not treat "sim, mas..." or "quero um hospital" as route search consent.
  if(/\b(?:mas|porem|desde que|contanto que|hospital|farmacia|posto|mercado|voltar|parar)\b/.test(s))return null;
  if(s.split(' ').length>8)return null;
  return 'accept';
 }
 return null;
}
