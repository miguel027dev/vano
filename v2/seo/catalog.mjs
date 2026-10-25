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
    "path": "/termos-de-uso",
    "aliases": [
      "/termos",
      "/terms"
    ],
    "category": "Legal",
    "title": "Termos de uso do VANO Maps",
    "description": "Conheça as regras de uso do VANO Maps, os limites das informações de navegação e suas responsabilidades ao utilizar o aplicativo.",
    "lead": "As regras mais importantes para usar o VANO com consciência.",
    "sections": [
      [
        "1. Sobre o serviço",
        "O VANO oferece mapas, pesquisa por lugares e planejamento de trajetos. Alguns recursos podem estar em teste ou depender de serviços externos."
      ],
      [
        "2. Informações de navegação",
        "Rotas, previsões de chegada, trânsito e alertas podem mudar ou estar incompletos. Nenhuma orientação substitui a sinalização, as leis de trânsito ou as condições reais da via."
      ],
      [
        "3. Uso responsável",
        "Planeje seu percurso antes de dirigir. Não manuseie o aplicativo enquanto conduz. Não utilize os recursos para divulgar ameaças, relatos falsos ou dados pessoais de outras pessoas sem autorização."
      ],
      [
        "4. Conta e acesso",
        "Quem utiliza uma conta deve proteger suas credenciais e fornecer informações corretas. Alguns recursos exigem login e podem ficar indisponíveis durante manutenção."
      ],
      [
        "5. Serviços de outras empresas",
        "Mapas, busca de lugares, informações de trânsito e autenticação podem usar serviços de terceiros. A cobertura e a disponibilidade variam."
      ],
      [
        "6. Atualizações",
        "O VANO pode corrigir falhas, atualizar recursos e suspender funções por motivos técnicos ou de segurança."
      ],
      [
        "7. Privacidade e exclusão",
        "O tratamento de informações pessoais e as orientações de remoção de conta estão na Política de privacidade e na página Excluir conta."
      ],
      [
        "8. Limites e revisão",
        "As informações ajudam no planejamento, mas não garantem o resultado de uma viagem. Este documento ainda precisa de revisão jurídica e identificação completa do responsável antes da operação comercial definitiva."
      ]
    ],
    "cta": "Ler a política de privacidade",
    "ctaHref": "/politica-de-privacidade"
  },
  {
    "path": "/politica-de-privacidade",
    "aliases": [
      "/privacidade",
      "/privacy"
    ],
    "category": "Legal",
    "title": "Política de privacidade do VANO",
    "description": "Saiba quais informações o VANO Maps pode utilizar, como a localização ajuda a calcular rotas e quais direitos você tem sobre seus dados.",
    "lead": "Seus dados merecem explicações simples e controles claros.",
    "sections": [
      [
        "1. Quais dados podem ser utilizados",
        "De acordo com a função utilizada, o VANO pode tratar dados de cadastro, preferências, informações do aparelho, registros de acesso e localização. Uma busca de rota pode envolver origem e destino."
      ],
      [
        "2. Por que esses dados são necessários",
        "Essas informações podem ser utilizadas para permitir o acesso à conta, pesquisar lugares, calcular rotas, exibir localização, proteger o serviço e identificar falhas."
      ],
      [
        "3. Localização e trajetos",
        "A localização é solicitada para funções que precisam dela. Você pode ajustar a permissão no aparelho. Para buscar um caminho, endereços e coordenadas podem ser enviados ao serviço responsável pelo mapa ou cálculo de rotas."
      ],
      [
        "4. Serviços externos",
        "Empresas de mapas, busca de lugares, autenticação e infraestrutura podem receber informações necessárias para oferecer seus serviços. Cada fornecedor também possui suas próprias práticas de privacidade."
      ],
      [
        "5. Motivos previstos em lei",
        "Conforme a finalidade, o tratamento de dados pode ocorrer para oferecer serviços solicitados, cumprir obrigações legais, proteger o sistema ou com consentimento quando a legislação exigir."
      ],
      [
        "6. Tempo de conservação",
        "As informações podem ser mantidas enquanto forem necessárias para oferecer o serviço ou cumprir obrigações aplicáveis. Os prazos específicos por tipo de registro ainda precisam de validação e divulgação. Nem todo dado é apagado imediatamente após a exclusão da conta."
      ],
      [
        "7. Segurança e cuidados",
        "O VANO precisa adotar medidas para reduzir falhas e acessos não autorizados. Nenhum sistema é totalmente livre de riscos. Não envie senhas ou documentos em mensagens de feedback."
      ],
      [
        "8. Seus direitos",
        "Pela Lei Geral de Proteção de Dados (LGPD), você pode solicitar informações sobre o tratamento, acesso, correção ou eliminação de dados quando aplicável, além de exercer outros direitos previstos em lei. Algumas solicitações exigem confirmação de identidade."
      ],
      [
        "9. Solicitações e exclusão de conta",
        "A página Excluir conta reúne as orientações disponíveis. O canal verificado para solicitações de privacidade e a identificação completa do responsável pelo tratamento precisam ser publicados antes da operação comercial definitiva."
      ],
      [
        "10. Revisão e atualizações",
        "Este documento deve acompanhar as funcionalidades e práticas reais do aplicativo. A versão jurídica, as informações do responsável e os prazos de conservação ainda precisam ser validados."
      ]
    ],
    "cta": "Ver exclusão de conta",
    "ctaHref": "/excluir-conta"
  },
  {
    path:'/excluir-conta',category:'Legal',title:'Como excluir sua conta VANO',description:'Entenda como solicitar a exclusão da conta e dos dados associados no VANO Maps.',lead:'Você mantém o controle sobre a sua conta.',
    sections:[['Dentro do aplicativo','Entre em Minha conta e procure a opção de excluir conta. Dependendo do método de login, uma confirmação de identidade poderá ser necessária.'],['Se não conseguir entrar','Consulte o suporte pelo canal oficial para verificar as alternativas disponíveis. Não compartilhe sua senha.'],['Dados e retenção','Alguns registros podem exigir conservação legal, antifraude ou de segurança. O tratamento deve seguir a Política de privacidade e a legislação aplicável.']],cta:'Abrir Minha conta',ctaHref:'/conta'
  },
  {
    "path": "/rotas-para-evitar-transito",
    "category": "Rotas e tecnologia",
    "title": "Como escolher um caminho com menos trânsito",
    "description": "Entenda como o trânsito afeta as rotas disponíveis e como comparar tempo previsto e distância antes de cada viagem.",
    "lead": "O caminho mais curto nem sempre é o que leva menos tempo.",
    "sections": [
      [
        "Confira o tempo, não só a distância",
        "Um caminho menor pode ter mais semáforos, obras ou congestionamentos. Quando o mapa mostrar alternativas, compare distância e tempo previsto."
      ],
      [
        "As condições mudam",
        "As informações sobre o trânsito dependem da região, da conexão e do fornecedor de mapas. Elas podem demorar para atualizar ou não estar disponíveis."
      ],
      [
        "Escolha com atenção",
        "Uma alternativa pode economizar tempo, mas isso não é garantido. Confira a situação da via e respeite as restrições de circulação."
      ]
    ],
    "faq": [
      [
        "O VANO sempre encontra um caminho sem trânsito?",
        "Não. Em alguns trajetos não há alternativas viáveis ou faltam dados atualizados."
      ],
      [
        "A rota mais curta é a mais rápida?",
        "Não necessariamente. Obras, cruzamentos e fluxo de veículos também influenciam a viagem."
      ],
      [
        "O tempo previsto pode mudar durante a viagem?",
        "Sim. É uma estimativa, não uma garantia de chegada."
      ]
    ],
    "cta": "Comparar caminhos",
    "ctaHref": "/mapa"
  },
  {
    path:'/alternativa-ao-waze',category:'Alternativas',title:'VANO Maps: alternativa ao Waze',description:'Conheça o VANO Maps como alternativa de navegação ao Waze e entenda diferenças de proposta e disponibilidade.',lead:'Uma alternativa para planejar rotas e comparar caminhos com uma interface enxuta.',
    sections:[['Outra forma de navegar','O VANO aposta em uma experiência de mapa simples, busca rápida e comparação entre trajetos disponíveis.'],['Rotas e inteligência','O projeto trabalha na integração de rotas mais rápidas e análise contextual. A disponibilidade de micro-rotas depende de um serviço de roteamento conectado.'],['Escolha com informação','Compare os recursos, cobertura e limites de cada aplicativo. O VANO não é afiliado, patrocinado nem endossado pelo Waze ou pelo Google.']],faq:[['VANO é o mesmo que Waze?','Não. São produtos distintos, com tecnologias, cobertura e políticas próprias.'],['Posso usar durante a direção?','Configure o destino antes de sair e evite manusear o telefone enquanto dirige.']],cta:'Conhecer o mapa',ctaHref:'/mapa'
  },
  {
    "path": "/rota-mais-rapida",
    "category": "Rotas e tecnologia",
    "title": "Como escolher a rota mais rápida",
    "description": "Aprenda a comparar caminhos pelo tempo previsto e pela distância sem confundir uma estimativa com uma garantia.",
    "lead": "O tempo previsto ajuda a escolher. Ele não é uma promessa de chegada.",
    "sections": [
      [
        "Veja o tempo previsto",
        "Confira quanto tempo o mapa estima para o trajeto. Esse cálculo depende das informações disponíveis no momento."
      ],
      [
        "Compare os caminhos",
        "Quando houver alternativas, observe tempo e distância de cada uma. Um trajeto mais curto nem sempre é mais rápido."
      ],
      [
        "Conte com mudanças",
        "Trânsito, obras, condições da rua e imprecisão do GPS podem alterar a viagem. Planeje com uma margem de tempo."
      ]
    ],
    "faq": [
      [
        "Por que o tempo mudou?",
        "Novos dados de trânsito e alterações de percurso podem mudar a previsão."
      ],
      [
        "O VANO sempre mostra o melhor caminho?",
        "Não. Os resultados dependem da cobertura e da qualidade dos serviços de mapas disponíveis."
      ]
    ],
    "cta": "Abrir o mapa",
    "ctaHref": "/mapa"
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
    "path": "/como-funciona",
    "category": "Produto",
    "title": "Como usar o VANO Maps",
    "description": "Aprenda em passos simples a pesquisar um destino, comparar opções de trajeto e acompanhar sua posição no VANO Maps.",
    "lead": "Pesquise um lugar, confira o caminho e comece com segurança.",
    "sections": [
      [
        "1. Encontre o destino",
        "Abra o mapa e digite um endereço ou nome de lugar. Confira se o resultado corresponde ao destino desejado."
      ],
      [
        "2. Compare as opções",
        "Veja a distância e o tempo previsto. Quando mais de um caminho estiver disponível, compare antes de escolher."
      ],
      [
        "3. Acompanhe sua posição",
        "Com permissão de localização ativa e sinal de GPS disponível, você pode acompanhar seu deslocamento no mapa."
      ],
      [
        "4. Viaje com atenção",
        "Planeje com o veículo parado. As leis de trânsito, a sinalização e as condições reais da rua têm prioridade."
      ]
    ],
    "cta": "Começar no mapa",
    "ctaHref": "/mapa"
  },
  {
    path:'/seguranca-na-navegacao',aliases:['/termos-de-seguranca','/seguranca'],category:'Transparência',title:'Segurança na navegação: limites e boas práticas',description:'Cuidados, limites de dados e responsabilidades ao utilizar mapas e rotas.',lead:'A tecnologia auxilia a decisão, mas não substitui atenção e prudência.',
    sections:[['Risco não é certeza','Alertas e relatórios podem estar errados, incompletos ou desatualizados. Nenhum caminho é isento de riscos.'],['Localização e privacidade','Compartilhe acesso à localização apenas quando necessário. Evite publicar posições privadas ou trajetos de outras pessoas.'],['Em caso de emergência','Procure os serviços públicos apropriados. O VANO não é um sistema de resposta a emergências.']],cta:'Ver termos',ctaHref:'/termos-de-uso'
  }
];
export const CANONICAL_PATHS = PUBLIC_PAGES.map(p=>p.path);
export const PUBLIC_PATHS = PUBLIC_PAGES.flatMap(p=>[p.path,...(p.aliases||[])]);
export const pageForPath = path => PUBLIC_PAGES.find(p=>p.path===path || p.aliases?.includes(path)) || null;
