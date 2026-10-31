# Histórico público de benchmarks — VANO Maps

## Endpoints

- HTML indexável: \`GET /benchmark-resultados\`
- Dados paginados para modelos de IA: \`GET /api/benchmark/v1/results\`
- Laboratório para executar novos testes: \`GET /benchmark-de-rotas\`
- Contrato atual do motor: \`GET /api/benchmark/v1/capabilities\`

Filtros em HTML e JSON: \`category\`, \`source\` (\`vano_fastest\`, \`google_maps\` ou \`all\`), \`period\` (\`7d\`, \`30d\` ou \`all\`) e \`page\` (25 resultados por página).

**Importante:** o laboratório já existente não grava histórico automaticamente. Não existem dados históricos para exibir até que execuções reais sejam revisadas e importadas. Esta funcionalidade deliberadamente **não** usa \`route_history\` de usuários nem cria medições artificiais. Nada do que já aconteceu é recuperado retroativamente só por criar a página.

## Persistência

Na inicialização do app, \`init_db()\` cria a tabela PostgreSQL \`benchmark_publications\` e seus índices. Ela não guarda nomes de usuários, e-mails, placas, GPS pessoal ou geometria detalhada. A leitura pública exibe somente registros \`published=1\`.

O arquivo de entrada para a importação é JSON com esta estrutura inicial válida, sem números inventados:

\`\`\`json
{ "records": [] }
\`\`\`

Cada registro real deve conter (e manter fontes verificáveis):

| Campo | Uso |
| --- | --- |
| \`run_id\` | ID estável único do teste, imutável após a publicação |
| \`public_places_only\` | \`true\` só após revisão humana das localidades |
| \`recorded_at\` | Timestamp ISO-8601 com fuso |
| \`category\` | \`centro\`, \`residencial\`, \`avenidas\`, \`travessias\`, \`congestionamento\` |
| \`origin_label\`, \`destination_label\` | Nomes de locais públicos, nunca localização residencial privada |
| \`profile\` | \`driving\` ou \`motorcycle\` |
| \`baseline_source\` | \`vano_fastest\` (referência interna) ou \`google_maps\` (referência externa) |
| \`baseline_eta_min\`, \`baseline_distance_km\` | Valores medidos da referência; dados ausentes são \`null\` |
| \`baseline_route_id\`, \`baseline_measured_at\` | Identificação e horário de coleta da referência |
| \`vano_mode\`, \`vano_eta_min\`, \`vano_distance_km\` | Modo e valores realmente obtidos do VANO |
| \`vano_route_id\`, \`vano_measured_at\` | Identificação e horário de coleta do VANO |
| \`vano_provider\`, \`latency_ms\` | Metadados, se disponíveis |
| \`traffic_score\`, \`safety_score\`, \`vano_score\` | Sinais opcionais, jamais reinterpretar \`null\` como zero |
| \`evidence_url\` | Endereço HTTPS com evidência externa; obrigatório para dados atribuídos ao Google |

\`baseline_measured_at\` e \`vano_measured_at\` devem estar dentro de 15 minutos. Isso é um controle mínimo de comparabilidade, não uma garantia de condições idênticas.

## Publicação manual e auditável

Em ambiente autorizado, com \`DATABASE_URL\` configurada e migração executada:

\`\`\`bash
python scripts/publish_public_benchmarks.py medições-reais.json --dry-run
python scripts/publish_public_benchmarks.py medições-reais.json
\`\`\`

O script valida **todos os registros antes de inserir qualquer um**, não substitui medições existentes com mesmo \`run_id\` e usa transação. Ele não deve receber dados diretamente de visitantes; não há endpoint público de escrita.

## Regras de divulgação

- Jamais chamar o modo \`fastest\` do próprio VANO de “Google Maps”.
- Não atribuir a Google, Waze ou terceiros resultados obtidos do mesmo motor do VANO.
- Registrar hora e fonte das duas medições, versão do motor e evidência quando houver.
- A diferença exibida é **referência menos VANO**. Valores positivos significam ETA ou distância estimados menores no VANO.
- Não afirmar “chega mais rápido”, apenas “ETA previsto menor” sem teste de viagem realizada.
- As médias de fontes heterogêneas são omitidas quando o filtro \`source=all\`.
- Quando não existem registros confiáveis, mostrar estado vazio em vez de números fictícios.
- Os números em SEO/JSON-LD descrevem um dataset público; nenhum depoimento, avaliação, resultado de concorrente ou ranking é fabricado.

## Coleta futura

O serviço que executar benchmarks periodicamente deve salvar resultados brutos e seus horários em armazenamento privado, validar os campos e publicar apenas lotes revisados no histórico público. O contrato do motor muda: sempre consulte \`/api/benchmark/v1/capabilities\` antes de escolher modos, cotas ou opções. Não use modos ou orçamentos que a versão atualmente publicada proíba.

**Operação:** esta implementação precisa de validação de integração na mesma versão do código em produção antes de qualquer deploy.
