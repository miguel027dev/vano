# VANO DevSync · protocolo interno de coordenação

## Escopo
A aba privada `/admin/dev-sync` organiza tarefas, decisões, bloqueios e entregas. O feed vive no PostgreSQL e persiste entre deploys. **Não é um chat público nem um serviço de IA.** O administrador pode gerar credenciais específicas, revogáveis e válidas por 30 dias, sem conceder privilégios de administrador geral. O segredo é mostrado apenas uma vez; no banco fica exclusivamente seu hash.

## Contrato entre agentes
1. Ler `GET /api/admin/dev-sync/handoff` ou `/snapshot`, sob sessão administrativa autenticada.
2. Antes de mudar um arquivo, criar uma tarefa com `POST /api/admin/dev-sync/tasks` incluindo título, área, identificador do modelo, nome da sessão, escopo e branch.
3. Reservar com `POST /api/admin/dev-sync/tasks/{id}/claim`. Se a área estiver ocupada, retorna HTTP 409 com o identificador do trabalho responsável. **Não iniciar alterações em conflito.**
4. Guardar o `lease_token` da resposta exclusivamente na sessão do agente. Nunca registrar token em mensagens, commits, capturas ou logs. Renovar via `/pulse` em intervalos inferiores a 15 min.
5. A cada decisão importante, falha ou avanço, publicar evento em `POST /api/admin/dev-sync/events` com `kind` = `progress`, `decision`, `blocker`, `handoff` ou `message`; incluir referência de PR/commit, testes e impacto. Não postar segredos, dados pessoais ou logs completos.
6. Ao terminar ou transferir, chamar `POST /api/admin/dev-sync/tasks/{id}/transition` com `lease_token`, `status` = `done`, `review`, `blocked` ou `cancelled`, e resumo não vazio.
7. Um novo agente lê o handoff e verifica reservas antes de mexer no projeto. Para trabalhar em paralelo em áreas distintas, criar tarefas com áreas distintas.

## Segurança e limites
- As rotas `/admin/dev-sync` e `/api/admin/dev-sync/*` usam `@admin_required`, incluindo consultas, e CSRF nos métodos de escrita. As rotas `/api/agent/dev-sync/*` usam somente credencial de agente restrita a este módulo.
- Sem CORS público e sem acesso anônimo. O endpoint não serve como ponte de comunicação automática entre chats independentes; cada um precisa integrá-lo conscientemente.
- Reservas de 15 min são *advisory*: evitam conflito apenas entre agentes que seguem o protocolo. Commits externos ao sistema, alterações diretas no GitHub e deploys manuais **não são bloqueados**.
- Registrar escopos e branches auxilia a auditoria. Na primeira versão o lock é por área (por exemplo, duas tarefas de `gps` não podem executar juntas).
- Logs do sistema exibidos no painel mostram apenas ação, autor e horário — nunca metadados brutos que possam incluir dados sensíveis.
- O handoff não retorna tokens nem dados de auditoria. É um histórico estruturado, não a prova de que ferramentas externas realmente aplicaram mudanças.
- O sistema não coleta automaticamente mensagens de outros provedores de IA nem acessa histórico privado de chats; os agentes precisam publicar seus próprios eventos.

## Superfícies
- UI: `/admin/dev-sync`
- Snapshot autenticado: `GET /api/admin/dev-sync/snapshot`
- Handoff para próximo modelo: `GET /api/admin/dev-sync/handoff`
- Criar tarefa: `POST /api/admin/dev-sync/tasks`
- Assumir: `POST /api/admin/dev-sync/tasks/<id>/claim`
- Renovar: `POST /api/admin/dev-sync/tasks/<id>/pulse`
- Transição: `POST /api/admin/dev-sync/tasks/<id>/transition`
- Mensagem: `POST /api/admin/dev-sync/events`

Todas as escritas requerem header `X-CSRF-Token` de uma sessão administrativa válida.

## Conectar Argon, Claude Code ou outro agente por API

1. No painel `/admin/dev-sync`, abra **Conectar Argon ou outro agente**, digite a identificação do agente e pressione **Criar credencial**.
2. Copie o token exibido uma vez e coloque-o como **variável de ambiente protegida** `VANO_DEVSYNC_TOKEN` no ambiente de trabalho do agente. Nunca cole o token numa conversa, issue, commit, screenshot ou documento.
3. Informe ao agente a URL do painel e este protocolo. **O agente precisa conseguir realizar requisições HTTP autenticadas**; apenas conversar sobre o protocolo não envia dados automaticamente.
4. O agente lê `GET https://vanomaps.online/api/agent/dev-sync/handoff` com o header `Authorization: Bearer <token>`.
5. Para registrar o trabalho, o agente usa `POST https://vanomaps.online/api/agent/dev-sync/tasks`, conteúdo JSON como `{"title":"Corrigir GPS","area":"gps","scope":"static/vano-map.js","branch":"fix/gps","model":"Argon"}`.
6. Antes de editar, reivindique `POST /api/agent/dev-sync/tasks/{id}/claim` enviando `{"model":"Argon"}`. O retorno fornece `lease_token` exclusivo desta tarefa (não é o mesmo token de acesso principal). Trate-o como segredo e armazene-o apenas na sessão do agente.
7. Durante o desenvolvimento, use `POST /api/agent/dev-sync/events` com `{"task_id":123,"kind":"progress","body":"O que modifiquei e qual é o resultado dos testes"}`. Renove `/tasks/{id}/pulse` antes de 15 minutos com `{"lease_token":"..."}`.
8. Depois do teste/commit, faça `POST /api/agent/dev-sync/tasks/{id}/transition` com `{"status":"review","summary":"PR, commits, testes, riscos e pendências","lease_token":"..." }` ou `status="done"`.

Todas as operações de agente exigem o header Bearer, mas não exigem cookie de administrador nem CSRF, porque são protegidas por autenticação própria. As credenciais podem ser revogadas na mesma aba. O agente autenticado publica os eventos sob sua identificação cadastrada, não sob nomes fornecidos arbitrariamente no JSON.

### Exemplo de leitura com token guardado no ambiente

```bash
curl --fail-with-body -sS \
  -H "Authorization: Bearer ${VANO_DEVSYNC_TOKEN}" \
  https://vanomaps.online/api/agent/dev-sync/handoff
```

**Limitações:** modelo externo sem acesso à rede/ferramentas não consegue registrar nada sozinho. Não existe leitura automática de mensagens privadas entre chats diferentes. O agente precisa registrar o que estiver fazendo, e o controle de conflitos continua cooperativo.
