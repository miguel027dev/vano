import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMaviIntent,answerMaviInformation,maviProposalDecision,MAVI_ROUTE_INTENTS} from './maviAssistant.mjs';
import {classifyJev,chooseJevProposal} from './jevShared.mjs';
import {extractJevStreetRequest} from './jevStreetRouting.mjs';
const cases={
 greeting:['Oi Mavi','MAVI bom dia','Olá!','boa noite'],
 identity:['Mavi qual seu nome','quem é você','se apresente','você é quem'],
 help:['Mavi me ajuda','quais as funções','o que você faz','me diz os comandos','o que posso pedir'],
 thanks:['valeu mavi','obrigado','show'],
 repeat:['repete por favor','o que você disse','não ouvi','pode repetir'],
 arrival:['Mavi que horas eu chego','previsão de chegada','horário de chegada','quando vamos chegar'],
 remaining_time:['quanto tempo falta','quantos minutos faltam','quanto tempo pra chegar','falta muito tempo'],
 remaining_distance:['quantos quilômetros faltam','quantos km faltam','distância restante','quanto falta pra chegar em km'],
 progress:['quanto já andei','qual a porcentagem da rota','progresso do trajeto'],
 next_maneuver:['qual a próxima conversão','pra onde viro','o que faço agora','qual a próxima orientação','viro pra que lado'],
 next_street:['qual a próxima rua','nome da próxima rua','em que rua vou entrar'],
 current_street:['estou em qual rua','que rua estou','nome da rua atual'],
 destination:['para onde estou indo','qual o destino','pra onde vou'],
 clock:['que horas são','me diz as horas'],
 gps_status:['meu gps','sinal do GPS','minha localização','onde estou agora'],
 navigation_status:['a rota está ativa','navegação ativa','status da navegação'],
 route_summary:['como está minha rota','me fala da rota','resumo da viagem'],
 route_mode:['qual rota escolhi','qual rota estou usando','essa rota é tranquila'],
 speed:['qual minha velocidade','quantos por hora','velocidade atual'],
 speed_limit:['qual o limite de velocidade','qual a velocidade máxima','limite de velocidade'],
 traffic_info:['como está o trânsito','tem trânsito','trânsito na minha rota'],
 tolls_info:['tem pedágio','vou pagar pedágio','quanto custa o pedágio'],
 weather_unavailable:['vai chover','previsão do tempo','clima no destino'],
 incidents_unavailable:['tem acidente','tem blitz','tem enchente'],
 places_unavailable:['posto mais próximo','preciso de gasolina','onde tem hospital'],
 safety_info:['essa rota é segura','é perigoso','risco da rota'],
 mute_guidance:['silenciar as orientações','desliga a voz','tirar o som','modo silencioso'],
 unmute_guidance:['ativar a voz','liga o som','volta a falar','tirar do mudo'],
 avoid_ferries:['evita balsa','sem ferry','não quero balsa'],
 avoid_unpaved:['sem estrada de terra','evita estrada de terra','somente asfalto'],
 quiet_route:['quero rota mais tranquila','menos movimentado','rota mais calma'],
 short_route:['quero um caminho mais curto','menor distância','economizar quilômetros'],
 fast_route:['rota mais rápida','quero chegar mais cedo','menor tempo'],
 alternative:['Mavi troca rota','recalcula a rota','outro caminho','não gostei dessa rota'],
 avoid_tolls:['evitar pedágios','sem pedágio','não quero pedágio'],
 traffic:['evita trânsito','quero menos congestionamento']
};
test('Brazilian navigation assistant supports many natural paraphrases without cloud LLM',()=>{
 let total=0;
 for(const [expected,utterances] of Object.entries(cases)){
  for(const phrase of utterances){
   assert.equal(classifyMaviIntent(phrase),expected,phrase);
   total++;
  }
 }
 assert.ok(total>=92,'test suite intentionally covers broad utterance diversity');
});
test('out-of-domain questions cannot trigger a guessed route change',()=>{
 for(const text of ['qual a capital da frança','quanto custa minha corrida','tem polícia na esquina','qual meu cpf','liga para minha mãe']){
  assert.equal(MAVI_ROUTE_INTENTS.has(classifyMaviIntent(text)),false,text);
 }
});
const snap={
 hasRoute:true,navigationActive:true,gpsReady:true,destination:'Shopping Morumbi',
 vehicle:'carro',routeId:'fast',audioMuted:false,currentDuration:26,currentDistance:12.5,
 remainingMinutes:12,remainingKm:5.2,progress:0.58,arrivalClock:'18:45',
 speedKmh:40,postedLimit:50,nextInstruction:'Vire à esquerda para a Rua A',
 nextStreet:'Rua A',nextDistanceMeters:120,currentStreet:'Avenida Morumbi',
 localClock:'18:33'
};
test('answers use real per-request navigation state and never invent a current GPS reading',()=>{
 for(const intent of ['arrival','remaining_time','remaining_distance','progress','next_maneuver','next_street','current_street','speed','speed_limit','route_summary','destination','navigation_status','clock']){
  const r=answerMaviInformation(intent,snap);
  assert.equal(r.mode,'information',intent);
  assert.ok(r.text.length>15&&r.text.length<=450,intent);
 }
 assert.match(answerMaviInformation('arrival',snap).text,/18:45/);
 assert.match(answerMaviInformation('remaining_time',snap).text,/12 minutos/);
 assert.match(answerMaviInformation('remaining_distance',snap).text,/5,2/);
 assert.match(answerMaviInformation('next_maneuver',snap).text,/120 metros/);
 assert.match(answerMaviInformation('speed_limit',snap).text,/50 quilômetros/);
 const stale={...snap,gpsReady:false};
 assert.doesNotMatch(answerMaviInformation('speed',stale).text,/40 quilômetros/);
 assert.doesNotMatch(answerMaviInformation('speed_limit',stale).text,/50 quilômetros/);
 assert.doesNotMatch(answerMaviInformation('arrival',stale).text,/18:45/);
 assert.doesNotMatch(answerMaviInformation('next_maneuver',stale).text,/120 metros/);
 assert.match(answerMaviInformation('gps_status',stale).text,/aguard|nao tenho|não tenho|ainda/i);
 const noRoute={...snap,hasRoute:false,currentDuration:null,currentDistance:null};
 assert.match(answerMaviInformation('arrival',noRoute).text,/calcule uma rota/i);
 assert.match(answerMaviInformation('destination',{...snap,destination:''}).text,/não tenho um destino/i);
});
test('MAVI controls only allowlisted local navigation voice state',()=>{
 const mute=answerMaviInformation('mute_guidance',snap);
 const unmute=answerMaviInformation('unmute_guidance',{...snap,audioMuted:true});
 assert.deepEqual([mute.mode,mute.action],['action','mute_guidance']);
 assert.deepEqual([unmute.mode,unmute.action],['action','unmute_guidance']);
 for(const intent of ['weather_unavailable','incidents_unavailable','traffic_info','tolls_info','safety_info','places_unavailable'])
  assert.equal(answerMaviInformation(intent,snap).mode,'information');
});
test('yes/no, wake word variations and audio repetition do not spend route calls',()=>{
 for(const phrase of ['sim','Mavi pode','pode trocar','confirmar','aceito','vamos nessa','quero essa','vai nessa','isso','troque','fechado']){
  assert.equal(maviProposalDecision(phrase),'accept',phrase);
 }
 for(const phrase of ['não','Mavi não','cancela','mantenha','prefiro a atual','não quero','deixa como está']){
  assert.equal(maviProposalDecision(phrase),'reject',phrase);
 }
 assert.equal(maviProposalDecision('eu não quero passar pela Giovanni'),null);
 assert.equal(maviProposalDecision('quanto falta'),null);
});
test('real named-road commands keep their strict street geometry guard over catchall routes',()=>{
 assert.equal(extractJevStreetRequest('Mavi, não quero ir pela Giovanni Gronchi')?.kind,'avoid');
 assert.equal(classifyMaviIntent('Mavi, recalcula a rota'),'alternative');
 assert.equal(classifyJev('Mavi, evita pedágio'),'avoid_tolls');
 const source='1:old',geo=(shift)=>({type:'LineString',coordinates:[[-46.7,-23.6],[-46.69,-23.59+shift]]});
 const routes=[{id:'safe',duration:22,distance:6.5,geometry:geo(0)},
               {id:'fast',duration:24,distance:5.3,geometry:geo(.003)}];
 assert.equal(chooseJevProposal(routes,source,'short_route')?.id,'fast');
 assert.equal(chooseJevProposal(routes,source,'fast_route')?.id,'safe');
});
