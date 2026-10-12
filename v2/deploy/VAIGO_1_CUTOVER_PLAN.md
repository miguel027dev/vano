# VANO V2 — plano de substituição segura de vaigo-1

**Estado:** PREPARAÇÃO. **NÃO APLICAR NA PRODUÇÃO** até cumprir todos os gates.  
**Base de código:** `release/vaigo-1-v2` (criada a partir de `preview/vano-react-v2-7`).
**Serviço atual:** `vaigo-1`, `srv-da71i4favr4c7386ebag`, runtime Render **Python**, branch `main`, `gunicorn app:app`.
**Serviço staging:** `vano-v2-7-staging`, `srv-db66ftvlk1mc73c3omu0`, runtime Render **Node**, branch `preview/vano-react-v2-7`, fonte em `v2/`.

## Riscos críticos que impedem a troca direta

1. **Runtime imutável:** Render não converte o serviço Python existente em Node. Trocar apenas a branch não muda `gunicorn app:app` para `node server/index.mjs`.
2. **Contas e dados:** V1 usa `DATABASE_URL` em PostgreSQL; V2 usa `data/store.json` com lock single-process. A V2 **não implementa driver/adapter PostgreSQL** neste commit. Não é seguro apontar a V2 para `DATABASE_URL` e esperar migração automática. O disco do Render Free é efêmero.
3. **Motor de rotas:** a V2 precisa de `VANO_V1_API_URL` para usar as micro-rotas/safety originais. Sem a V1 em execução, o fallback Mapbox NÃO equivale ao cálculo de segurança VANO.
4. **Segredos:** configurações `Environment` são isoladas por serviço. GitHub armazena somente os **nomes** das variáveis, nunca os valores. É obrigatório comparar e vincular os segredos no Render Dashboard/secret manager. Não substituir as variáveis da V1 antecipadamente.
5. **OAuth:** callback legado `https://vanomaps.online/login/google/callback` deve continuar válido para a V1. A V2 usa `/api/auth/google/callback`; adicionar o novo callback no Google Cloud antes do cutover.
6. **Domínio e rollback:** não remover `vano-v2-7-staging` ou desligar `vaigo-1` antes de validar contas, mapas, GPS, rotas, e-mails, dados e reversão.
7. **Variáveis de desenvolvimento:** o staging executa `NODE_ENV=development` e `VANO_DEV_HTTPS=1`; não usar como configuração final de produção.

## Estratégia segura

1. Fazer backup verificado do PostgreSQL da V1; fotografar/registrar **nomes** e configurações dos dois serviços Render, inclusive domains, rotas, deploy, planos, ambiente e variáveis (sem publicar valores).
2. Implementar migração/compatibilidade de contas, sessões, preferências, favoritos, rotinas, relatos e histórico **para banco persistente**, com migração reversível e testes de integridade.
3. Escolher infraestrutura Node de produção. Como `vaigo-1` é Python, criar/reconfigurar **um serviço Node diferente** e transferir o domínio público quando estiver homologado, ou projetar outro caminho que preserve os dados e o runtime; apenas mudar a branch do serviço Python não funciona.
4. Garantir acesso contínuo ao motor Python de micro-rotas via serviço privado/restrito ou portar e validar o algoritmo no novo backend antes de desligar a V1.
5. Reutilizar segredos existentes **por secret manager/Render Environment Group**, sem exportá-los para GitHub; adicionar somente as variáveis novas, preservando as legadas até concluir a transição.
6. Publicar V2 com `NODE_ENV=production`, HTTPS real, armazenamento durável e SMTP/Resend configurado, executar testes, build, `npm audit`, smoke, revisão de segurança e teste com celular.
7. Validar Google login/cadastro, renovação/recuperação, sessões, GPS, modos segura/rápida, busca Mapbox, histórico, perfis, backup/restauração e rotas reais; monitorar erros.
8. Só após aprovação, alterar o encaminhamento do domínio `vanomaps.online` e planejar rollback automático. Retirar staging **por último**, após verificar que produção e backups estão íntegros.

## Nomes de variáveis que exigem mapeamento

| V1 atual | V2 Node | Observação |
| --- | --- | --- |
| `DATABASE_URL` | **sem suporte nesta versão** | Requer adapter PostgreSQL e migração antes de produção |
| `VANO_SECRET_KEY` | `VANO_SECURITY_SECRET` | **Não equivalentes**: gerar novo segredo forte; não reutilizar silenciosamente |
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Pode ser compartilhado após validar origens/callback |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Segredo apenas no Render |
| `GOOGLE_REDIRECT_URI` | `GOOGLE_REDIRECT_URI` | Endpoint muda para `/api/auth/google/callback` |
| `MAPBOX_ACCESS_TOKEN` | `VITE_MAPBOX_PUBLIC_TOKEN` | Somente tokens **pk.** podem ser incluídos no frontend |
| `MAPBOX_ACCESS_TOKEN` | `MAPBOX_SECRET_TOKEN` | Somente em servidor; verificar permissões antes de reutilizar |
| `PUBLIC_SITE_URL` | `VANO_PUBLIC_ORIGIN` | HTTPS e origem exata; não contém path |
| `CENTRAL_API_SECRET` / motor original | `VANO_V1_API_URL` | Preservar API V1 segura ou portar motor |
| — | `RESEND_API_KEY`, `VANO_EMAIL_FROM` | Verificação e recuperação por e-mail na V2 |
| — | `VANO_SECURITY_SECRET` | Aleatório >=32 caracteres |
| — | `VANO_TRUST_PROXY` | Somente se proxy é realmente confiável |
| — | `VANO_TRUST_GEO_HEADERS` | Somente proxy GeoIP confiável |
| — | `VITE_MAPBOX_STYLE_URL` | Opcional: URL do estilo Atlas do Mapbox Studio |

Manter todas as variáveis V1 de tráfego, OSINT, IA, radar e monitoramento enquanto a arquitetura Python estiver ativa; remover apenas depois de confirmar que não são utilizadas. No serviço Node, não copiar chaves legadas indiscriminadamente.

## Configuração de Node candidata (APÓS suporte de banco durável)

- Git: `https://github.com/miguel027dev/vano`, branch `release/vaigo-1-v2`
- Root: `v2`
- Build: `npm ci && npm test && npm run build && npm audit --audit-level=moderate` (precisa versionar lockfile)
- Start: `node server/index.mjs`
- Porta: `PORT` provida pelo Render; `API_HOST=0.0.0.0` **só com proxy confiável e revisão do servidor de produção**
- Health: `/api/health`

**Nota:** o servidor Node atual rejeita `API_HOST=0.0.0.0` quando `NODE_ENV=production`. Isso precisa ser conciliado com a infraestrutura Render **sem simplesmente desabilitar HTTPS, autenticação e validações**. Nem esse blocker nem o de persistência são resolvidos pela configuração acima.

## Limites da automação conectada

Neste ambiente a integração Render permite consultar serviços/deploys e atualizar variáveis (escrever), mas **não** fornece leitura dos valores secretos nem ações de trocar runtime/configurar branch, domínio ou excluir um serviço existente. Sem esses recursos, o cutover completo exige intervenções autenticadas no Render Dashboard e não pode ser declarado concluído.

**Critério de aceite:** V2 segura e funcional em domínio de produção, dados históricos preservados, motor seguro operativo, Google e Mapbox testados, monitoramento normal e rollback testado. Somente então retirar o staging.
