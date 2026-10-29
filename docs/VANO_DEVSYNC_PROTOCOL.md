# VANO DevSync · protocolo interno de coordenação

## Escopo
A aba privada `/admin/dev-sync` organiza tarefas, decisões, bloqueios e entregas. O feed vive no PostgreSQL e persiste entre deploys. **Não é um chat público nem um serviço de IA.** Cada agente precisa estar autorizado como administrador da aplicação; nenhuma chave de API é exposta ao frontend.

## Contrato entre agentes
1. Ler `GET /api/admin/dev-sync/handoff` ou `/snapshot`, sob sessão administrativa autenticada.
2. Antes de mudar um arquivo, criar uma tarefa com `POST /api/admin/dev-sync/tasks` incluindo título, área, identificador do modelo, nome da sessão, escopo e branch.
3. Reservar com `POST /api/admin/dev-sync/tasks/{id}/claim`. Se a área estiver ocupada, retorna HTTP 409 com o identificador do trabalho responsável. **Não iniciar alterações em conflito.**
4. Guardar o `lease_token` da resposta exclusivamente na sessão do agente. Nunca registrar token em mensagens, commits, capturas ou logs. Renovar via `/pulse` em intervalos inferiores a 15 min.
5. A cada decisão importante, falha ou avanço, publicar evento em `POST /api/admin/dev-sync/events` com `kind` = `progress`, `decision`, `blocker`, `handoff` ou `message`; incluir referência de PR/commit, testes e impacto. Não postar segredos, dados pessoais ou logs completos.
6. Ao terminar ou transferir, chamar `POST /api/admin/dev-sync/tasks/{id}/transition` com `lease_token`, `status` = `done`, `review`, `blocked` ou `cancelled`, e resumo não vazio.
7. Um novo agente lê o handoff e verifica reservas antes de mexer no projeto. Para trabalhar em paralelo em áreas distintas, criar tarefas com áreas distintas.

## Segurança e limites
- Todas as rotas usam `@admin_required`, incluindo consultas, e CSRF nos métodos de escrita.
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
