# VANO V2 — plano, integração, testes e recuperação (16/10/2026)

## Objetivo e fronteira
Corrigir falhas identificadas na auditoria de navegação antes de publicar uma nova versão do serviço Render `vanu`, mantendo o banco de usuários e o comportamento do site estável. A Web Geolocation API **não garante GPS contínuo** em segundo plano, após o usuário negar acesso, em túneis ou se o sistema operacional suspender a página. Não gerar posições sintéticas nem apresentar posição antiga como atual.

## Backup e rollback
- Branch em produção antes da alteração: `preview/vano-react-v2-7`.
- Commit anterior: `f213b85b8322ed7013bef13cf5460e7b0ff9828a`.
- Backup imutável: `backup/vanu-20261016-before-gps-reliability-hotfix`.
- Branch isolada de trabalho: `fix/vanu-gps-voice-reroute-reliability-20261016`.
- Não executar migrações destrutivas em PostgreSQL. Se o deploy falhar ou causar regressões, restabelecer a branch de produção no commit anterior e executar um novo deploy manual no serviço `vanu`. Confirmar build, tela `/mapa`, endpoint `/api/bootstrap`, busca de endereço, cálculo de rota e status de autenticação.

## Plano de integração e falhas potenciais
### 1. GPS e continuidade
- `gpsSession.js`: manter apenas um `watchPosition`; monitorar ausência de fix válido, reiniciar silenciosamente quando ativo/visível, aplicar backoff e liberar listeners ao interromper navegação.
- Permissão negada bloqueia novas tentativas automáticas. Ao retornar à aba, somente reiniciar se GPS realmente ficar obsoleto.
- Uma leitura antiga pode continuar desenhada *apenas* como última posição conhecida; nenhum recálculo, velocidade, limite de via ou orientação pode tomá-la como GPS atual.
- Riscos testados: primeiro login, retorno do app, denied/timeout, falso salto, callbacks antigos, navegação longa, cancelamento.

### 2. Recálculo urgente
- O frontend precisa enviar `routeOptions.reroute:true` (o backend ignora opções no nível raiz); o backend aplica caminho enxuto `adaptive:false`, `skipCandidateProbes:true`, `variantBudget:2` e timeout reduzido.
- A rota antiga permanece desenhada enquanto a nova é consultada. Em falha externa, avisar o usuário e permitir nova tentativa; nunca apresentar rota inventada.

### 3. Voz MAVI
- Autorizações temporárias de histórico continuam curtas; a validação de manobras admite uma autorização assinada já expirada somente dentro de uma janela controlada de 24h e renova o token para o percurso em andamento.
- Associar a renovação ao mesmo usuário/guest, rota e destino. Não expor credenciais TTS ou aceitar texto arbitrário.
- Áudio de manobra tem prioridade sobre conversa MAVI. A falha de um ticket não deve bloquear todas as instruções seguintes.
- Riscos testados: manobras sequenciais, ticket expirado, prova forjada, áudio abortado, login e mute, recomeço de rota.

### 4. Banco e falhas temporárias
- Em perda de conexão PostgreSQL, tentar reconectar com o mesmo modelo de dados e serializar gravações; um erro transitório de gravação não pode envenenar todas as chamadas seguintes.
- Preservar esquema `vano_v2`, sem alteração de dados ou contas. Migrar o documento JSONB único para tabelas por domínio será trabalho posterior e exigirá migração separada com backup real do banco.

### 5. Publicação
1. Executar simulações unitárias e toda a suíte V2, incluindo voz, GPS e persistência.
2. Rodar `npm test`, `npm run build` e CI do pull request. Corrigir falhas introduzidas; distinguir falhas antigas do CI Python V1.
3. Integrar somente se as validações V2 estiverem verdes; iniciar deploy manual Render (auto-deploy desativado).
4. Verificar status `live`, eventos do deploy e logs de erros. Validar em aparelho real a taxa de recuperação GPS, recálculo e a prioridade da voz. Não prometer 60 FPS ou GPS infalível sem medir.

## Critérios de aceitação
- GPS não perde o último fix na UI após erro breve, reconecta sem múltiplos watches ativos e nunca solicita permissão repetidamente após negativa.
- Desvio confirmado envia `routeOptions.reroute` e não dispara consultas exploratórias por padrão.
- Orientação de voz continua em viagens superiores a 10 minutos enquanto a sessão permanece válida e o backend atende; uma instrução falha pode ser retentada com cooldown.
- Manobra falada interrompe resposta não prioritária da MAVI, sem desligar o modo mãos livres.
- Falha transitória de conexão ou gravação PostgreSQL é recuperável e não apaga dados persistidos.
