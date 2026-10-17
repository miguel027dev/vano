/** Safe, deterministic MAVI traffic-report request recognizer.
 * Only an explicit report command or an unambiguous local observation submits.
 * Questions about traffic, future conditions and map-layer requests never publish.
 */
import {maviNormalize} from './maviAssistant.mjs';
const TRAFFIC=/\b(?:transito|trafego|engarrafamento|engarrafado|engarrafada|congestionamento|congestionado|congestionada)\b/;
const PLACE=/\b(?:aqui|agora|nesta rua|nessa rua|na minha rua|nessa avenida|nesta avenida|nesse trecho|neste trecho|onde (?:estou|a gente esta)|na minha localizacao)\b/;
const REQUEST=/\b(?:registra|registrar|registre|reporta|reportar|reporte|relata|relatar|fazer|faz|cria|criar|publique|publica|publicar|marque|marca|marcar|avisa|avisar)\b.{0,85}\b(?:ocorrencia|alerta|denuncia|relato|transito|trafego|congestionamento|engarrafamento)\b|\b(?:ocorrencia|alerta|denuncia|relato)\b.{0,60}\b(?:registrar|reportar|fazer|faz|criar|publicar|marca)\b/;
const LOCAL_OBSERVATION=/^(?:(?:eu|a gente|nos) )?(?:ta|esta|to|estou|temos) (?:tendo |com |pegando |enfrentando |vendo |muito |bastante |um |uma )*(?:muito |bastante |um |uma )*(?:transito|trafego|engarrafamento|engarrafado|engarrafada|congestionamento|congestionado|congestionada)\b|^tem (?:muito|bastante|um baita|um monte de) (?:transito|trafego|engarrafamento|congestionamento)\b/;
const QUESTION=/^(?:como|qual|quando|onde|porque|por que|sera|voce sabe|me diz|me fala|me explica|pode consultar|consegue ver|existe|vai ter|esta previsto|tem previsao|tem algum)\b/;
const NEGATED=/\b(?:nao tem|sem transito|sem congestionamento|sem engarrafamento|nao esta tendo|nao ta tendo)\b/;
export function classifyMaviTrafficReport(value){
 if(typeof value!=='string'||value.length>360)return null;
 const s=maviNormalize(value).replace(/^(?:(?:o|oh|ei|oi|ola|hey) )?(?:mavi|mavy|mave|marvi)\b\s*/, '');
 if(!s||!TRAFFIC.test(s)||NEGATED.test(s))return null;
 const explicit=REQUEST.test(s);
 if(QUESTION.test(s)&&!explicit)return null;
 // The report is always pinned to actual device GPS. Named remote locations
 // are not eligible for conversational auto-submission.
 if(!PLACE.test(s)&&!explicit)return null;
 if(explicit||LOCAL_OBSERVATION.test(s))return 'transito';
 return null;
}
