/**
 * MAVI V2 deterministic navigation assistant.
 *
 * Intent parser is deliberately not an LLM: it never fabricates location,
 * traffic, live incidents, road limits or navigation routes.
 * Dynamic readouts come only from the current sanitized route/GPS snapshot.
 */
import {classifyJev} from './jevShared.mjs';

export function maviNormalize(value){
 return typeof value==='string'?value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N} ]/gu,' ')
  .replace(/\s+/g,' ').trim().replace(/^(?:(?:ei|oi|ola|ok|hey) )?(?:mavi|ma vi|mavy|mave|vano|jevi|javi) (?:por favor )?/,''):'';
}
const matches=(s,rx)=>rx.test(s);
export function classifyMaviIntent(value){
 if(typeof value!=='string'||!value.trim()||value.length>360)return 'unknown';
 const s=maviNormalize(value);
 // Read-only questions must be recognized BEFORE old routing triggers
 // (e.g. "qual a distância da rota?" is not a request to change it).
 if(matches(s,/^(?:oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem)\b|(?:mavi )?tudo bem/))return 'greeting';
 if(matches(s,/\b(?:quem e voce|qual seu nome|se apresente|quem ta falando|voce e quem)\b/))return 'identity';
 if(matches(s,/\b(?:como voce funciona|como funciona a mavi|voce e uma inteligencia|usa inteligencia artificial)\b/))return 'about';
 if(matches(s,/\b(?:o que voce faz|o que sabe fazer|me ajuda|ajuda|comandos|exemplos|opcoes de voz|o que posso pedir|quais as funcoes|quais funcoes)\b/))return 'help';
 if(matches(s,/\b(?:obrigad[oa]|valeu|agradec|show|perfeito)\b/))return 'thanks';
 if(matches(s,/\b(?:repete|repita|fale de novo|o que voce disse|nao ouvi|pode repetir|repete por favor)\b/))return 'repeat';
 if(matches(s,/\b(?:desligar|desliga|desative|silencia|silenciar|mutar|muta|tirar|sem)\b.*\b(?:voz|som|audio|narracao|instrucoes|orientacoes)\b|\b(?:modo silencioso|ficar sem som)\b/))return 'mute_guidance';
 if(matches(s,/\b(?:ligar|liga|ativar|ative|habilita|habilitar|volta|coloca)\b.*\b(?:voz|som|audio|narracao|instrucoes|orientacoes)\b|\b(?:tirar do mudo|voltar a falar)\b/))return 'unmute_guidance';
 if(matches(s,/\b(?:quanto e o limite|limite de velocidade|velocidade maxima|qual o limite|radar de velocidade maxima)\b/))return 'speed_limit';
 if(matches(s,/\b(?:qual minha velocidade|que velocidade|velocidade atual|quanto estou correndo|quantos por hora|a quantos por hora)\b/))return 'speed';
 if(matches(s,/\b(?:gps|sinal do gps|localizacao funcionando|minha posicao|onde estou agora|minha localizacao)\b/))return 'gps_status';
 if(matches(s,/\b(?:qual(?: e| foi)? o destino|para onde estou indo|pra onde vou|onde fica meu destino|nome do destino|aonde vamos)\b/))return 'destination';
 if(matches(s,/\b(?:que horas sao|qual e a hora|me diz as horas|horario agora)\b/))return 'clock';
 if(matches(s,/\b(?:quando(?: eu| vamos)? cheg|que horas(?: eu| nos)? cheg|horario de chegada|previsao de chegada|hora de chegada|qual(?: e)? a chegada)\b/))return 'arrival';
 if(matches(s,/\b(?:quanto tempo falta|quantos minutos falta|quanto falta pra chegar|falta muito tempo|tempo restante|quanto demora|quanto tempo ate|quanto tempo pra chegar|em quantos minutos)\b/))return 'remaining_time';
 if(matches(s,/\b(?:quantos kilometros|quantos quilometros|quantos km|quantos metros falta|distancia restante|quanto falta de distancia|quantos km falta|qual distancia|distancia ate|quanto falta pra chegar em km|ta longe|esta longe)\b/))return 'remaining_distance';
 if(matches(s,/\b(?:quanto ja andei|quanto percorri|porcentagem da rota|quantos por cento da rota|quanto da rota eu fiz|progresso do trajeto)\b/))return 'progress';
 if(matches(s,/\b(?:proxima conversao|proxima curva|proxima manobra|proxima virada|onde vou virar|para onde eu viro|pra onde viro|viro pra que lado|viro a esquerda|viro a direita|qual a proxima instrucao|qual a proxima orientacao|o que faco agora|qual proximo passo|o que vem agora|repete a orientacao|proximo comando)\b/))return 'next_maneuver';
 if(matches(s,/\b(?:qual a proxima rua|qual rua vou pegar|nome da proxima rua|qual avenida vem agora|em que rua vou entrar)\b/))return 'next_street';
 if(matches(s,/\b(?:estou em qual rua|que rua estou|nome da rua atual|em qual avenida estou)\b/))return 'current_street';
 if(matches(s,/\b(?:a rota esta ativa|navegacao ativa|estou navegando|ja comecou a rota|a navegacao comecou|status da navegacao)\b/))return 'navigation_status';
 if(matches(s,/\b(?:qual veiculo|estou de carro|estou de moto|modo carro ou moto|qual transporte selecionado)\b/))return 'vehicle';
 if(matches(s,/\b(?:qual rota escolhi|qual rota estou usando|essa rota e rapida|essa rota e tranquila|qual o tipo de rota|modo da rota)\b/))return 'route_mode';
 if(matches(s,/\b(?:como esta o percurso|como esta a rota|me fala da rota|resuma a rota|resumo da viagem|informacoes da rota|como esta minha viagem|situacao do trajeto|resumo do trajeto)\b/))return 'route_summary';
 if(matches(s,/\b(?:tem pedagio|tem pedagios|essa rota tem pedagio|vou pagar pedagio|quanto custa o pedagio|valor do pedagio|quanto gasto em pedagio)\b/))return 'tolls_info';
 if(matches(s,/\b(?:como esta o transito|tem transito|esta congestionado|ta engarrafado|condicao do transito|transito na minha rota|transito pela frente)\b/))return 'traffic_info';
 if(matches(s,/\b(?:vai chover|tempo agora|como esta o tempo|previsao do tempo|clima no destino|temperatura)\b/))return 'weather_unavailable';
 if(matches(s,/\b(?:tem acidente|tem bloqueio|tem manifestacao|tem enchente|tem alagamento|tem blitz|onde tem policia|rua interditada)\b/))return 'incidents_unavailable';
 if(matches(s,/\b(?:posto mais proximo|farmacia mais proxima|hospital mais proximo|mercado mais proximo|estacionamento mais proximo|procurar posto|preciso de gasolina|preciso de farmacia|onde tem hospital|onde tem banheiro|onde comer)\b/))return 'places_unavailable';
 if(matches(s,/\b(?:esta seguro|e perigoso|risco da rota|tem assalto|zona de risco|areas perigosas|a rota e segura)\b/))return 'safety_info';
 if(matches(s,/\b(?:sem balsa|evita balsa|evitar balsa|evita ferry|sem ferry|nao quero balsa|sem barcos)\b/))return 'avoid_ferries';
 if(matches(s,/\b(?:sem estrada de terra|evita estrada de terra|evitar terra|evita via sem asfalto|so asfalto|somente asfalto|evitar vias nao pavimentadas)\b/))return 'avoid_unpaved';
 if(matches(s,/\b(?:mais tranquila|rota tranquila|menos movimentad|menos estressante|quero sossego|rota mais calma|menos agitada)\b/))return 'quiet_route';
 if(matches(s,/\b(?:mais curta|menor distancia|caminho mais curto|economizar quilometros)\b/))return 'short_route';
 if(matches(s,/\b(?:rota mais rapida|mais rapido|menor tempo|chegar mais cedo|economizar tempo|prioriza tempo|priorize tempo)\b/))return 'fast_route';
 return classifyJev(value);
}

const trimLabel=value=>typeof value==='string'?value.replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,100):'';
const numeric=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
const text=(intent,message,action)=>({mode:action?'action':'information',intent,text:message,...(action?{action}:{})});
const safeContext=c=>c&&typeof c==='object'&&!Array.isArray(c)?c:{};
const km=v=>Number(v.toFixed(1)).toLocaleString('pt-BR',{maximumFractionDigits:1});
const minutes=v=>v<1?'menos de um minuto':v===1?'1 minuto':v+' minutos';
export function answerMaviInformation(intent,input){
 const c=safeContext(input);
 const active=c.navigationActive===true,gps=c.gpsReady===true;
 const route=c.hasRoute===true;
 const duration=numeric(c.currentDuration,0,10080);
 const kmTotal=numeric(c.currentDistance,0,3000);
 const remaining=numeric(c.remainingMinutes,0,10080);
 const distance=numeric(c.remainingKm,0,3000);
 const arrival=/^\d\d:\d\d$/.test(c.arrivalClock||'')?c.arrivalClock:null;
 const target=trimLabel(c.destination);
 const step=trimLabel(c.nextInstruction);
 const nextRoad=trimLabel(c.nextStreet);
 const onRoad=trimLabel(c.currentStreet);
 const speed=numeric(c.speedKmh,0,250);
 const posted=numeric(c.postedLimit,10,160);
 const eta=active&&gps&&remaining!==null?remaining:duration;
 const remainingDist=active&&gps&&distance!==null?distance:kmTotal;
 switch(intent){
  case 'greeting':return text(intent,'Olá! Sou a MAVI, sua copilota no VANO Maps. Posso consultar o trajeto ou procurar outra rota. O que você precisa?');
  case 'identity':return text(intent,'Eu sou a MAVI, assistente de navegação do VANO Maps. Ajudo você a entender o caminho e encontrar alternativas reais.');
  case 'about':return text(intent,'Eu entendo comandos de navegação e uso os dados calculados pelo VANO. Não invento rotas, acidentes ou horários.');
  case 'thanks':return text(intent,'Por nada! Boa viagem. Se precisar de outro caminho, é só chamar.');
  case 'help':return text(intent,'Você pode perguntar quanto falta, a hora de chegada, a próxima conversão, o destino, o limite de velocidade e o sinal do GPS. Também pode pedir para evitar uma avenida, buscar rota mais rápida, sem pedágio ou mais tranquila, e ligar ou desligar orientações de voz.');
  case 'repeat':return text(intent,'Posso repetir. Se a última resposta não foi ouvida, diga novamente seu pedido ou repita a orientação de navegação.');
  case 'mute_guidance':return text(intent,c.audioMuted===true?'As orientações de navegação já estão silenciadas.':'Vou silenciar as orientações de navegação. Você ainda pode falar comigo.','mute_guidance');
  case 'unmute_guidance':return text(intent,c.audioMuted===true?'Vou ativar as orientações de navegação novamente.':'As orientações de navegação já estão ligadas.','unmute_guidance');
  case 'gps_status':return text(intent,gps?'O GPS está recebendo uma posição recente.':'Ainda não tenho um sinal GPS recente para acompanhar sua posição. Confira a permissão de localização.');
  case 'navigation_status':return text(intent,!route?'Ainda não há rota calculada.':active?(gps?'A navegação está ativa e o GPS está atualizado.':'A navegação está ativa, mas estou aguardando uma posição GPS recente.'):'A rota está pronta para visualização. A navegação ainda não foi iniciada.');
  case 'destination':return text(intent,target?'Seu destino é '+target+'.':'Ainda não tenho um destino escolhido.');
  case 'vehicle':return text(intent,c.vehicle==='moto'?'O modo moto está selecionado.':c.vehicle==='carro'?'O modo carro está selecionado.':'Ainda não tenho um veículo selecionado.');
  case 'route_mode':return text(intent,!route?'Não há rota selecionada.':'Você está usando a opção de rota '+(c.routeId==='fast'?'mais rápida':c.routeId==='safe'?'alternativa do VANO':'selecionada')+'. Isso não significa garantia de segurança.');
  case 'speed':return text(intent,active&&gps&&speed!==null?'Sua velocidade indicada pelo GPS é de '+Math.round(speed)+' quilômetros por hora.':'Não tenho uma velocidade GPS recente e confiável para informar.');
  case 'speed_limit':return text(intent,active&&gps&&posted!==null?'O limite informado pelo provedor para este trecho é de '+Math.round(posted)+' quilômetros por hora. Confira a sinalização da via.':'Não tenho um limite de velocidade confirmado para o seu trecho. Confira as placas.');
  case 'arrival':return text(intent,!route?'Calcule uma rota primeiro para ter a previsão de chegada.':active&&gps&&arrival?'A previsão de chegada é por volta de '+arrival+'. É uma estimativa.': 'Ainda não tenho uma previsão de chegada atualizada por GPS. A rota planejada leva aproximadamente '+(duration===null?'um tempo indisponível':minutes(Math.ceil(duration)))+'.');
  case 'remaining_time':return text(intent,!route?'Ainda não há rota calculada.':eta!==null?(active&&!gps?'Sem GPS recente, a previsão do trajeto completo é de ':'Faltam aproximadamente ')+minutes(Math.ceil(eta))+'.':'Não tenho um tempo restante confiável agora.');
  case 'remaining_distance':return text(intent,!route?'Ainda não há rota calculada.':remainingDist!==null?(active&&!gps?'O trajeto completo tem aproximadamente ':'Faltam aproximadamente ')+km(remainingDist)+' quilômetros.':'Não tenho distância restante confiável agora.');
  case 'progress':{
   const p=numeric(c.progress,0,1);
   return text(intent,active&&gps&&p!==null?'Você percorreu aproximadamente '+Math.round(p*100)+' por cento do trajeto calculado.':'Ainda não tenho progresso confirmado pelo GPS.');
  }
  case 'next_maneuver':return text(intent,active&&gps&&step?'Próxima orientação: '+step+(numeric(c.nextDistanceMeters,0,200000)!==null?', em aproximadamente '+Math.round(c.nextDistanceMeters)+' metros.':''):'Ainda não tenho uma próxima orientação confirmada pelo GPS. Consulte a indicação na tela.');
  case 'next_street':return text(intent,active&&gps&&nextRoad?'A próxima via indicada é '+nextRoad+'.':'Não tenho o nome confirmado da próxima via agora.');
  case 'current_street':return text(intent,active&&gps&&onRoad?'A via indicada neste momento é '+onRoad+'.':'Não tenho o nome da via atual confirmado neste momento.');
  case 'clock':return text(intent,/^\d\d:\d\d$/.test(c.localClock||'')?'Agora são '+c.localClock+'.':'Não consegui ler a hora local deste dispositivo.');
  case 'route_summary':return text(intent,!route?'Ainda não há rota calculada. Peça uma rota para começar.': 'Seu destino é '+(target||'o local selecionado')+'. '+(eta!==null?'O tempo estimado é '+minutes(Math.ceil(eta)): 'O tempo está indisponível')+(remainingDist!==null?' e a distância aproximada é '+km(remainingDist)+' quilômetros.':'.')+(active?' Navegação ativa.':' Navegação ainda não iniciada.'));
  case 'traffic_info':return text(intent,'O VANO considera dados do provedor ao calcular alternativas, mas não tenho um relatório de congestionamento verificado para este trecho nesta resposta. Posso buscar outra rota para comparar.');
  case 'tolls_info':return text(intent,'Não tenho uma cobrança de pedágio confirmada para cada trecho da sua rota. Posso procurar uma alternativa com preferência para evitar pedágios.');
  case 'weather_unavailable':return text(intent,'Ainda não tenho previsão do tempo integrada à MAVI. Não vou arriscar uma previsão sem dados.');
  case 'incidents_unavailable':return text(intent,'Não tenho confirmação em tempo real desse tipo de ocorrência na sua rota. Confira a sinalização e as orientações oficiais.');
  case 'places_unavailable':return text(intent,'Ainda não consigo encontrar ou inserir lugares próximos por comando de voz. Use a busca de locais na tela do mapa.');
  case 'safety_info':return text(intent,'Não consigo garantir que uma rota seja segura. Posso comparar alternativas, mas mantenha atenção à via e às condições reais.');
  default:return null;
 }
}
export function maviProposalDecision(value){
 const s=maviNormalize(value);
 if(/^(?:sim|pode|pode trocar|pode mudar|aceito|confirmo|confirma|confirmar|usar|usa essa|quero essa|vai nessa|vamos nessa|escolho essa|troca|troque|muda|essa mesmo|isso|ok pode|fechado)(?:\b|$)/.test(s))return 'accept';
 if(/^(?:nao|nao quero|nao troca|nao muda|cancelar|cancela|deixa|manter|mantem|mantenha|fica|prefiro a atual|continuar na atual|deixa como esta|esquece)(?:\b|$)/.test(s))return 'reject';
 return null;
}
export const MAVI_ROUTE_INTENTS=new Set(['alternative','traffic','avoid_tolls','avoid_ferries','avoid_unpaved','quiet_route','fast_route','short_route','avoid_street','via_street']);
