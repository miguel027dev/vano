# VANO ORIGINAL — Engenharia de rotas V1 executada na V2

**Implementação fiel**: não reescreva à mão a política de decisão de rotas original em JavaScript. A branch da V2 contém **os mesmos arquivos Python Git/blob SHA** que a branch `main` da V1. O Dockerfile na raiz inclui esses módulos exatos e executa um Gunicorn Flask original **apenas em `127.0.0.1`**; a API pública continua Node.js (V2) e fala com a implementação Python pelo adaptador `v2/server/v1-bridge.mjs`. Isso é uma incorporação do motor na instalação da V2, **não uma dependência externa do serviço antigo `vaigo-1`**.

## Fluxo original auditado

1. `vano/routes/routing.py` valida coordenadas, modo, veículo, orientação, velocidade, recálculo, exclusões e limitação. Faz cache do resultado e política de sessão.
2. `vano/services/nodes.py` decide se uma viagem motorizada deve ser distribuída; faz health-check, reserva, fan-out, hedge/failover e contingência de rotas longas.
3. `vano/services/routing.py` constrói alternativas Mapbox com tráfego e direções, snapshots no tempo, geometria completa e exclusões. Procura desvios adaptativos, microvariantes de quadra, gargalos e corredores; normaliza assinaturas, deduplica de modo exato e conserva variações sutis.
4. `vano/services/context.py` coleta fluxo colaborativo, obras/incidentes, condições de vias, clima, eventos e pontos de apoio.
5. `vano/services/safety.py` utiliza **dados objetivos**: relatos, zonas verificadas, exposição, horário, confiabilidade da amostra e contexto. Calcula scores conservadores, filtros profissionais e desvios objetivos, sem usar proxies demográficos.
6. `vano/services/route_cache.py` agrupa chamadas externas, compartilha cálculos em andamento, guarda candidatos/resultados, controla limite de convidados e histórico.
7. `vano_ai_routing.py` só pode escolher entre candidatos admissíveis; nunca gera ruas ou geometria.
8. `vano_radars.py` identifica e armazena radares de diversas fontes; `vano/services/search.py` faz busca, POI/geocodificação e suporte internacional.
9. O modo **mais rápido** escolhe **menor ETA do provedor**, sem misturar score de segurança; **mais seguro** escolhe por evidência conservadora, com limites de desvio; **smart** equilibra os fatores.

## Evidência de paridade do código

Os Git blob IDs em `main` e `preview/vano-react-v2-7` foram comparados e coincidem para todos: `app.py`, `vano/services/routing.py`, `vano/services/safety.py`, `vano/services/nodes.py`, `vano/services/route_cache.py`, `vano/services/context.py`, `vano/services/search.py`, `vano/routes/routing.py`, `vano_ai_routing.py`, `vano_radars.py`, `db_backend.py`, `vano/config.py`, `mobile_routes.py`, `requirements.lock`.

O código Python acima está **na raiz do mesmo commit**; o Dockerfile referencia essa raiz. Evitar uma cópia paralela impede divergência silenciosa entre algoritmos. A V2 usa seu frontend React e seu backend Node e executa as rotas via Flask loopback.

## Requisitos de execução do container

- Dockerfile: `Dockerfile.vano-v2`, contexto: raiz do repositório.
- Necessários, somente em Render Environment/secret manager: `DATABASE_URL` (PostgreSQL **compatível com o schema original**, com backup e acesso aprovado), `MAPBOX_ACCESS_TOKEN` (acesso real ao Directions API). Sem eles o container **falha fechado**, em vez de alegar que micro-rotas estão disponíveis.
- Para o gateway Node: `VANO_PUBLIC_ORIGIN=https://<hostname>`, `VITE_MAPBOX_PUBLIC_TOKEN` token `pk.` público, `API_HOST=0.0.0.0`; `NODE_ENV=development` **apenas em teste**, com `VANO_DEV_HTTPS=1`. Em produção, corrigir e validar armazenamento durável das contas Node, e-mail, segredo e a política de proxy em `server/index.mjs`.
- O serviço **não transfere** o PostgreSQL nem credenciais da V1 automaticamente; não há leitura dos valores secretos pelo conector Render. Não fazer `DATABASE_URL` apontar para o banco de produção sem validação de migrações e backup.
- Nó distribuído: manter `CENTRAL_API_SECRET`, configuração de nós e `VANO_DISTRIBUTED_ROUTING_ENABLED` compatíveis com o banco. Se nós estiverem indisponíveis, rotas motorizadas longas passam ao fallback **lite** original (sem micro-rotas/score completos); o adaptador marca isso como `degraded`.
- Para tráfego/mapas/IA/clima/radares, reutilizar apenas credenciais autorizadas pelo operador (Mapbox, Ollama, HERE, Event Feeds, etc.). Nada é enviado ao GitHub.
- Python é acessível **somente** por `127.0.0.1:8765` dentro do container. Não tornar o processo Python público; Node é o único ingress.
- O servidor Python pode registrar rotas e dados de sessão em seu banco; garantir avisos de privacidade e política de retenção.
- As contas V2 não são automaticamente as mesmas contas da V1. O adaptador passa preferências de navegação, mas não encaminha credenciais nem impersona IDs da V1. Personalização por histórico da conta requer migração de identidade explícita e auditada.

## Testes e homologação

- `node --test v2/server/v1-bridge.test.mjs` verifica unidades, opções, microvariantes, metadados, segurança e seleção dos modos distintos.
- `docker build -f Dockerfile.vano-v2 -t vano-v2-original .` (requer conexão de rede para instalar dependências; **não foi executado automaticamente**).
- Exigir health `/api/health` na V2 e `/healthz` interno no Python, depois confrontar rotas idênticas no mesmo banco/horário entre V1 e container (geometria, ETA, micro_strategy, risk/safety, seleção, fallback).
- Não desligar a V1 nem trocar domínio enquanto não houver comparativo real, teste com trânsito ativo e rollback.

## Limites que continuam válidos

A V2 Node ainda possui armazenamento JSON local no staging, que **não é persistente em Render Free**. O empacotamento Python+Node resolve a execução do motor de rotas original, **não** migra automaticamente as contas para um único banco transacional. A versão em Docker necessita do PostgreSQL e credenciais apropriadas. Nenhum deploy anterior foi alterado por estes arquivos.
