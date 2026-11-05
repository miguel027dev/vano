# Ajuda local e protótipo NVIDIA

A página `/ajuda` funciona sem chave. Perguntas são respondidas com uma base curada de recursos existentes e links internos. Não há leitura de conta, GPS, histórico, favoritos ou credenciais pelo assistente. Não há execução de ações nem gravação de conversas.

A IA é opcional por consulta: a caixa só aparece quando `/api/help/status` informa `aiAvailable: true`, começa desmarcada, o aviso identifica a NVIDIA e somente o envio do formulário inicia uma chamada. O botão Cancelar interrompe a espera no navegador; uma chamada já recebida pelo servidor/provedor pode terminar e consumir a cota de teste.

## Configuração para teste privado

Defina no ambiente do servidor, sem colocar valores no frontend ou no repositório:

- `NVIDIA_API_KEY`: chave obtida diretamente no serviço NVIDIA.
- `VANO_HELP_NVIDIA_ENABLED=1`: habilita a integração de teste.
- `NVIDIA_HELP_MODEL`: opcional; padrão `openai/gpt-oss-20b`.

Em `NODE_ENV=production` ou serviço web Render (`RENDER=true` e `RENDER_SERVICE_TYPE=web`), a integração permanece desligada sem **também** definir `VANO_HELP_PRODUCTION_APPROVED=1`. Essa aprovação é separada da ativação de teste; não é configurada por este protótipo. Nenhuma chave, cobrança ou cadastro externo foi criado. Créditos gratuitos/de teste não devem ser tratados como disponibilidade gratuita permanente para produção.

Endpoint fixo: `https://integrate.api.nvidia.com/v1/chat/completions`. A configuração do modelo não muda o destino. A NVIDIA recebe apenas a pergunta enviada e instruções da base pública; não recebe contexto pessoal da aplicação. A pergunta pode conter dados digitados pelo próprio usuário: a interface orienta a não incluí-los e bloqueios básicos impedem e-mails, coordenadas precisas e padrões de chaves. Esses bloqueios não substituem o cuidado de não digitar dados pessoais.

O modelo apenas classifica o assunto em uma lista de IDs. Texto e links da resposta são selecionados exclusivamente da base local. Isso mantém o escopo de suporte e evita instruções ou links inventados. Não é um chat de propósito geral.

## Limites e falhas

- Entrada entre 3 e 600 caracteres; sem histórico de mensagens.
- 12 consultas por IP por minuto; proteção CSRF já existente.
- IA: até 30 chamadas por hora e 2 simultâneas por processo, prazo de 6 segundos.
- Sem chave, sem aprovação, cota esgotada, resposta inválida ou falha: ajuda local identificada, sem simular resposta de IA.
- Não há persistência de chats ou registro do texto no módulo. Para uso em múltiplas instâncias, a cota global precisará de armazenamento compartilhado antes de ampliar o protótipo.

Validação: `node server/help-assistant.test.mjs` cobre consentimento explícito, grounding, contexto pessoal ausente, falhas, timeout, produção bloqueada, entrada e cota. Os testes usam provedor simulado, sem chamadas reais à NVIDIA.

## Referências do provedor

- [NVIDIA — acesso para desenvolvimento e implantação](https://docs.api.nvidia.com/nim/docs/run-anywhere)
- [NVIDIA — quickstart da API](https://docs.api.nvidia.com/nim/docs/api-quickstart)
- [NVIDIA — FAQ do produto](https://docs.api.nvidia.com/nim/docs/product)

As condições e os limites da conta devem ser verificados antes de ativar chamadas reais. A entrega não fez chamadas reais à NVIDIA.
