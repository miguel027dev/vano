# VANO — plano de correções e critérios de fechamento

Data: 8 de outubro de 2026. Base auditada: 9e604f0b11eb4a43198013be574d873815abf772.

Este registro distingue implementação de validação em produção. Não certifica ausência de vulnerabilidades nem substitui revisão do AAB final.

## Prioridade técnica

P0: corrigir antes do lançamento; P1: validar antes da liberação; P2: concluir antes da escala; P3: melhoria de manutenção. A severidade de segurança é independente da prioridade. "Implementado" exige ainda os critérios de fechamento indicados.

| ID | Prioridade / severidade | Correção implementada ou ação pendente | Critério de fechamento |
|---|---|---|---|
| V01 | P0 / alta | 12 bundles JS decodificados; removida execução por eval, preservando CSP | Carregar mapa, login e painéis sem violações CSP |
| V02 | P0 / alta | Cookie assinado vinculado a sessão revogável no banco; logout revoga o hash vinculado | Replay do cookie antigo retorna 401; teste comportamental |
| V03 | P0 / alta | Removido vínculo automático Google com senha local não verificada; vínculo explícito exige autenticação recente | Testes de recusa do vínculo automático e vínculo autorizado; OAuth real pendente |
| V04 | P0 / alta | Saudação segura para nome vazio | Login de conta sintética sem nome não retorna 500 |
| V05 | P1 / alta | Interrupção local imediata de envio; token mantido até confirmação; retentativa online e persistência da revogação pendente na sessão do navegador; posição pública oculta após 120 s sem atualização | Teste servidor stop/stale; testar modo offline e recarga em dispositivo |
| V06 | P1 / alta | Assinatura HMAC do conteúdo da rota emitida pelo servidor; validação de geometria, métricas, pontos, perfil e modo | Alteração de distância, geometria ou segurança recusada; link válido revogável |
| V07 | P1 / média | Exclusão Google exige autenticação recente | Sessão antiga não pode excluir; testar OAuth real |
| V08 | P1 / média | Tokens claros/escuros e estilos legais com texto legível | Inspeção visual e contraste calculado nos dois temas |
| V09 | P1 / média | Banner de recuperação limitado a 154 × 48 px | Conferir recuperação no celular e desktop |
| V10 | P1 / média | Canal público de solicitação de privacidade, sem exposição de existência da conta ou exclusão automática | Solicitação anônima entra como pendente; confirmar responsável operacional |
| V11 | P1 / média | no-store em respostas pessoais e variação por Cookie | Headers de APIs pessoais e páginas autenticadas |
| V12 | P1 / média | Termos, políticas, ajuda e direitos acessíveis durante onboarding | Conta incompleta acessa políticas com 200 |
| V13 | P2 / média | Identificador de presença pseudônimo HMAC, rotacionado a cada 5 min | Nenhum user_id estável na API pública de presença |
| V14 | P2 / média | Filtro geográfico SQL antes de LIMIT, índice espacial por latitude/longitude e limite por usuário | Teste com distribuição geográfica representativa e latência de produção |
| V15 | P2 / média | Validade padrão 24 h, máximo 7 dias; revogação no Perfil; no-store e no-referrer; mascaramento de URLs nos logs da aplicação/Gunicorn | Link revogado inacessível; revisar política de logs do proxy Render |
| V16 | P2 / média | Payload compartilhado validado antes de conversão/persistência | Geometrias, métricas e validades malformadas retornam 400 |
| V17 | P1 / média | CSRF no trânsito do fallback; falha de atualização comunicada corretamente | Verificar request e mensagem em falha de rede |
| V18 | P2 / média | Marca visível e dimensões consistentes no cabeçalho das páginas de apoio | Conferir claro/escuro e navegação mobile |
| V19 | P2 / baixa | Link Recursos aponta para Ajuda existente | Navegação sem âncora inexistente |
| V20 | P2 / média | Tipografia mínima 12 px em compartilhamento e ao vivo; estilos compartilhados | Conferir zoom, leitura e telas estreitas |
| V21 | P2 / média | 306 blocos CSS idênticos removidos; legado isolado em layer; novo arquivo de tokens/componentes | PARCIAL: CSS legado ainda ~2,34 MB; continuar migração página a página com regressão visual antes de remoções amplas |
| V22 | P3 / baixa | Lucide fixado com SRI SHA-384 e crossorigin | Ícones carregam e integridade confere; revisar demais fornecedores por release |
| V23 | P1 / média | /healthz previsto no Blueprint | PENDENTE: configurar healthCheckPath=/healthz no serviço EXISTENTE; ferramenta atual não expõe essa alteração e Dashboard exige login |
| V24 | P2 / média | Limitador compartilhado atômico PostgreSQL com advisory lock e falha fechada; limpeza limitada | Teste real concorrente PostgreSQL em CI; observar 429/erros em produção |
| V25 | P2 / média | Dependências de produção fixadas com hashes; requirements.in separado; CI instala produção e desenvolvimento separadamente | pip-audit sem vulnerabilidades conhecidas e build com hashes |
| V26 | P1 / média | Testes comportamentais de sessão, OAuth, privacidade, compartilhamento e posição; integração PostgreSQL em CI | Suíte completa e CI aprovados; não confundir inspeção de texto com comportamento |
| V27 | P2 / média | APIs protegidas retornam JSON 401 | Teste API sem sessão e sessão revogada |
| V28 | P1 / média | Benchmark continua sem WebGL e informa ausência do mapa | Executar benchmark no navegador sem GPU |
| N01 | P1 / alta condicional | Patch nativo invalida rota quando destino/modo/veículo muda e descarta resposta assíncrona obsoleta | Compilar e testar AAB que efetivamente será publicado |
| N02 | P1 / média condicional | Patch nativo comunica GPS ausente e recusa silenciosa eliminada | Testar sem permissão, GPS frio e localização aproximada |
| N03 | P2 / média condicional | Patch nativo remove listeners ao pausar/desmontar; callback usa estado atual | Testar lifecycle e confirmar sem listeners duplicados |

## Execução e lançamento

1. Publicar correções web somente após pytest, compilação Python, sintaxe JS e auditoria das dependências.
2. Acompanhar CI com PostgreSQL real, depois deploy do serviço existente. Não criar uma infraestrutura paralela nem modificar segredos.
3. Confirmar healthz, páginas públicas, sessão de QA, roteamento real, link compartilhado/revogado e ausência de erros novos nos logs.
4. Repetir inventário das 39 páginas em claro/escuro, mobile/desktop, incluindo admin com acesso legítimo; salvar evidências e priorizar novas regressões.
5. Antes da Play Store: associar repository/commit ao AAB final, compilar, testar GPS/lifecycle em Android e revisar declaração de dados e regras atuais da loja.

## Limites atuais

A cobertura automatizada usa contas sintéticas isoladas. Integração PostgreSQL executa em CI; localmente é marcada como ignorada quando TEST_DATABASE_URL não existe. Os patches Android não equivalem a validação do binário final. Padronização por tokens melhora a consistência, mas não justifica afirmar que todas as 39 telas foram visualmente aprovadas em todos os dispositivos. Retenção dos logs do proxy é uma configuração operacional independente do mascaramento da aplicação.

## Dependências

Atualizar com `python -m piptools compile --generate-hashes --output-file requirements.lock requirements.in`; auditar o lock antes de publicar. Instalar produção com `pip install -r requirements.txt`. Instalar ferramentas de desenvolvimento em uma chamada separada.

## Compatibilidade e rollback

Cookies autenticados legados sem vínculo revogável poderão exigir novo login. Links antigos criados com payload não autenticado retornam 410 e precisam ser recriados. Novo compartilhamento de rota exige login; não depende de acesso administrativo. Migração acrescenta tabela/índices, sem apagar dados de usuários. Um rollback deve preservar estes objetos e considerar que reintroduzir código antigo reabre os riscos de sessão e compartilhamento.


## Ajuste encontrado durante o deploy

O serviço existente selecionava Python 3.14.3 por padrão; o primeiro build com lock recusou backports-zstd, cuja versão fixada exige Python < 3.14. Adicionado `.python-version` com 3.13, alinhado ao CI aprovado e usando o patch suportado mais recente. O build com falha não substituiu a versão previamente live. Referência operacional: https://render.com/docs/python-version.
