/** Local retrieval and grounding for MAVI V2. No embeddings, external provider
 * or guessed map facts: every dynamic answer is read from the sanitized snapshot.
 * Only high-precision questions are captured; ambiguous speech reaches NVIDIA.
 */
import {maviNormalize,answerMaviInformation} from '../src/lib/maviAssistant.mjs';

const entries=[
 {intent:'route_summary',patterns:[/^(?:e )?(?:como (?:estamos|vai a viagem|anda a viagem)|qual (?:o )?(?:andamento|status) (?:da|dessa|minha) (?:rota|viagem)|me atualiza (?:da|sobre a) (?:rota|viagem))\??$/]},
 {intent:'gps_status',patterns:[/^(?:e )?(?:o gps (?:ta|esta) (?:bom|funcionando|normal)|meu sinal (?:ta|esta) (?:bom|normal)|voce sabe onde eu estou)\??$/]},
 {intent:'help',patterns:[/^(?:e )?(?:o que mais (?:voce )?(?:consegue|pode) fazer|me da (?:algumas )?ideias de comandos|o que eu posso perguntar|que tipo de coisa posso pedir)\??$/]},
 {intent:'remaining_time',patterns:[/^(?:e )?(?:falta muito|quanto tempo ainda|demora mais quanto|falta quanto pra chegar)\??$/]},
 {intent:'next_maneuver',patterns:[/^(?:e )?(?:depois pra onde|qual o proximo movimento|onde eu entro agora)\??$/]}
];
export function retrieveMaviKnowledge(value,context={}){
 const sentence=maviNormalize(value);
 if(!sentence||sentence.length>180)return null;
 for(const entry of entries){
  if(entry.patterns.some(rx=>rx.test(sentence)))
   return answerMaviInformation(entry.intent,context);
 }
 if(/^(?:e )?(?:tenho alguma parada marcada|ha uma parada no caminho|tem parada ativa)$/.test(sentence)){
  return {mode:'information',intent:'stop_status',text:context?.pendingStop===true?
   'Você tem uma parada temporária ativa. Posso retomar seu destino original quando pedir.':
   'Não há nenhuma parada temporária ativa nesta rota.'};
 }
 return null;
}
