# VANO Control Center — VANO Intelligence integrado

## Objetivo

Transformar a aba **VANO Intelligence** do painel `/admin` em um copiloto operacional do VANO Maps — um chatbot para consultas sobre rotas, falhas, métricas, qualidade de ETA e incidentes, **sem saída para outra página**. Deve conservar a linguagem visual VANO (grafite profundo, vidro translúcido, laranja/âmbar, bordas delicadas, tipografia legível e animações discretas).

## Interação

1. A sidebar, a marca original e o cabeçalho do Control Center continuam visíveis em todas as abas. A URL da aba é `/admin#intelligence`; voltar/avançar do navegador mantém o módulo.
2. A área principal exibe título **VANO Intelligence**, sugestões contextuais, seletor de análise rápida/profunda, conversa scrollável e um campo grande de entrada. Enter com Ctrl/Cmd envia. O botão de envio mostra andamento e bloqueia duplicação.
3. O histórico da sessão é limitado a 24 mensagens, com conteúdo que pode ser copiado ou limpo. Erros de conexão são mostrados; não podem ser apresentados como respostas válidas.
4. O visual deve usar bordas glass, blur moderado, gradientes grafite-âmbar e feedbacks hover/focus/teclado. Em mobile, o menu passa a ser horizontal rolável, sem recobrir o mapa ou a conversa.
5. `prefers-reduced-motion` desabilita animações. Contraste e foco visíveis são requisitos.

## Fonte dos dados e segurança

- **Backend autorizado existente:** `POST /api/admin/intelligence/ask` (`post('/admin/intelligence/ask',...)`), com autenticação administrativa e CSRF. **Não** criar um endpoint paralelo com credenciais no navegador.
- **Contexto:** `GET /api/admin/intelligence/overview?days=` traz contagens reais, decisões de rota, diagnósticos de infraestrutura e histórico agregado; o servidor decide quais dados entram na análise.
- Modos existentes `fast` e `deep`. Se o conector NVIDIA estiver indisponível, a interface informa a limitação e respeita o fallback real do backend.
- Nenhuma saída do chatbot executa ações administrativas, alteração de rotas, mudança de dados ou deploy.
- Não expor nome, e-mail, coordenadas precisas, tokens, localização dos usuários ou conteúdo bruto de sessões em chamadas de modelo.
- Nunca inventar resultados de benchmark, performance ou rotas. Diferenciar amostras, inferências e contagens observadas.

## Integração ao produto

- `Dashboard`, `Acompanhar Rotas`, `Treinamento`, `VANO Intelligence`, `Ocorrências`, `DevSync`, `Indicadores`, `Atendimento`, `Configurações` e `Mapa Principal` são **seções do mesmo painel**; apenas o conteúdo da direita muda.
- `Benchmark` permanece uma **rota externa intencional**, conforme pedido.
- `Acompanhar Rotas` reaproveita `AdminLiveTrips` com o atlas VANO Black e dados reais de viagens autorizadas.
- `Mapa Principal` exibe `/mapa` em viewport interna e oferece opcionalmente a abertura em tela inteira.
- `DevSync` mantém tarefas, agentes, credenciais e mensagens na implementação existente, sem duplicar backend.
- `Atendimento` mantém respostas a protocolos reais. `Ocorrências` expõe lista paginada **somente leitura**, sem autor ou GPS; não há moderação artificial nem verificação sem auditoria.

## Aceitação antes de produção

- Sidebar permanece ao trocar de aba; browser Back/Forward e links diretos `/admin#...` funcionam.
- Não há componentes de mapa substituídos por mockups.
- Autorização no servidor se aplica a todas as rotas e ações; a UI não autoriza por conta própria.
- Build Vite, testes Node e healthcheck do servidor passam; navegação e funções principais devem ser inspecionadas em sessão administrativa.
