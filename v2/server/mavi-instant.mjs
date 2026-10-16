/**
 * Short, truthful, varied responses for common opening turns.
 * These never need a hosted LLM or map provider, so MAVI can start speaking
 * without first waiting through an NVIDIA warmup/timeout.
 */
const phrases={
 greeting:[
  'Oi! Sou a MAVI. Posso ajudar com sua rota, o trajeto e paradas no caminho. Pode falar!',
  'Olá! MAVI por aqui. Quer saber sobre a viagem ou procurar outro caminho?',
  'E aí! Estou pronta para ajudar na navegação. O que você precisa?'
 ],
 identity:[
  'Sou a MAVI, assistente de navegação do VANO Maps. O que gostaria de saber?',
  'Meu nome é MAVI! Ajudo com rotas, orientações e paradas reais durante a viagem.',
  'Eu sou a MAVI, sua assistente do VANO. Posso consultar a viagem e buscar alternativas.'
 ],
 about:[
  'Entendo pedidos sobre navegação e consulto os dados disponíveis no VANO. Não invento informações do trânsito.',
  'Trabalho com os dados de rota do VANO. Posso ajudar com o trajeto, mas não tenho como garantir segurança ou condições futuras.',
  'Sou a assistente do VANO. Uso o motor de rotas para calcular caminhos reais, em vez de inventar instruções.'
 ],
 help:[
  'Pode perguntar quanto falta, a próxima conversão ou a chegada. Também posso procurar lugares no caminho e propor outra rota.',
  'Tente pedir: quanto falta para chegar, tem mercado na minha rota, ou procure um caminho mais rápido. Também ajudo com GPS e voz.',
  'Posso consultar a previsão de chegada, o destino, a próxima rua e buscar paradas próximas. Quer experimentar?'
 ],
 thanks:[
  'Por nada! Precisando de outra rota, me chama.',
  'Disponha! Boa viagem!',
  'É só chamar. Estou por aqui para ajudar na navegação!'
 ]
};
export const MAVI_FAST_OPENING_INTENTS=new Set(Object.keys(phrases));
export function maviInstantAnswer(intent,random=Math.random){
 const alternatives=phrases[intent];
 if(!alternatives)return null;
 let r;
 try{r=Number(random());}catch{r=0;}
 const index=Number.isFinite(r)?Math.max(0,Math.min(alternatives.length-1,Math.floor(r*alternatives.length))):0;
 return alternatives[index];
}
