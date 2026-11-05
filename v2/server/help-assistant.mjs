const TOPICS=[
 {id:'location',terms:/gps|localiza|posi[cç][aã]o|permiss/i,answer:'Use Minha localização no mapa e permita o GPS no navegador. Se não quiser permitir, informe uma origem manualmente. A precisão depende do aparelho e da conexão.',links:[{label:'Abrir mapa',href:'/mapa'}]},
 {id:'password',terms:/senha|recuper|acesso|login|entrar/i,answer:'Para recuperar o acesso, abra Recuperar senha e informe seu e-mail. A resposta é genérica para proteger a conta. Confira a caixa de entrada e o spam. O VANO nunca pede sua senha no chat.',links:[{label:'Recuperar senha',href:'/recuperar-senha'},{label:'Entrar',href:'/entrar'}]},
 {id:'verify',terms:/confirma|verifica|cadastro|registr/i,answer:'Depois do cadastro por e-mail, abra o link de confirmação recebido. Se precisar, solicite o reenvio e confira o spam. Enquanto isso, é possível explorar o mapa sem conta.',links:[{label:'Reenviar confirmação',href:'/reenviar-confirmacao'},{label:'Explorar mapa',href:'/mapa'}]},
 {id:'saved',terms:/favorit|salv|casa|trabalho/i,answer:'Em Lugares salvos, escolha Adicionar lugar e informe nome e endereço. Para ajustar suas informações pessoais, abra Minha conta.',links:[{label:'Lugares salvos',href:'/favoritos'},{label:'Minha conta',href:'/conta'}]},
 {id:'preferences',terms:/prefer|personal|tema|idioma|ped[aá]gio|ve[ií]culo/i,answer:'Ajuste veículo, prioridade de rota, pedágios, alertas, tema e idioma em Configurações. Você pode personalizar depois de abrir o mapa.',links:[{label:'Configurações',href:'/configuracoes'},{label:'Personalizar',href:'/personalizar'}]},
 {id:'privacy',terms:/exclu|privaci|dado|conta/i,answer:'Em Minha conta você encontra exportação dos seus dados e a opção de solicitar exclusão. A política explica os limites atuais. Este assistente não consulta nem altera sua conta.',links:[{label:'Minha conta',href:'/conta'},{label:'Privacidade',href:'/privacidade'}]},
 {id:'routes',terms:/rota|trajeto|navega|mapa|destino|segur/i,answer:'Busque um destino no mapa, confira a origem e compare as alternativas antes de iniciar. Estimativas e alertas dependem de cobertura e conexão; nenhuma rota garante segurança.',links:[{label:'Abrir mapa',href:'/mapa'},{label:'Orientações de navegação',href:'/seguranca-na-navegacao'}]}
];
const UNKNOWN={answer:'Posso orientar sobre GPS, acesso, confirmação de e-mail, lugares salvos, preferências, dados e rotas. Escolha um desses assuntos. Não consigo operar sua conta nem resolver emergências.',links:[{label:'Ajuda do VANO',href:'/ajuda'}]};
export function localHelp(question){
 const topic=TOPICS.find(item=>item.terms.test(question));
 return {id:topic?.id||'unknown',answer:(topic||UNKNOWN).answer,links:(topic||UNKNOWN).links,source:'local'};
}
export function createHelpAssistant(){
 return async function ask(input={}){
  if(typeof input.question!=='string'||input.question.trim().length<3||input.question.length>600)throw Object.assign(new Error('Escreva uma pergunta de 3 a 600 caracteres.'),{status:400});
  const question=input.question.trim();
  if(/[^\s@]+@[^\s@]+\.[^\s@]+|(?:-?\d{1,3}\.\d{4,})/i.test(question))return {source:'local',id:'private',answer:'Remova dados pessoais da pergunta. Descreva apenas sua dúvida sobre o uso do VANO.',links:[]};
  return localHelp(question);
 };
}
