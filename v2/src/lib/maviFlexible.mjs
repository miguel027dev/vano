/**
 * MAVI flexible phrase comprehension. Accent tolerant, wake-word tolerant,
 * weighted meaning checks; unlike exact full-sentence regexes it accepts
 * polite words, reordered phrases and common speech-recognition slips.
 * Changes to navigation are still always confirmed separately.
 */
import {maviNormalize} from './maviAssistant.mjs';
const norm=s=>maviNormalize(s).replace(/^(?:mas viu|ma vi|mas vi|mavi|mavy|ei mavi)\s+/,'');
const categoryMatchers=[
 ['grocery',/\b(?:mercad\w*|supermercad\w*|hipermercad\w*|mercear\w*|hortifruti|quitanda)\b/g],
 ['pharmacy',/\b(?:farmac\w*|drogari\w*)\b/g],
 ['hospital',/\b(?:hospital|pronto socorro|upa|unidade de pronto atendimento)\b/g],
 ['restaurant',/\b(?:restaurante\w*|lanchonet\w*|comer|almocar|jantar)\b/g],
 ['cafe',/\b(?:cafeteria\w*|cafe da manha)\b/g],
 ['parking',/\b(?:estacionament\w*|onde estacionar|parar o carro)\b/g],
];
const POI_SIGNAL=/\b(?:mais perto|mais proximo|proxima|proximo|proximos|perto|onde (?:tem|fica|encontro|ha)|encontr\w*|procur\w*|ach\w*|busc\w*|quero ir|preciso de|me lev\w*|mostrar|mostr\w*|tem algum|qual(?: e| o| a)?|ir no|ir na|no caminho|na rota|pelo caminho|ao longo|desvio|parada)\b/;
const ROUTE_SIGNAL=/\b(?:no meu caminho|no caminho|pelo caminho|ao longo da rota|na rota|perto do caminho|no trajeto|na viagem|durante a viagem|sem sair da rota|sem desviar muito|que fica no caminho|na minha rota)\b/;
export function parseMaviPlaceIntent(value){
 const s=norm(value);
 if(s.length<6||s.length>360||!POI_SIGNAL.test(s))return null;
 const categories=[];
 for(const [id,rx] of categoryMatchers){
  rx.lastIndex=0;let m;
  while((m=rx.exec(s)))categories.push({id,index:m.index});
 }
 if(!categories.length)return null;
 // Speech correction "mercado, quer dizer, farmácia" => most recent category.
 categories.sort((a,b)=>b.index-a.index);
 return {type:'poi',category:categories[0].id,scope:ROUTE_SIGNAL.test(s)?'route':'nearby'};
}
export function detectMaviResume(value){
 const s=norm(value);
 return /\b(?:continu\w* (?:a |a minha |a nossa )?(?:viagem|rota|trajeto)|voltar? (?:pro|para o|ao|no) destino (?:original|anterior)|seguir (?:para|pro) (?:o )?destino (?:original|final)|ir (?:para|pro) destino original|acab\w* (?:a )?parada|ja (?:terminei|parei)|retomar (?:viagem|rota|trajeto)|volta para meu destino|seguir viagem)\b/.test(s);
}
const HELP=/\b(?:voce|c[eê])\b.*\b(?:consegue|pode|sabe)\b.*\b(?:fazer|ajudar)|\b(?:o que|quais|qual)\b.*\b(?:coisas|funcoes|comandos|tarefas)\b|\b(?:me diga|me fala|me explica)\b.*\b(?:faz|consegue|ajuda)|\b(?:como|em que)\b.*\b(?:pode|consegue)\b.*\b(?:ajudar)\b/;
const REMAIN=/\b(?:quanto|quantos|qual)\b.*\b(?:falta|faltam|tempo|demora|minut)\w*|\b(?:falta muito|demora muito|quanto resta)\b/;
const DISTANCE=/\b(?:quanto|quantos|qual)\b.*\b(?:quilometro|kilometro|km|distancia|metros)\b|\b(?:longe|distancia restante)\b/;
const ARRIVAL=/\b(?:quando|que horas|qual horario|previsao)\b.*\b(?:chego|chegamos|chegar|chegada|destino)\b/;
const NEXT=/\b(?:proxim\w*|seguinte)\b.*\b(?:curva|conversao|instrucao|orientacao|manobra|virada|rua)\b|\b(?:onde|para onde|pra onde)\b.*\b(?:viro|virar|entrar)\b/;
export function contextualMaviIntent(value){
 const s=norm(value);
 if(!s)return null;
 if(HELP.test(s))return 'help';
 if(DISTANCE.test(s)&&REMAIN.test(s))return 'remaining_distance';
 if(ARRIVAL.test(s))return 'arrival';
 if(NEXT.test(s))return /rua/.test(s)&&!/manobra|curva|conversao/.test(s)?'next_street':'next_maneuver';
 if(REMAIN.test(s))return 'remaining_time';
 if(DISTANCE.test(s))return 'remaining_distance';
 return null;
}
