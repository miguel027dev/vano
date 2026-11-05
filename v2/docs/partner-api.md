# API de parceiros VANO Maps

Esta API permite que o backend de uma rede social pesquise lugares, calcule trajetos e crie um mapa incorporável. Ela usa os serviços reais do VANO e não usa resultados de demonstração como rotas reais.

- Base: `https://vanomaps.online/api/partner/v1`
- Guia online: `/api/partner/v1/docs`
- Contrato executável: `/api/partner/v1/openapi.json`
- Administração de credenciais: `/integracoes`, após login na conta administrativa.

## Começar

1. O administrador abre `/integracoes`, informa o nome do parceiro e a origem HTTPS exata da rede social, por exemplo `https://social.example`.
2. Copia a chave exibida uma única vez e entrega por canal privado ao responsável pelo backend. Não colocar em JavaScript de navegador, post, repositório ou aplicativo distribuído.
3. O parceiro configura `VANO_API_KEY` no servidor e chama `GET /capabilities` com `Authorization: Bearer CHAVE`.
4. Implementa busca e cálculo no backend. O navegador chama o próprio backend do parceiro, que deve autenticar seus usuários e aplicar seus próprios limites.
5. Cria uma sessão de mapa e usa a `embed_url` recebida em um iframe. A chave permanente nunca é enviada ao iframe.

As chaves padrão têm permissões de leitura. Escrita de ocorrências exige `reports:write`, concedida separadamente pelo administrador via API de administração protegida por sessão e CSRF. Voz, contas pessoais e diagnósticos administrativos não são expostos para parceiros. O transporte público depende dos feeds e da configuração já existentes.

## Calcular uma rota

```bash
curl https://vanomaps.online/api/partner/v1/routes \
  -H "Authorization: Bearer $VANO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"origin":{"lat":-23.5615,"lng":-46.6557},"destination":{"lat":-23.5874,"lng":-46.6597},"mode":"car","profile":"fastest","alternatives":1}'
```

A resposta tem `data.routes`, com `route_id`, `distance_m`, `duration_s`, `geometry`, `steps`, `warnings`, `verified_safety` e `expires_at`. `meta.request_id` identifica a chamada para suporte. GeoJSON usa `[longitude, latitude]`; as entradas usam objetos `{lat, lng}`.

`mode`: `car`, `motorcycle` ou `walking`. `profile`: `fastest` ou `safe`; caminhada aceita apenas `fastest`. `alternatives` conta rotas extras, de 0 a 2, sujeitas ao que o motor realmente encontra. Não há garantia de que existam alternativas distintas. `avoid` aceita `tolls`, `ferries` e `unpaved` para veículos; caminhada aceita somente `ferries`. Essas opções são preferências do motor e não substituem conferir a via. Não há suporte a pontos intermediários ou partida futura nesta versão.

As métricas do motor original são quilômetros e minutos e são convertidas para metros e segundos; a conversão não aumenta a precisão da estimativa. `traffic_status=unknown` significa que a API não afirma a disponibilidade de trânsito específico daquele cálculo. `safe` não é garantia de segurança.

`route_id` é uma referência cifrada à solicitação e ao perfil, com validade de 5 minutos. `GET /routes/{route_id}` recalcula o trajeto e pode mudar geometria e ETA. `POST /routes/{route_id}/recalculate` recebe somente `{"origin":{"lat":...,"lng":...}}`. Cada recuperação e cada carregamento de mapa com rota consome um cálculo. Não há armazenamento de snapshots de geometrias de provedores no banco da nova API.

## Mostrar o mapa

O backend envia a `POST /map-sessions`:

```json
{
  "allowed_origin": "https://social.example",
  "center": {"lat": -23.5874, "lng": -46.6597},
  "zoom": 14,
  "markers": [{"id": "evento_123", "lat": -23.5874, "lng": -46.6597, "label": "Evento"}],
  "route_id": null,
  "theme": "light"
}
```

Pode usar um `route_id` válido para desenhar um trajeto. A chave precisa de `map:read` e também de `routes:read` nesse caso. A resposta 201 contém `data.embed_url`, `session_id` e `expires_at`.

```html
<iframe src="URL_RECEBIDA_EM_EMBED_URL"
  title="Mapa do evento" width="100%" height="420"
  loading="lazy" referrerpolicy="no-referrer"></iframe>
```

Inserir a URL por propriedade DOM ou binding seguro do framework. O token temporário fica no fragmento da URL, que não é enviado como caminho da requisição. O iframe o remove da barra de endereço, usa-o em uma chamada ao próprio VANO e não depende de cookies de terceiros. Proteger também essa URL; não registrar tokens em analytics. O único token de provedor exposto ao mapa é a credencial pública Mapbox, necessária à renderização.

A origem deve coincidir exatamente com o cadastro: protocolo, host e porta. A página de embed envia CSP `frame-ancestors` com as origens cadastradas; o restante do site continua com sua política de bloqueio de frames. Se a rede social usa CSP, deve permitir o domínio retornado na embed_url em `frame-src`. Os demais domínios de autenticação e serviço devem ser tratados conforme o endereço efetivamente retornado pelo VANO.

Sessões duram 5 minutos, com até 10 marcadores, zoom de 0 a 20 e temas `light` ou `dark`. Depois de expirar o mapa mostra um aviso. O parceiro pede outra sessão ao seu backend e recarrega o iframe; preserve o destino e peça uma rota nova se a referência antiga expirou. A geolocalização é solicitada pela rede social com consentimento, não pelo iframe. Há créditos Mapbox e OpenStreetMap no mapa; não ocultá-los.

## Serviços publicados

Todos os caminhos abaixo são relativos à base e exigem chave, exceto docs e OpenAPI. Consultas geográficas recebem `bbox=oeste,sul,leste,norte`, com máximo de 0.065 × 0.055 graus e latitudes entre -85 e 85.

| Método | Caminho | Scope e uso |
| --- | --- | --- |
| GET | /capabilities | Recursos e limites da integração |
| GET | /places/search?q=... | places:read; até 16 sugestões |
| GET | /places/{place_id} | places:read; detalhe da referência temporária |
| GET | /geocode/reverse?lat=...&lng=... | places:read; endereço por coordenadas |
| POST | /routes | routes:read; cálculo e alternativas |
| GET | /routes/{route_id} | routes:read; novo cálculo do perfil referenciado |
| POST | /routes/{route_id}/recalculate | routes:read; nova posição de origem |
| POST | /map-sessions | map:read; criar URL incorporável |
| GET | /traffic?bbox=... | traffic:read; data.official e data.tomtom |
| GET | /pois?bbox=...&category=hospital | pois:read; pontos e infraestrutura mapeada |
| GET | /radars?bbox=... | pois:read; catálogo de radares |
| GET | /context?bbox=... | context:read; contexto e fontes geográficas |
| GET | /road-events?bbox=... | context:read; atualizações regionais de vias |
| GET | /benchmarks | benchmarks:read; resultados publicáveis |
| GET | /transit/capabilities | transit:read; cobertura habilitada |
| POST | /transit/plan | transit:read; origem e destino, se habilitado |
| GET | /reports?bbox=... | reports:read; relatos da comunidade |
| POST | /reports | reports:write; criar relato não verificado |
| POST | /reports/{id}/confirmations | reports:write; confirmar presença ou ausência |

`place_id` dura 5 minutos e não é um ID permanente do provedor. Armazene o vínculo com seu post/evento conforme direitos e consentimentos aplicáveis; não dependa de `place_id` como identificador durável. Busca retorna `data.items` e `next_cursor=null`. Listagens de feeds conservam seus campos normalizados próprios, com fontes e avisos. Benchmark usa sua paginação `page`/`pageSize`, não cursor. Consulte o OpenAPI da mesma versão para cada operação.

Dados ausentes, cache em atualização e fonte indisponível devem ser distinguidos de ausência de incidentes. Os recursos existentes podem operar sem uma fonte habilitada e retornar os avisos correspondentes. `/transit/plan` retorna `FEATURE_NOT_ENABLED` quando desabilitado, sem inventar itinerários.

## Ocorrências e idempotência

`POST /reports` exige `Idempotency-Key` de 16 a 100 caracteres e JSON com `actor_id`, `type`, `lat`, `lng` e `description` opcional (até 280 caracteres). O backend parceiro autentica seu usuário e fornece um identificador estável e pseudônimo em `actor_id`; a API não autentica a conta da rede social por conta própria.

Tipos: `via_fechada`, `transito`, `fiscalizacao`, `acidente`, `alagamento`, `obstaculo`. Relatos entram como `nao_verificado`, sem promoção automática a dados verificados. Coordenadas públicas são aproximadas; o autor não é retornado. O VANO mantém o relato no armazenamento operacional existente.

Repetição com a mesma chave e mesmos dados retorna o relato existente (HTTP 200); mesma chave com dados diferentes retorna 409. A deduplicação dura enquanto o relato é retido, normalmente até 30 dias para não verificados; não repetir a escrita após esse prazo. Existe proteção adicional para relato repetido do mesmo autor/tipo próximo em 15 minutos.

Confirmação recebe `{"actor_id":"pseudonimo_2","choice":"present"}` ou `gone`. Um ator não confirma a própria ocorrência; repetição retorna `already_recorded=true`. Um voto negativo não remove o relato.

## Limites e erros

- Por parceiro: 60 chamadas/minuto; 10 cálculos/minuto; busca 30/minuto; reverso 12/minuto; feeds 20/minuto por serviço; carga de mapa 30/minuto.
- Motor de parceiros: até 2 cálculos simultâneos e 60 cálculos/minuto no conjunto. Limites gerais de proteção do site também se aplicam (240 requisições/minuto por IP).
- Corpo JSON: 16 KiB. Texto da busca: de 2 a 200 caracteres. Até 100 credenciais cadastradas; limpar/substituir por planejamento operacional antes de ampliar.
- Relatos: 6/minuto; confirmações: 16/minuto por parceiro. Até 500 relatos retidos por parceiro.
- As cotas da nova API usam memória da instância e reiniciam no restart. A aplicação e o snapshot PostgreSQL continuam sendo de instância única. Não habilitar múltiplas réplicas sem migrar persistência e cotas para um modelo compartilhado adequado.

Erros têm `error.code`, `error.message` e `meta.request_id`. 400 JSON malformado; 401 chave inválida/revogada; 403 scope ou origem negados; 404 referência inexistente ou de outro parceiro; 410 referência expirada; 413 corpo grande; 415 Content-Type inválido; 422 campo/opção inválida ou sem rota; 429 limite; 503 provedor indisponível. Em 429 respeitar `Retry-After`; não repetir cegamente erros permanentes. No backend, usar timeout de cerca de 35 segundos para suportar os timeouts e failovers já existentes do motor; interromper a interface com mensagem útil se o limite for alcançado.

## Administração e operação

- `GET /api/admin/partner-keys`: listar metadados, sem segredos.
- `POST /api/admin/partner-keys`: criar com `name`, `origins` (até 5) e `scopes` opcionais.
- `POST /api/admin/partner-keys/{id}/rotate`: gerar novo segredo; invalida a chave anterior e referências antigas imediatamente, sem sobreposição.
- `DELETE /api/admin/partner-keys/{id}`: revogar a credencial e impedir novos carregamentos vinculados. Dados já exibidos no cliente permanecem visíveis até a expiração da sessão.

Essas operações exigem a sessão administrativa existente, verificação de conta, origem válida e `X-VANO-CSRF` obtido em `/api/bootstrap`. Em produção, criação e alteração de chaves exigem armazenamento persistente. A interface `/integracoes` oferece criação de chave de leitura, substituição e revogação. Scopes especiais são concedidos via endpoint administrativo. A chave é guardada apenas como SHA-256 de um segredo aleatório de 256 bits, sem texto puro.

`VANO_PARTNER_API_ENABLED=0` desabilita a nova API. Não foi criado outro serviço pago. Reutiliza Node, PostgreSQL e os provedores do VANO; as chamadas e o mapa podem gerar consumo nos provedores existentes. Não registrar chaves, tokens temporários ou coordenadas em logs; não ampliar retenção, cache ou redistribuição de dados sem validar os direitos dos provedores.

As referências cifradas dependem de `VANO_SECURITY_SECRET`; a troca desse segredo invalida as referências ainda válidas. Persistência segue `vano_v2.app_state` no PostgreSQL existente, com nova coleção `partnerKeys`. As rotas atuais, sessões de usuários e contas continuam com seus contratos existentes.

## Código e verificação

- API: `server/partner-api.mjs`; contrato: `server/partner-openapi.mjs`.
- Cliente backend de exemplo: `examples/partner-client.mjs` (Node 22 ou mais recente).
- Mapa: `partner-map.html` e `src/partner-map.js`, compilados pelo Vite.
- Administração: `public/partner-admin.js` e `public/partner-ui.css`.
- Testes: `npm test`; compilação: `npm run build`.

Os testes cobrem autenticação, scopes, CSRF, isolamento entre parceiros, rotação/revogação, expiração, geometria/unidades, bloqueio de demonstração, mapa, idempotência, tamanho do corpo e cotas. Os testes isolados usam fixtures explícitas; validar também o provedor real no ambiente publicado ao provisionar a chave do parceiro e a origem correta.
