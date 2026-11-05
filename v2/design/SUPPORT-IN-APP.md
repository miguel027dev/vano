# Suporte por protocolo no VANO

Canal funcional em `/contato`, separado do assistente automático. Visitantes e usuários podem enviar assunto e mensagem; o e-mail é opcional e serve somente de referência interna. Não há envio por e-mail nem integração externa.

Após envio, o usuário recebe um código secreto aleatório de 32 bytes (64 caracteres hexadecimais). O código completo aparece uma vez e deve ser guardado pelo usuário. O servidor conserva somente seu SHA-256. O código nunca vai em URL, logs ou armazenamento persistente do navegador. Consulta por `POST /api/support/status`, sem login, permite acompanhar problemas de acesso.

Solicitações são independentes da conta: não há associação por proprietário e o código é a única prova de acesso à resposta. Por isso, exportar ou excluir uma conta não localiza nem remove automaticamente solicitações de suporte. Não há recuperação do código por e-mail. O acompanhamento retorna apenas assunto, estado, resposta e datas; não retorna e-mail ou mensagem original.

A equipe responde em `/admin/suporte`, restrito ao administrador verificado pelos controles existentes. A caixa é paginada em até 50 itens; o hash do protocolo não é enviado ao painel. Administradores devem evitar dados pessoais na resposta, porque qualquer pessoa com o código pode lê-la. O suporte não executa alteração de conta, recuperação de acesso ou exclusão: esses casos continuam exigindo seus fluxos próprios de verificação.

Limites: mensagem de 10 a 2000 caracteres, resposta de 3 a 2000, assunto em lista fechada, e-mail opcional validado; 3 envios por IP/hora, 20 consultas por minuto e 30 operações administrativas por minuto. Fila máxima de 1000 solicitações. Escritas usam a proteção CSRF existente.

Solicitações e respostas expiram 90 dias após a **criação**, sem extensão pela resposta. A consulta não serve registros expirados; a coleção é limpa e persistida ao acessar os handlers de suporte, nas escritas gerais, ao iniciar o servidor e em manutenção a cada hora enquanto ele estiver em execução. A limpeza periódica não constitui exclusão instantânea de backups. Retenção de cópias de infraestrutura e backups deve ser considerada separadamente na política operacional. Não há promessa de prazo de atendimento nem identidade jurídica inventada.

Testes: `node server/support.test.mjs` e teste `support requires CSRF` em `server/api.test.mjs`, com banco temporário. Cobrem hash e aleatoriedade, dados mínimos, expiração, limites, paginação, visitante, não administrador e resposta administrativa persistida. Nenhum ticket real ou e-mail externo é criado pelos testes.
