# VANO MAPS — Quality Pass 2026-09-24

## Escopo revisado

Varredura do pacote completo, com foco em mapa/GPS, câmera de navegação, fallback, PWA/cache, API Flask, persistência, segurança, estrutura de deploy e regressões estáticas.

O objetivo deste pass foi corrigir defeitos comprováveis sem remover comportamento útil por suposição. Paridade total com Waze não depende apenas de código: qualidade de trânsito em tempo real, incidentes e ETA também depende de cobertura de dados, densidade de usuários, telemetria e provedores.

## P0 corrigido — marcador de localização

### Causa raiz

O elemento DOM entregue ao `mapboxgl.Marker` usava `.vano-user-puck-v300`, mas o CSS sobrescrevia o posicionamento do Mapbox com `position: relative !important`. O marker precisa continuar sendo posicionado pelo mapa; quando o elemento entra no fluxo normal da página, o puck pode aparentar estar preso à viewport/câmera.

### Correções

- `.vano-user-puck-v300` agora mantém `position:absolute!important; left:0; top:0`.
- O fallback legado `.user-marker` recebe a mesma garantia quando também é `.mapboxgl-marker`.
- Arrastar/rotacionar/zoom/pitch manualmente interrompe imediatamente a animação automática da câmera e desativa follow passivo.
- `pointerdown` no canvas para a animação de câmera antes do gesto do usuário.
- Follow passivo agora usa limiar adaptativo por precisão/velocidade, evitando que ruído de GPS de poucos metros faça o mapa inteiro “respirar” quando o aparelho está parado.
- O fallback `vano-map-v122.js` foi mantido funcional, mas convertido para fonte legível, sem payload codificado + `eval`.

## Cache/deploy corrigido

- Service Worker rotacionado para `325.1.0-gps-anchor` e novos nomes de cache.
- Cache-busting do mapa/Service Worker atualizado nos templates.
- `VANO_BUILD_ID` default atualizado para `325.1.0`.
- `render.yaml` também atualizado para `325.1.0`. Isso é importante porque o valor do Blueprint sobrescrevia o default do app e estava preso em `312.0.0`.

## Backend/API corrigido

Endpoints públicos que falham em provedores externos não retornam mais `str(exc)` para o navegador. Agora:

- o cliente recebe mensagem estável, `code` e `error_id`;
- detalhes da exceção ficam no log do servidor;
- geocode, event route check, fast reroute, traffic reroute e route principal usam o mesmo padrão.

Isso reduz exposição de detalhes internos e torna erros de frontend mais previsíveis.

## JavaScript de produção auditável

Foram encontrados 11 arquivos ativos que executavam fonte codificada por `eval` em runtime. Todos foram convertidos para JavaScript legível mantendo o payload decodificado como fonte normal:

- `auth-entry.js`
- `vano-admin-finance-v93.js`
- `vano-admin-node-v92.js`
- `vano-admin-v123.js`
- `vano-admob-search-v181.js`
- `vano-nearby-cars-v1322.js`
- `vano-nearby-users-v230.js`
- `vano-routine-v230.js`
- `vano-telemetry-v123.js`
- `vano-theme-v230.js`
- `vano-v63-ui.js`

O fallback do mapa também deixou de usar `eval`. Isso melhora debugging, revisão de segurança e abre caminho para uma CSP mais restritiva.

## Limpeza comprovadamente segura

- Removido `static/templates/base.html`: era uma cópia antiga e não referenciada do template principal dentro da pasta pública.
- Não foram apagados outros assets/versionados apenas por parecerem antigos; vários caminhos ainda são carregados como fallback ou dinamicamente.
- Existe um duplicado binário de áudio: `mantenha_a_esquerda.mp3` e `mantenha_se_a_direita.mp3` têm o mesmo conteúdo. Não foi removido porque os dois nomes são precacheados e podem representar frases distintas; precisa de conferência auditiva/regravação.

## Validações executadas

- `python3 -m compileall -q .` — passou.
- `node --check` em todos os `static/*.js` — passou.
- Parsing Jinja de todos os templates — passou.
- Testes `test_vano_radars.py` + `test_vano_quality.py` — passaram.
- Checagem de funções Python top-level duplicadas — nenhuma nos módulos principais.
- Checagem de rota Flask duplicada por método+caminho — nenhuma.
- Checagem simples de código Python inalcançável após `return/raise` — nenhum caso nos módulos principais.
- Varredura por segredos óbvios hardcoded no pacote — nenhum token/chave privada/URL PostgreSQL com credencial encontrado.
- JavaScript de produção restante com `eval` — zero.

O smoke test do Flask não foi executado neste ambiente porque as dependências de runtime do projeto não estão instaladas no sandbox (`werkzeug` faltando no primeiro import). Isso deve ser coberto no CI/deploy com `pip install -r requirements.txt` e um teste de `/healthz`/rotas críticas.

## O que ainda separa o projeto de uma base “Waze-grade”

### P0 — próximo ciclo

1. **E2E real de navegação/GPS**: Playwright/Appium em Android/Chrome com cenários de pan, pinch, recenter, perda/retorno de GPS, troca de orientação, background/foreground e reroute.
2. **Migrations versionadas**: o schema ainda é criado/evoluído por `CREATE TABLE`/`ALTER TABLE` dentro de `init_db()`. O Blueprint roda isso separadamente antes do Gunicorn, o que evita concorrência de workers, mas não dá histórico/rollback de schema. Migrar para Alembic (ou ferramenta equivalente) é o passo correto.
3. **Quebrar `app.py`**: ~12,4 mil linhas e mais de cem rotas em um módulo. Separar blueprints/services para auth, routing, traffic, alerts, live trip, admin, finance, privacy e integrations.
4. **Quebrar o core do mapa**: separar GPS/filtering, camera state machine, route rendering, navigation, traffic/signals, sharing e planner. A câmera deve ter estados explícitos (`free`, `passive-follow`, `nav-follow`, `nav-free-look`, `recenter`, `preview`) em vez de flags espalhadas.
5. **Observabilidade de produção**: request/route correlation ID, métricas p50/p95/p99 de routing/geocode/provider, taxa de reroute, GPS accuracy distribution, boot-map failures e alertas por erro de upstream.

### P1

- CSP completa com nonce/hash e `script-src`/`connect-src` explícitos. Hoje os headers protegem `frame-ancestors`, mas não formam uma CSP completa.
- Contratos/schema para request e response de API (Pydantic/Marshmallow ou validação equivalente), reduzindo validação manual espalhada.
- Circuit breaker/health score para provedores externos, além dos timeouts/caches já existentes.
- Testes de contrato de banco e API com PostgreSQL temporário no CI.
- Testes de Service Worker offline/update e política clara de regiões offline.
- Budgets de performance: JS/CSS, tempo para mapa interativo, bateria, frequência de GPS, tráfego de rede e memória em Android intermediário.
- Auditoria de acessibilidade/teclado/leitor de tela e `prefers-reduced-motion` em todos os fluxos, não só componentes isolados.
- Remover assets legados somente depois de gerar um grafo de dependências de templates, SW e carregamento dinâmico.

## Critério de aceite recomendado para o bug do puck

1. Abrir mapa com GPS ativo e esperar estabilizar.
2. Fazer pan de 300–500 px: o mapa/câmera move; o puck continua na coordenada geográfica correta e portanto muda de posição na tela.
3. Dar pinch/zoom e rotação: puck permanece ancorado à mesma coordenada.
4. Tocar em recenter: câmera volta para o usuário e follow passivo é retomado.
5. Parado, com precisão GPS oscilando, a câmera não deve micro-mover a cada correção submétrica.
6. Em navegação ativa, free-look manual deve suspender câmera automática até recenter/timeout definido pelo produto, sem mover artificialmente o puck.

