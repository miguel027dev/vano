/** MAVI Talk: opt-in, transient, short conversational turns.
 * The dialogue is held only in the current browser tab. Neither the
 * client's live GPS nor route/destination data is needed by a chatbot.
 */
const normalize=value=>String(value||'').toLowerCase().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim()
 .replace(/^(?:(?:ei|oi|ola|hey|ok) )?(?:mavi|ma vi|mavy|mave)\s*/,'');
const NAVIGATION_RE=/\b(?:gps|rota|rotas|trajeto|transito|trafego|chegar|destino|pedagio|radar|velocidade|manobra|conversao|rua|avenida|esquerda|direita|caminho|estacionamento|hospital|farmacia|mercado|posto|mapa|navegacao|recalcular|alternativa)\b/;
const SOCIAL_RE=/\b(?:voce (?:ta|esta|vai|anda) bem|como (?:voce|vc) (?:ta|esta|vai|anda)|como foi seu dia|tudo bem com voce|bater? (?:um )?papo|conversar|conversa comigo|me escuta|quero desabafar|posso desabafar|me sinto|estou me sentindo|t[oô] me sentindo|estou triste|t[oô] triste|dia (?:foi|ta|esta|estava) (?:triste|ruim|dificil|pesado|otimo|bom|horrivel)|hoje (?:foi|ta|esta|estava) (?:triste|ruim|dificil|pesado|otimo|bom)|aconteceu comigo|me deixou (?:feliz|triste|chatead[oa])|tive um dia|tive uma semana|me conta|conta (?:uma|um)|o que voce acha|tenho uma novidade|to feliz|estou feliz|cansad[oa]|sozinh[oa]|ansios[oa]|preocupad[oa]|chatead[oa]|entediad[oa]|desanimad[oa])\b/;
const FOLLOWUP_RE=/^(?:e (?:depois|agora|ai|isso|voce|pra voce|o que)|por que|porque|serio|nossa|entendi|ta|isso mesmo|pode continuar|me conta mais|o que acha|como assim|faz sentido|foi isso|sim|nao|claro|verdade|exato)\b/;
export function isMaviTalkTurn(value,{conversationActive=false}={}){
 const phrase=normalize(value);
 if(phrase.length<3||NAVIGATION_RE.test(phrase))return false;
 return SOCIAL_RE.test(phrase)||(conversationActive&&FOLLOWUP_RE.test(phrase));
}
const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f<>]/g,' ').trim().slice(0,230):'';
export function limitedMaviTalkHistory(value){
 if(!Array.isArray(value))return [];
 return value.slice(-8).filter(x=>x&&['user','assistant'].includes(x.role))
  .map(x=>({role:x.role,text:clean(x.text)})).filter(x=>x.text.length>=2).slice(-6);
}
export function maviTalkFallback(value){
 const s=normalize(value);
 if(/triste|chatead|desanimad|ansios|preocupad|dia ruim|dia dificil|dia pesado|horrivel|sozinh/.test(s))
  return 'Poxa, sinto que seu dia foi difícil. Quer me contar o que aconteceu? Tô aqui pra conversar.';
 if(/feliz|novidade|otimo|dia bom|incrivel/.test(s))
  return 'Que legal! Me conta o que aconteceu, quero ouvir.';
 if(/voce.*(?:bem|ta|esta)|como.*voce/.test(s))
  return 'Tô aqui e pronta pra conversar! E você, como tá se sentindo hoje?';
 if(/convers|papo|desabaf/.test(s))
  return 'Claro! Pode me contar o que tá passando pela sua cabeça.';
 return 'Tô te ouvindo. Quer me contar um pouco mais?';
}
