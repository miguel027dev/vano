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
 if(!s||/^(?:como|qual|quando|por que|porque|sera|quanto|e se)\b/.test(s))return null;
 if(/^(?:nao sei|nao entendi|nao tenho certeza|talvez|pera|pera ai|espera|pode repetir|repete|repita)$/.test(s))return 'clarify';
 if(s.split(' ').length>9||/\b(?:mas|porem|desde que|contanto que|talvez|depende|espera|depois|mais tarde|hospital|farmacia|posto|mercado|parar)\b/.test(s))return null;
 if(/^(?:nao|negativo|agora nao|melhor nao|nao obrigado|nao obrigada|nao quero|deixa|deixa quieto|mantem a rota|mantenha a rota|cancela|cancelar|esquece|fica nessa|mantem essa|deixa essa)(?:\b|$)/.test(s))return 'reject';
 if(/\bnao\b/.test(s))return null;
 // Explicit and natural acceptance; never authorize the switch itself.
 if(/^(?:sim(?: eu quero| quero| pode| por favor| recalcula| procura| busca| quero (?:outra rota|uma rota mais rapida))?|quero(?: sim| outra rota| um caminho diferente| uma rota mais rapida| rota mais rapida)?|pode(?: sim| procurar| buscar| recalcular| calcular| procurar outra rota| recalcular outra rota| buscar outra rota| buscar uma mais rapida)?|claro|com certeza|bora|isso|beleza|manda|vai|procura outra rota|busca outra rota|recalcula outra rota)$/.test(s))return 'accept';
 return null;
}
