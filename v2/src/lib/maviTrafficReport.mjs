/**
 * Deterministic MAVI on-road reporting. No LLM, no inferred GPS and no
 * publication for questions, denials or remote-location descriptions.
 */
import {maviNormalize} from './maviAssistant.mjs';
const INCIDENTS=[
 ['via_fechada',/\b(?:rua|via|avenida|estrada|pista|acesso|trecho) (?:ta |esta |foi |ficou )?(?:fechad[ao]|bloquead[ao]|interditad[ao])\b|\b(?:fecharam|interditaram|bloquearam) (?:a |essa |esta )?(?:rua|via|avenida|pista|estrada|acesso)\b/],
 ['alagamento',/\b(?:alagamento|alagada|alagado|enchente|inundacao|inundado|inundada)\b/],
 ['obstaculo',/\b(?:obstaculo|obstaculos|objeto na pista|objeto na rua|algo na pista|algo na rua)\b/],
 ['transito',/\b(?:transito|trafego|engarrafamento|engarrafado|engarrafada|congestionamento|congestionado|congestionada)\b/]
];
const HERE=/\b(?:aqui|agora|nessa rua|nesta rua|nessa via|nesta via|nessa avenida|nesta avenida|na minha rua|no meu caminho|nesse trecho|neste trecho|nessa pista|na minha frente|onde estou|onde a gente esta)\b/;
const REPORT_VERB=/\b(?:registra|registrar|registre|reporta|reportar|reporte|relata|relatar|fazer|faz|cria|criar|publique|publica|publicar|marque|marca|marcar|avisa|avisar)\b/;
const REPORT_NOUN=/\b(?:ocorrencia|alerta|denuncia|relato|transito|trafego|engarrafamento|congestionamento|alagamento|enchente|obstaculo|rua fechada|via fechada)\b/;
const OBSERVATION=/^(?:(?:eu|a gente|nos) )?(?:ta|esta|to|estou|temos|tem|ha|estamos) (?:tendo |com |pegando |enfrentando |vendo |muito |bastante |um |uma |um baita |um monte de )*|^(?:a|o|essa|esta|aqui|nesse|neste)\b/;
const QUESTION=/^(?:como|qual|quando|onde|porque|por que|sera|voce sabe|me diz|me fala|me explica|pode consultar|consegue ver|existe|vai ter|esta previsto|tem previsao|tem algum)\b/;
const NEGATION=/\b(?:nao tem|nao esta|nao ta|sem|nenhum|nenhuma|acabou|ja passou|nao existe)\b/;
const REMOTE=/\b(?:la|longe daqui|outra cidade|em outra rua|em outro bairro|no centro da cidade|amanha|ontem)\b/;
const WAKE=/^(?:(?:o|oh|ei|oi|ola|hey|opa) )?(?:mavi|mavy|mave|marvi)\b\s*/;
export function classifyMaviRoadReport(value){
 if(typeof value!=='string'||!value.trim()||value.length>360)return null;
 const s=maviNormalize(value).replace(WAKE,'').replace(/^(?:o|oh) (?=(?:ta|tem|essa|esta)\b)/,'');
 if(!s||QUESTION.test(s)||REMOTE.test(s)||NEGATION.test(s)||(/[?]/.test(value)&&!REPORT_VERB.test(s)))return null;
 if(/\b(?:na minha rota|na rota inteira|pela frente|mais a frente|vai ter)\b/.test(s)&&!REPORT_VERB.test(s))return null;
 const explicit=REPORT_VERB.test(s)&&REPORT_NOUN.test(s);
 const observed=OBSERVATION.test(s);
 if(!explicit&&!observed)return null;
 for(const [type,pattern] of INCIDENTS){
   if(pattern.test(s)&&(explicit||observed&&(HERE.test(s)||s.length<=75)))
     return type;
 }
 return null;
}
// Historical consumer: only the traffic subset.
export function classifyMaviTrafficReport(value){
 return classifyMaviRoadReport(value)==='transito'?'transito':null;
}
