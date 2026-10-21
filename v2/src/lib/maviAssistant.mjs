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
 // Deterministic map tools respond in milliseconds without a remote LLM.
 if(matches(s,/^(?:centraliza|centralizar|centralize|recentraliza|recentralizar|volta|voltar)(?: o mapa| a camera| a tela| pra mim| para mim| na minha localizacao| no meu carro)$/))return 'recenter_map';
 if(matches(s,/^(?:mostra|mostrar|mostre|exiba|exibir|quero ver)(?: a| o)? (?:rota inteira|rota toda|trajeto inteiro|trajeto todo|visao geral (?:da rota|do percurso)|percurso completo)$/))return 'route_overview';
 if(matches(s,/^(?:mostra|mostrar|mostre|liga|ligar|ative|ativar|exiba|exibir)(?: a camada de| o| os)? (?:transito|trafego)(?: no mapa)?$/))return 'show_traffic';
 if(matches(s,/^(?:esconde|esconder|oculta|ocultar|desliga|desligar|remove|remover|tira|tirar)(?: a camada de| o| os)? (?:transito|trafego)(?: do mapa)?$/))return 'hide_traffic';
 // Read-only questions must be recognized BEFORE old routing triggers
 // (e.g. "qual a distância da rota?" is not a request to change it).
 if(matches(s,/^(?:oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem|tudo certo|fala|salve|opa|alo|ta ai|esta ai|me ouve|esta me ouvindo|mavi)\b|(?:mavi )?tudo (?:bem|certo)/))return 'greeting';
 if(matches(s,/\b(?:quem e voce|qual seu nome|se apresente|quem ta falando|voce e quem)\b/))return 'identity';
 if(matches(s,/\b(?:como voce funciona|como funciona a mavi|voce e uma inteligencia|usa inteligencia artificial)\b/))return 'about';
 if(matches(s,/\b(?:o que voce faz|o que sabe fazer|me ajuda|ajuda|comandos|exemplos|opcoes de voz|o que posso pedir|quais as funcoes|quais funcoes)\b/))return 'help';
 if(matches(s,/\b(?:obrigad[oa]|valeu|agradec|show|perfeito)\b/))return 'thanks';
 if(matches(s,/\b(?:repete|repita|fale de novo|o que voce disse|nao ouvi|pode repetir|repete por favor)\b/))return 'repeat';
 if(matches(s,/\b(?:desligar|desliga|desative|silencia|silenciar|mutar|muta|tirar|sem)\b.*\b(?:voz|som|audio|narracao|instrucoes|orientacoes)\b|\b(?:modo silencioso|ficar sem som)\b/))return 'mute_guidance';
 if(matches(s,/\b(?:ligar|liga|ativar|ative|habilita|habilitar|volta|coloca)\b.*\b(?:voz|som|audio|narracao|instrucoes|orientacoes)\b|\b(?:tirar do mudo|voltar a falar|volta a falar)\b/))return 'unmute_guidance';
 if(matches(s,/\b(?:quanto e o limite|limite de velocidade|velocidade maxima|qual o limite|radar de velocidade maxima)\b/))return 'speed_limit';
 if(matches(s,/\b(?:qual minha velocidade|que velocidade|velocidade atual|quanto estou correndo|quantos por hora|a quantos por hora)\b/))return 'speed';
 if(matches(s,/\b(?:gps|sinal do gps|localizacao funcionando|minha posicao|onde estou agora|minha localizacao)\b/))return 'gps_status';
 if(matches(s,/\b(?:qual(?: e| foi)? (?:o|meu) destino|para onde estou indo|pra onde vou|onde fica meu destino|nome do destino|aonde vamos)\b/))return 'destination';
 if(matches(s,/\b(?:que horas sao|qual e a hora|me diz as horas|horario agora)\b/))return 'clock';
 if(matches(s,/\b(?:quando(?: eu| vamos)? cheg\w*|que horas(?: eu| nos)? cheg\w*|horario de chegada|previsao de chegada|hora de chegada|qual(?: e)? a chegada)\b/))return 'arrival';
 if(matches(s,/\b(?:quantos kilometros|quantos quilometros|quantos km|quantos metros falta|distancia restante|quanto falta de distancia|quantos km falta|qual distancia|distancia ate|quanto falta pra chegar em km|quanto falta em (?:km|quilometros)|ta longe|esta longe)\b/))return 'remaining_distance';
 if(matches(s,/\b(?:quanto tempo falta|quantos minutos falt\w*|quanto falta pra chegar|falta muito tempo|tempo restante|quanto demora|quanto tempo ate|quanto tempo pra chegar|em quantos minutos)\b/))return 'remaining_time';
 if(matches(s,/\b(?:quanto ja andei|quanto percorri|porcentagem da rota|quantos por cento da rota|quanto da rota eu fiz|progresso do trajeto)\b/))return 'progress';
 if(matches(s,/\b(?:proxima conversao|proxima curva|proxima manobra|proxima virada|onde vou virar|para onde eu viro|pra onde viro|viro pra que lado|viro a esquerda|viro a direita|qual a proxima instrucao|qual a proxima orientacao|o que faco agora|qual proximo passo|o que vem agora|repete a orientacao|proximo comando)\b/))return 'next_maneuver';
 if(matches(s,/\b(?:qual a proxima rua|qual rua vou pegar|nome da proxima rua|qual avenida vem agora|em que rua vou entrar)\b/))return 'next_street';
 if(matches(s,/\b(?:estou em qual rua|que rua estou|nome da rua atual|em qual avenida estou)\b/))return 'current_street';
 if(matches(s,/\b(?:a rota esta ativa|navegacao ativa|estou navegando|ja comecou a rota|a navegacao comecou|status da navegacao)\b/))return 'navigation_status';
 if(matches(s,/\b(?:qual veiculo|estou de carro|estou de moto|modo carro ou moto|qual transporte selecionado)\b/))return 'vehicle';
 if(matches(s,/\b(?:qual rota escolhi|qual rota estou usando|essa rota e rapida|essa rota e tranquila|qual o tipo de rota|modo da rota)\b/))return 'route_mode';
 if(matches(s,/\b(?:como esta o percurso|como esta (?:a|minha) rota|qual meu percurso|me fala da rota|resuma a rota|resumo da viagem|informacoes da rota|como esta minha viagem|situacao do trajeto|resumo do trajeto)\b/))return 'route_summary';
 if(matches(s,/\b(?:tem pedagio|tem pedagios|essa rota tem pedagio|vou pagar pedagio|quanto custa o pedagio|valor do pedagio|quanto gasto em pedagio)\b/))return 'tolls_info';
 if(matches(s,/\b(?:como esta o transito|tem transito|esta congestionado|ta engarrafado|condicao do transito|transito na minha rota|transito pela frente)\b/))return 'traffic_info';
 if(matches(s,/\b(?:vai chover|tempo agora|como esta o tempo|previsao do tempo|clima no destino|temperatura)\b/))return 'weather_unavailable';
 if(matches(s,/\b(?:tem acidente|tem bloqueio|tem manifestacao|tem enchente|tem alagamento|tem blitz|onde tem policia|rua interditada)\b/))return 'incidents_unavailable';
 // The POI parser handles real, verified establishments before the intent classifier.
 // Only unsupported categories should return places_unavailable.
 if(matches(s,/\b(?:onde tem banheiro|banheiro mais proximo)\b/))return 'places_unavailable';
 if(matches(s,/\b(?:esta seguro|essa rota e segura|e perigoso|risco da rota|tem assalto|zona de risco|areas perigosas|a rota e segura)\b/))return 'safety_info';
 if(matches(s,/\b(?:sem balsa|evita balsa|evitar balsa|evita ferry|sem ferry|nao quero balsa|sem barcos)\b/))return 'avoid_ferries';
 if(matches(s,/\b(?:sem estrada de terra|evita estrada de terra|evitar terra|evita via sem asfalto|so asfalto|somente asfalto|evitar vias nao pavimentadas)\b/))return 'avoid_unpaved';
 if(matches(s,/\b(?:mais tranquila|rota tranquila|menos movimentad\w*|menos estressante|quero sossego|rota mais calma|menos agitada)\b/))return 'quiet_route';
 if(matches(s,/\b(?:mais curta|menor distancia|caminho mais curto|economizar quilometros)\b/))return 'short_route';
 if(matches(s,/\b(?:rota mais rapida|mais rapido|menor tempo|chegar mais cedo|economizar tempo|prioriza tempo|priorize tempo)\b/))return 'fast_route';
 if(matches(s,/\b(?:mais um caminho|me mostra outra opcao|tenta uma rota diferente|nao curti esse trajeto|outra opcao de trajeto)\b/))return 'alternative';
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
 const variant=Math.abs(Math.trunc(Number(c.replyVariant)||0))%3;
 const choose=(...items)=>items[variant];
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
  case 'greeting':return text(intent,c.firstMaviGreeting===true?
    'Olá! Eu sou a MAVI, sua assistente de voz do VANO Maps. Posso responder sobre o trajeto, encontrar alternativas e mostrar uma rota antes de você decidir. É só falar comigo!':
    choose('Oi! Pode falar.','Opa! Tô te ouvindo.','Oi, tô aqui. O que precisa?'));

  case 'identity':return text(intent,choose('Sou a MAVI, sua copilota no VANO.','MAVI! Tô aqui pra ajudar no caminho.','Pode me chamar de MAVI. Eu cuido da navegação.'));

  case 'about':return text(intent,'Eu entendo comandos de navegação e uso os dados calculados pelo VANO. Não invento rotas, acidentes ou horários.');
  case 'thanks':return text(intent,choose('Imagina!','Tamo junto!','Por nada!'));

  case 'help':return text(intent,choose('Posso buscar rotas, conferir o tempo e controlar o mapa. O que quer fazer?','Posso mostrar trajetos, calcular alternativas e informar sua chegada.','Peça outra rota, diga “quanto falta” ou “mostra a rota inteira”.'));

  case 'repeat':return text(intent,'Posso repetir. Se a última resposta não foi ouvida, diga novamente seu pedido ou repita a orientação de navegação.');
  case 'recenter_map':return text(intent,gps?'Centralizando o mapa na sua posição.':'Não tenho GPS atualizado para centralizar o mapa.',gps?'recenter_map':undefined);
  case 'route_overview':{
   if(!route)return text(intent,'Primeiro escolha um destino para visualizar a rota inteira.');
   const moving=active&&(!gps||speed===null||speed>2);
   return text(intent,moving?'Por segurança, só posso afastar a câmera para mostrar a rota inteira quando você estiver parado.':'Vou mostrar o trajeto completo. Para voltar ao acompanhamento, toque em localização.',moving?undefined:'route_overview');
  }
  case 'show_traffic':return text(intent,'Exibindo as informações de trânsito disponíveis no mapa.','show_traffic');
  case 'hide_traffic':return text(intent,'Ocultando a camada de trânsito no mapa.','hide_traffic');
  case 'mute_guidance':return text(intent,c.audioMuted===true?'As orientações de navegação já estão silenciadas.':'Vou silenciar as orientações de navegação. Você ainda pode falar comigo.','mute_guidance');
  case 'unmute_guidance':return text(intent,c.audioMuted===true?'Vou ativar as orientações de navegação novamente.':'As orientações de navegação já estão ligadas.','unmute_guidance');
  case 'gps_status':return text(intent,gps?choose('GPS atualizado.','Seu GPS tá funcionando.','Tô recebendo sua posição.'):choose('Ainda sem GPS recente. Confira a localização.','Não tenho sua posição atualizada.','Ainda aguardando o GPS.'));

  case 'navigation_status':return text(intent,!route?'Ainda sem rota.':active?(gps?choose('Navegação ativa, GPS atualizado.','Tá tudo certo: rota e GPS ativos.','Estamos navegando. GPS conectado.'):'Navegação ativa, mas aguardando GPS recente.'):'A rota tá pronta. É só iniciar.');

  case 'destination':return text(intent,target?choose('Seu destino é ','Estamos indo para ','O destino selecionado é ')+target+'.':'Ainda não tenho um destino escolhido.');

  case 'vehicle':return text(intent,c.vehicle==='moto'?'O modo moto está selecionado.':c.vehicle==='carro'?'O modo carro está selecionado.':'Ainda não tenho um veículo selecionado.');
  case 'route_mode':return text(intent,!route?'Não há rota selecionada.':'Você está usando a opção de rota '+(c.routeId==='fast'?'mais rápida':c.routeId==='safe'?'alternativa do VANO':'selecionada')+'. Isso não significa garantia de segurança.');
  case 'speed':return text(intent,active&&gps&&speed!==null?'Sua velocidade indicada pelo GPS é de '+Math.round(speed)+' quilômetros por hora.':'Não tenho uma velocidade GPS recente e confiável para informar.');
  case 'speed_limit':return text(intent,active&&gps&&posted!==null?'O limite informado pelo provedor para este trecho é de '+Math.round(posted)+' quilômetros por hora. Confira a sinalização da via.':'Não tenho um limite de velocidade confirmado para o seu trecho. Confira as placas.');
  case 'arrival':return text(intent,!route?'Calcule uma rota primeiro.':active&&gps&&arrival?choose('Chegada prevista: ','Você deve chegar por volta das ','Previsão de chegada: ')+arrival+'.':duration!==null?'O percurso leva cerca de '+minutes(Math.ceil(duration))+', mas ainda não tenho uma chegada atualizada por GPS.':'Ainda não tenho uma chegada confiável.');

  case 'remaining_time':return text(intent,!route?'Ainda sem rota.':eta!==null?active&&!gps?'Sem GPS recente, o percurso completo leva cerca de '+minutes(Math.ceil(eta))+'.':choose('Faltam cerca de ','Mais ou menos ','Restam aproximadamente ')+minutes(Math.ceil(eta))+'.':'Ainda sem previsão confiável.');

  case 'remaining_distance':return text(intent,!route?'Ainda sem rota.':remainingDist!==null?(active&&!gps?'O percurso inteiro tem cerca de ':'Faltam cerca de ')+km(remainingDist)+' quilômetros.':'Ainda sem distância confiável.');

  case 'progress':{
   const p=numeric(c.progress,0,1);
   return text(intent,active&&gps&&p!==null?'Você percorreu aproximadamente '+Math.round(p*100)+' por cento do trajeto calculado.':'Ainda não tenho progresso confirmado pelo GPS.');
  }
  case 'next_maneuver':return text(intent,active&&gps&&step?choose('Próxima: ','Daqui a pouco: ','A próxima manobra é: ')+step+(numeric(c.nextDistanceMeters,0,200000)!==null?', em cerca de '+Math.round(c.nextDistanceMeters)+' metros.':'.'):'Ainda aguardando a próxima orientação pelo GPS.');

  case 'next_street':return text(intent,active&&gps&&nextRoad?'A próxima via indicada é '+nextRoad+'.':'Não tenho o nome confirmado da próxima via agora.');
  case 'current_street':return text(intent,active&&gps&&onRoad?'A via indicada neste momento é '+onRoad+'.':'Não tenho o nome da via atual confirmado neste momento.');
  case 'clock':return text(intent,/^\d\d:\d\d$/.test(c.localClock||'')?choose('Agora são ','São ','Aqui marca ')+c.localClock+'.':'Não consegui ler as horas.');
  case 'route_summary':return text(intent,!route?'Ainda não há rota calculada. Peça uma rota para começar.': 'Seu destino é '+(target||'o local selecionado')+'. '+(eta!==null?'O tempo estimado é '+minutes(Math.ceil(eta)): 'O tempo está indisponível')+(remainingDist!==null?' e a distância aproximada é '+km(remainingDist)+' quilômetros.':'.')+(active?' Navegação ativa.':' Navegação ainda não iniciada.'));
  case 'traffic_info':{
    // Only summarized, fresh provider evidence from the selected route; never
    // infer a global congestion percentage or sum overlapping incident delays.
    const t=c.trafficSummary;
    if(route&&t?.hasData===true){
      const count=numeric(t.heavySegments,0,20);
      const incidents=numeric(t.incidentCount,0,20);
      const delay=numeric(t.maxIncidentDelayMinutes,1,120);
      if(count!==null&&count>0)
        return text(intent,'Nos trechos monitorados da sua rota, há '+count+
          (count===1?' ponto de trânsito intenso.':' pontos de trânsito intenso.')+
          (delay!==null?' O maior atraso pontual informado é de cerca de '+minutes(delay)+'.':'')+
          ' Posso procurar uma alternativa para você comparar.');
      if(incidents!==null&&incidents>0)
        return text(intent,'Há '+incidents+' ocorrências de trânsito identificadas nos trechos monitorados da sua rota. Confira o mapa para detalhes.');
      return text(intent,'Tenho leituras recentes de trânsito para alguns trechos da sua rota, sem congestionamento intenso identificado nessas amostras. Isso não garante trânsito livre no trajeto inteiro.');
    }
    return text(intent,'O VANO considera dados do provedor ao calcular alternativas, mas não tenho um relatório de congestionamento verificado para este trecho nesta resposta. Posso buscar outra rota para comparar.');
  }
  case 'tolls_info':return text(intent,'Não tenho uma cobrança de pedágio confirmada para cada trecho da sua rota. Posso procurar uma alternativa com preferência para evitar pedágios.');
  case 'weather_unavailable':return text(intent,'Ainda não tenho previsão do tempo integrada à MAVI. Não vou arriscar uma previsão sem dados.');
  case 'incidents_unavailable':return text(intent,'Não tenho confirmação em tempo real desse tipo de ocorrência na sua rota. Confira a sinalização e as orientações oficiais.');
  case 'places_unavailable':return text(intent,'Ainda não consigo encontrar ou inserir lugares próximos por comando de voz. Use a busca de locais na tela do mapa.');
  case 'safety_info':return text(intent,'Não consigo garantir que uma rota seja segura. Posso comparar alternativas, mas mantenha atenção à via e às condições reais.');
  default:return null;
 }
}
/**
 * Classify a response to a single outstanding route offer. Never classify a
 * destination, road restriction, question or new routing preference as consent.
 * Only call this when a verified proposal is actually pending.
 */
export function maviProposalDecision(value){
 if(typeof value!=='string'||!value.trim()||value.length>360)return null;
 const s=maviNormalize(value);
 if(!s)return null;
 if(/^(?:troca|troque|muda|mude|recalcula|recalcular|procura|procurar|busca|buscar) (?:a |minha |essa )?rota\b/.test(s))return null;
 if(/\b(?:calcula|recalcula|procura|busca|mostra|encontra) (?:uma? |o )?(?:outra|outro|nova|novo)\b/.test(s))return null;
 // These are NEW commands, not consent to the current proposal.
 if(/\b(?:pedagio|pedagios|transito|trafego|congestionamento|outra rota|outro caminho|outra opcao|mais rapida|mais rapido|mais curta|mais curto|mais tranquila|mais tranquilo|evitar|evita|passar por|passar pela|estrada de terra|farmacia|hospital|posto|estacionamento|rua|avenida|primeira|segunda)\b/.test(s))return null;
 // A question must not silently approve a route.
 if(/[?]/.test(value)||/^(?:quanto|qual|quais|como|porque|por que|explica|me explica|depende|sera que|e se|mas e)\b/.test(s))return null;
 // Resolve explicit self-corrections using their final clear choice.
 if(/\b(?:pensando bem|na verdade|quer dizer|corrigindo)\b/.test(s)){
  const tail=s.split(/\b(?:pensando bem|na verdade|quer dizer|corrigindo)\b/).pop().trim();
  if(tail&&tail!==s)return maviProposalDecision(tail);
 }
 // Uncertainty is not a refusal, and must not discard an outstanding offer.
 if(/^(?:nao entendi|nao compreendi|nao sei|nao ouvi|nao tenho certeza)\b/.test(s))return null;
 // Avoid the common STT pattern "sim, não, melhor não" being accepted.
 if(/\b(?:melhor nao|nao quero|quero nao|nao troca|nao muda|deixa quieto|deixa como esta|agora nao|nem pensar|nao obrigado|prefiro a atual|mantenha a atual|manter a atual|continua na atual|depois|mais tarde)\b/.test(s))return 'reject';
 if(/^(?:nao|negativo|cancelar|cancela|mantem|mantenha|manter|fica|prefiro|deixa|esquece|recuso)(?:\b|$)/.test(s))return 'reject';
 if(/\bnao\b/.test(s))return null; // Unresolved negation is not authorization.
 // "Quero" on its own confirms; "quero ir ao mercado" is a NEW request.
 // Likewise, "pode" alone confirms, not "pode me dizer o preço?".
 if(/^quero\b/.test(s)&&!/^(?:quero|quero sim|quero essa(?: rota)?|quero esta(?: rota)?|quero a (?:nova|alternativa|sugerida)(?: rota)?|quero usar (?:essa|esta|a nova)(?: rota)?|quero trocar(?: de rota)?|quero mudar(?: de rota)?|quero ir por (?:essa|esta)(?: rota)?)$/.test(s))return null;
 if(/^pode\b/.test(s)&&!/^(?:pode|pode sim|pode ser|pode ser (?:essa|esta)(?: rota)?|pode usar (?:essa|esta|a nova)(?: rota)?|pode trocar(?: a rota)?|pode mudar(?: a rota)?|pode seguir(?: por (?:essa|esta)(?: rota)?)?)$/.test(s))return null;
 // A conditional approval carries a new requirement. Clarify before switching.
 if(/\b(?:mas|porem|desde que|contanto que|so se)\b/.test(s))return null;
 if(/\b(?:quero ir|preciso ir|me leva|me leve|faz uma parada|parar em)\b/.test(s))return null;
 if(/^(?:sim|quero|pode|claro|com certeza|combinado|aceito|aceita|confirmo|confirma|confirmar|confirmado|isso|essa mesmo|essa sim|ta bom|tudo bem|beleza|fechado|fechou|demorou|bora|bora la|manda|manda ver|vamos nessa|vai nessa|troca|troque|muda|usar|usa essa|escolho essa|gostei dessa|gostei desta|uhum|aham|aham sim|positivo|perfeito|pode ser|ok|okay)(?:\b|$)/.test(s)){
  // "Quero saber..." or "Pode explicar..." should be handled as questions.
  if(/^(?:quero|pode) (?:saber|entender|perguntar|ver se|que voce|me explica|me dizer|explicar|a diferenca|detalhes|repetir|esperar|continuar|dizer|falar)\b/.test(s))return null;
  return 'accept';
 }
 return null;
}
/** A follow-up question/hesitation keeps the existing proposal and route. */
export function maviProposalFollowup(value){
 if(maviProposalDecision(value))return null;
 const s=maviNormalize(value);
 if(/^(?:qual|quais|quanto|como|por que|porque|me explica|explica|tem|e o|e a|mas quanto|depende)\b|\b(?:diferenca|economiza|demora|pedagio|preco|custo|tempo a mais|quanto tempo)\b/.test(s))return 'question';
 if(/^(?:talvez|nao entendi|nao compreendi|pode repetir|repete|pera|espera|calma|to pensando|estou pensando|nao sei)\b/.test(s))return 'clarify';
 return null;
}
export const MAVI_ROUTE_INTENTS=new Set(['alternative','traffic','avoid_tolls','avoid_ferries','avoid_unpaved','quiet_route','fast_route','short_route','avoid_street','via_street']);
