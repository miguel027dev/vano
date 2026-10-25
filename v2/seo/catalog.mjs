/** VANO's public, human-readable content catalog. Consumed by React and by HTML pre-render. */
export const PUBLIC_PAGES = [
  {
    "path": "/sobre",
    "aliases": [
      "/about",
      "/o-que-e-vano-maps"
    ],
    "category": "Institucional",
    "title": "Conheça o VANO Maps",
    "description": "Descubra o VANO Maps: um aplicativo brasileiro para pesquisar destinos, visualizar trajetos e comparar opções de caminho com clareza.",
    "lead": "Um mapa simples de entender, para escolher seu caminho com mais informação.",
    "sections": [
      [
        "O que é o VANO?",
        "O VANO é um aplicativo brasileiro de mapas e navegação. Pesquise lugares, confira trajetos e, quando houver alternativas disponíveis, compare distância e tempo previsto."
      ],
      [
        "Como usar",
        "Abra o mapa, escolha seu destino e confira as informações antes de sair. As opções dependem da conexão, da localização e dos serviços de mapas disponíveis."
      ],
      [
        "O que é importante saber",
        "O trânsito muda e os mapas podem conter erros. Nenhum caminho é garantia de segurança. Respeite a sinalização e consulte o aplicativo com o veículo parado."
      ]
    ],
    "cta": "Abrir o mapa",
    "ctaHref": "/mapa"
  },
  {
    "path": "/ajuda",
    "aliases": [
      "/help"
    ],
    "category": "Suporte",
    "title": "Central de ajuda do VANO",
    "description": "Encontre respostas claras para dúvidas sobre GPS, pesquisa de destinos, rotas, conta, privacidade e problemas no VANO Maps.",
    "lead": "Tudo o que você precisa saber, sem complicação.",
    "sections": [
      [
        "Encontre seu destino",
        "Abra o mapa e pesquise um endereço ou lugar. Confira se o destino está certo antes de começar."
      ],
      [
        "Confira o caminho",
        "Veja o tempo previsto e a distância. Quando houver alternativas, compare as opções com o veículo parado."
      ],
      [
        "Localização e conta",
        "Para ver sua posição, autorize o acesso à localização no aparelho. Informações sobre conta e dados pessoais estão nas páginas de privacidade e exclusão de conta."
      ]
    ],
    "faq": [
      [
        "Como procuro um lugar?",
        "Abra o mapa, digite o endereço ou nome do lugar e escolha o resultado correto."
      ],
      [
        "Por que só aparece uma rota?",
        "Às vezes o serviço de mapas encontra apenas um caminho viável. Isso não quer dizer que outras opções foram escondidas."
      ],
      [
        "Por que o tempo de viagem mudou?",
        "É uma previsão. Trânsito, obras e atualizações do mapa podem alterar o tempo informado."
      ],
      [
        "Meu GPS não funciona. O que faço?",
        "Ative a localização, confira a permissão no navegador ou aplicativo e tente novamente em um local com sinal melhor. Se necessário, informe a origem manualmente."
      ],
      [
        "Posso usar o VANO sem internet?",
        "O GPS pode identificar a posição sem rede, mas carregar mapas, buscar lugares e calcular rotas normalmente exige internet."
      ],
      [
        "O VANO garante que uma rota é segura?",
        "Não. Nenhum mapa elimina todos os riscos. Respeite a sinalização e as condições reais da via."
      ],
      [
        "Posso planejar viagens de moto?",
        "O aplicativo pode apresentar a opção de moto, mas trajetos específicos dependem do serviço de roteamento disponível. Respeite as restrições da via."
      ],
      [
        "E se a indicação do mapa estiver errada?",
        "Pare em um local seguro para conferir o destino. A sinalização e as leis de trânsito têm prioridade."
      ],
      [
        "Como acesso minha conta?",
        "Use a opção de entrar no aplicativo e escolha o método associado ao seu cadastro."
      ],
      [
        "Como excluo minha conta?",
        "Consulte a página Excluir conta para encontrar as orientações e conhecer as condições de remoção dos dados."
      ],
      [
        "Como meus dados são usados?",
        "A Política de privacidade explica quais informações podem ser tratadas, por quê e quais direitos você tem."
      ],
      [
        "Como relato um erro?",
        "Descreva a tela afetada e o que aconteceu nos canais oficiais disponíveis. Não compartilhe senhas nem dados pessoais de outras pessoas."
      ]
    ],
    "cta": "Abrir o mapa",
    "ctaHref": "/mapa"
  },
  {
    "path": "/contato",
    "category": "Institucional",
    "title": "Contato e orientações",
    "description": "Encontre os caminhos oficiais para tirar dúvidas sobre o VANO Maps, consultar a privacidade e entender a exclusão de conta.",
    "lead": "A informação certa para cada assunto, sem inventar canais de atendimento.",
    "sections": [
      [
        "Dúvidas sobre o aplicativo",
        "Consulte a Central de ajuda para orientações sobre GPS, busca de endereços, rotas e conta."
      ],
      [
        "Dados pessoais e exclusão",
        "Veja a Política de privacidade para entender o uso de dados. A página Excluir conta explica as orientações disponíveis."
      ],
      [
        "Outros assuntos",
        "Informações para imprensa, parcerias e canais de atendimento serão publicadas aqui quando forem confirmadas. Não compartilhe senhas ou códigos com perfis não oficiais."
      ]
    ],
    "cta": "Consultar a ajuda",
    "ctaHref": "/ajuda"
  },
  {
    path:'/imprensa',category:'Institucional',title:'VANO para imprensa',description:'Visão geral do VANO Maps, suas funcionalidades e informações relevantes para comunicação e imprensa.',lead:'O que estamos construindo — sem prometer funcionalidades que ainda dependem de validação.',
    sections:[['Sobre o produto','VANO Maps é um projeto de navegação que reúne mapas, pesquisa por destinos, alternativas de rotas e acompanhamento do trajeto.'],['O que distingue a proposta','A experiência busca comparar rotas e apresentar contexto de navegação de forma simples. Recursos experimentais são identificados, e a qualidade depende da cobertura do provedor e das fontes disponíveis.'],['Materiais e informações','A apresentação institucional e as informações de produto podem ser consultadas nas páginas públicas. Solicitações formais devem usar os canais de contato verificados.']],cta:'Conhecer o VANO',ctaHref:'/sobre'
  },
  {
    path:'/testar',category:'Produto',title:'Teste o VANO Maps',description:'Experimente a busca de endereços, a comparação de rotas e a navegação do VANO em versão de testes.',lead:'Explore o aplicativo e avalie a experiência antes de confiar nele em um trajeto importante.',
    sections:[['Comece com uma busca','Abra o mapa, escolha um destino conhecido e confira as opções de trajeto apresentadas.'],['Compare o resultado','Observe duração, distância, informações de trânsito e origem dos dados. Alguns recursos requerem integração externa e podem não estar habilitados.'],['Envie sugestões com responsabilidade','Use o suporte para relatar erros de interface, rotas incorretas e problemas de acessibilidade; não compartilhe informações pessoais de terceiros.']],cta:'Testar no mapa',ctaHref:'/mapa'
  },
  {
    path:'/termos-de-uso',aliases:['/termos','/terms'],category:'Legal',title:'Termos de uso do VANO Maps',description:'Condições de uso, responsabilidades e limitações dos serviços de mapas, navegação e ocorrências do VANO.',lead:'Informações essenciais para utilizar a plataforma com consciência.',
    sections:[['1. Finalidade do serviço','O VANO oferece visualização de mapas, pesquisa por endereços, planejamento de trajetos e recursos relacionados. Algumas funções podem estar em teste, indisponíveis ou dependentes de terceiros.'],['2. Navegação e trânsito','Tempos e trajetos são estimativas. Informações sobre trânsito, ocorrências e segurança podem estar desatualizadas ou incompletas. Siga sempre as leis de trânsito e jamais interaja com o aplicativo enquanto dirige.'],['3. Conta e conduta','Você é responsável pelas informações que envia, por proteger suas credenciais e por utilizar a plataforma de modo lícito. Não publique dados falsos, ameaças ou informações pessoais indevidas.'],['4. Serviços de terceiros','Mapas, geocodificação, tráfego e autenticação podem utilizar provedores externos. A disponibilidade e as condições desses serviços podem variar.'],['5. Disponibilidade e alterações','Os recursos podem ser atualizados ou suspensos por manutenção, segurança ou mudanças técnicas. Informações relevantes devem ser comunicadas nos canais do serviço.'],['6. Direitos e atendimento','As regras de privacidade, acesso e exclusão de dados são detalhadas na política correspondente. Este texto precisa de revisão jurídica e identificação completa do controlador antes da disponibilização comercial definitiva.']],cta:'Ver privacidade',ctaHref:'/politica-de-privacidade'
  },
  {
    path:'/politica-de-privacidade',aliases:['/privacidade','/privacy'],category:'Legal',title:'Política de privacidade do VANO',description:'Saiba como o VANO Maps trata dados de conta, GPS, rotas, histórico e integrações externas.',lead:'Localização é um dado sensível na prática: explicamos quando ela é usada e o que ainda precisa ser validado.',
    sections:[['1. Dados de conta','O sistema pode processar nome, e-mail, identificador de autenticação, credenciais protegidas e preferências para oferecer acesso e personalização.'],['2. Localização e rotas','Quando autorizado, coordenadas podem ser utilizadas para centralizar o mapa e calcular rotas. Origem e destino podem ser enviados a provedores de navegação para gerar resultados. Não presuma que a navegação funciona sem internet.'],['3. Histórico e ocorrências','Conforme as funcionalidades habilitadas, lugares salvos, trajetos, rotinas e relatos podem ser armazenados. Relatos não verificados não devem ser tratados como fatos confirmados.'],['4. Terceiros','Provedores de mapas, busca, e-mail e autenticação podem processar dados necessários para cada serviço conforme suas próprias políticas.'],['5. Direitos LGPD','Você pode solicitar informações sobre tratamento, correção e eliminação nos casos previstos pela legislação. O aplicativo oferece recursos de conta, e fluxos adicionais precisam ser verificados com o operador.'],['6. Retenção e segurança','A retenção e as medidas de segurança dependem da finalidade do tratamento e da configuração do serviço em produção. Antes da publicação comercial definitiva, é necessário validar e divulgar prazos de conservação, medidas de proteção e canais para solicitações relacionadas a dados.'],['7. Responsável e atualização','Antes de operar comercialmente, esta política exige identificação completa do controlador, canal de contato validado, prazos aplicáveis e revisão jurídica.']],cta:'Saiba como excluir conta',ctaHref:'/excluir-conta'
  },
  {
    path:'/excluir-conta',category:'Legal',title:'Como excluir sua conta VANO',description:'Entenda como solicitar a exclusão da conta e dos dados associados no VANO Maps.',lead:'Você mantém o controle sobre a sua conta.',
    sections:[['Dentro do aplicativo','Entre em Minha conta e procure a opção de excluir conta. Dependendo do método de login, uma confirmação de identidade poderá ser necessária.'],['Se não conseguir entrar','Consulte o suporte pelo canal oficial para verificar as alternativas disponíveis. Não compartilhe sua senha.'],['Dados e retenção','Alguns registros podem exigir conservação legal, antifraude ou de segurança. O tratamento deve seguir a Política de privacidade e a legislação aplicável.']],cta:'Abrir Minha conta',ctaHref:'/conta'
  },
  {
    path:'/rotas-para-evitar-transito',category:'Rotas e tecnologia',title:'Rotas para evitar trânsito',description:'Como comparar trajetos para tentar reduzir atrasos e congestionamentos usando dados de trânsito.',lead:'O melhor trajeto muda conforme a hora, a localização e os acontecimentos na via.',
    sections:[['Compare além da distância','A rota mais curta nem sempre é a mais rápida: semáforos, obras e fluxo de veículos podem alterar o tempo estimado.'],['Tráfego atualizado','Quando a integração permite, a duração considera informações de trânsito. A atualização e a cobertura são determinadas pelo provedor.'],['Micro-rotas e desvios','O motor original VANO investiga alternativas e pequenos ajustes de percurso, mas esses recursos só ficam disponíveis na V2 quando o backend original estiver conectado e validado.']],faq:[["Como o VANO tenta evitar congestionamentos?","O aplicativo compara trajetos com duração e distância informadas pelo provedor conectado. Quando os dados de trânsito estão disponíveis, as estimativas podem refletir as condições recentes das vias."],["A rota mais curta sempre é a mais rápida?","Não. Um caminho mais longo pode exigir menos tempo quando outros acessos apresentam tráfego intenso, semáforos ou restrições."],["As informações de trânsito são em tempo real?","A atualização depende do provedor e da cobertura regional. O tempo mostrado é uma estimativa, não uma promessa de chegada."]],cta:'Comparar trajetos',ctaHref:'/mapa'
  },
  {
    path:'/alternativa-ao-waze',category:'Alternativas',title:'VANO Maps: alternativa ao Waze',description:'Conheça o VANO Maps como alternativa de navegação ao Waze e entenda diferenças de proposta e disponibilidade.',lead:'Uma alternativa para planejar rotas e comparar caminhos com uma interface enxuta.',
    sections:[['Outra forma de navegar','O VANO aposta em uma experiência de mapa simples, busca rápida e comparação entre trajetos disponíveis.'],['Rotas e inteligência','O projeto trabalha na integração de rotas mais rápidas e análise contextual. A disponibilidade de micro-rotas depende de um serviço de roteamento conectado.'],['Escolha com informação','Compare os recursos, cobertura e limites de cada aplicativo. O VANO não é afiliado, patrocinado nem endossado pelo Waze ou pelo Google.']],faq:[['VANO é o mesmo que Waze?','Não. São produtos distintos, com tecnologias, cobertura e políticas próprias.'],['Posso usar durante a direção?','Configure o destino antes de sair e evite manusear o telefone enquanto dirige.']],cta:'Conhecer o mapa',ctaHref:'/mapa'
  },
  {
    path:'/rota-mais-rapida',category:'Rotas e tecnologia',title:'Como encontrar a rota mais rápida',description:'Entenda as diferenças entre o caminho mais curto e o mais rápido ao calcular uma viagem.',lead:'Mais rápida não significa sempre menor distância.',
    sections:[['Duração estimada','O tempo previsto usa dados do provedor escolhido e pode mudar durante o percurso.'],['Alternativas de rota','Compare duração, distância, manobras e condições de tráfego. Quando houver apenas uma alternativa, o aplicativo pode exibir trajetos equivalentes.'],['Mudanças no caminho','Recálculos e ajustes em cruzamentos dependem da posição, da qualidade do GPS e do roteador disponível.']],faq:[["O VANO calcula rotas de carro e moto?","É possível selecionar carro ou moto. A disponibilidade de trajetos específicos para cada veículo depende do serviço de roteamento ativo."],["Por que a duração da rota mudou?","Mudanças no trânsito, na qualidade do GPS ou na disponibilidade do provedor podem alterar a estimativa."],["Qual é a diferença entre rota rápida e rota segura?","A opção rápida prioriza a duração estimada. A avaliação de segurança exige dados específicos; quando eles não existem, o aplicativo não deve apresentar uma rota como comprovadamente mais segura."]],cta:'Calcular rota',ctaHref:'/mapa'
  },
  {
    path:'/alternativa-ao-google-maps',category:'Alternativas',title:'Alternativa ao Google Maps para rotas',description:'VANO Maps como opção para comparar trajetos, visualizar mapas e buscar endereços.',lead:'Outro jeito de pesquisar, selecionar um destino e seguir seu caminho.',
    sections:[['Busca simplificada','Digite um local ou endereço, examine as sugestões e abra as alternativas de trajeto.'],['Mapas e camadas','Dependendo da configuração, o VANO exibe mapas de ruas e imagem de satélite de provedores externos.'],['Independência de produto','O VANO é independente do Google Maps. Disponibilidade de dados, detalhes da navegação e precisão podem ser diferentes.']],faq:[["O VANO usa dados do Google Maps?","O VANO é independente do Google Maps. Provedores de mapas e direções são definidos pelas integrações ativas do aplicativo."],["Consigo buscar endereços e comparar rotas?","Esses são recursos centrais do VANO. Os resultados variam conforme a disponibilidade dos provedores de busca e roteamento."]],cta:'Abrir VANO',ctaHref:'/mapa'
  },
  {
    path:'/gps-para-moto',category:'Mobilidade',title:'GPS para moto e planejamento de rotas',description:'Conheça a opção de navegação para motocicletas no VANO Maps e suas limitações.',lead:'Planeje o trajeto antes de ligar a moto.',
    sections:[['Perfil de motocicleta','Ao selecionar moto, o aplicativo envia essa preferência ao roteador conectado quando ele suporta esse perfil.'],['Priorize segurança física','Velocidade, condições de pista, clima, equipamentos e sinalização são fatores que o mapa não pode garantir.'],['Não manuseie durante a condução','Ajuste o destino com o veículo parado e utilize comandos apropriados somente quando for seguro e permitido.']],faq:[["O GPS funciona sem internet?","O dispositivo pode calcular a posição por satélite, mas o carregamento de mapas, a busca e o cálculo de rotas normalmente precisam de conexão."],["Rotas de moto consideram todas as restrições?","Nem sempre. Restrições legais e condições das vias podem não estar completas no provedor. Respeite sempre a sinalização e as regras locais."]],cta:'Planejar de moto',ctaHref:'/mapa'
  },
  {
    path:'/benchmark-de-rotas',category:'Transparência',title:'Benchmark de rotas VANO',description:'Teste rotas reais de carro ou moto, compare ETA, distância e latência e exporte resultados do VANO Maps.',lead:'Um laboratório público para pessoas e agentes de IA compararem trajetos com dados reais.',
    sections:[['Comece por origem e destino','Digite endereços, selecione sugestões ou informe coordenadas. Escolha carro ou moto e um modo disponível de rota.'],['Resultados verificados','Ao executar, o laboratório chama o motor de rotas VANO e informa latência, ETA, distância e indicadores disponíveis. Dados ausentes não são fabricados.'],['API pública para agentes','O contrato JSON está disponível em /api/benchmark/v1/capabilities, com cenários e testes via /api/benchmark/v1/route. Não é necessário login.']],cta:'Executar benchmark',ctaHref:'/benchmark-de-rotas'
  },
  {
    path:'/como-funciona',category:'Produto',title:'Como funciona o VANO Maps',description:'Passo a passo para pesquisar um lugar, escolher um caminho e acompanhar a navegação.',lead:'Buscar. Comparar. Seguir.',
    sections:[['1. Encontre o lugar','Busque o endereço ou escolha um destino salvo.'],['2. Confira as opções','Analise tempo, distância e fonte do roteiro. Nem todas as alternativas possuem avaliação de risco.'],['3. Inicie com segurança','O mapa acompanha o GPS autorizado. A prévia simulada é diferente de uma navegação real.']],cta:'Começar',ctaHref:'/inicio'
  },
  {
    path:'/seguranca-na-navegacao',aliases:['/termos-de-seguranca','/seguranca'],category:'Transparência',title:'Segurança na navegação: limites e boas práticas',description:'Cuidados, limites de dados e responsabilidades ao utilizar mapas e rotas.',lead:'A tecnologia auxilia a decisão, mas não substitui atenção e prudência.',
    sections:[['Risco não é certeza','Alertas e relatórios podem estar errados, incompletos ou desatualizados. Nenhum caminho é isento de riscos.'],['Localização e privacidade','Compartilhe acesso à localização apenas quando necessário. Evite publicar posições privadas ou trajetos de outras pessoas.'],['Em caso de emergência','Procure os serviços públicos apropriados. O VANO não é um sistema de resposta a emergências.']],cta:'Ver termos',ctaHref:'/termos-de-uso'
  }
];
export const CANONICAL_PATHS = PUBLIC_PAGES.map(p=>p.path);
export const PUBLIC_PATHS = PUBLIC_PAGES.flatMap(p=>[p.path,...(p.aliases||[])]);
export const pageForPath = path => PUBLIC_PAGES.find(p=>p.path===path || p.aliases?.includes(path)) || null;
