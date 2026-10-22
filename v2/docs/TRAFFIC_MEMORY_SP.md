# VANO Traffic Memory SP — implantação incremental da rota V2

## Objetivo e fronteiras
Construir uma memória **própria** de fluidez para trechos direcionais de São Paulo, por dia da semana e intervalos de 15 min, aproveitando indicadores públicos **legalmente reutilizáveis** e observações agregadas autorizadas. O ETA do fornecedor e os controles legais da malha viária continuam autoritativos. Nunca inferir interdição a partir de trânsito lento. O módulo é isolado da V1 e da interface, login, MAVI e créditos.

## Fontes conferidas em 21/10/2026
- **SPTrans Olho Vivo**: API oficial `v2.1`, autenticação por token de aplicativo; `GET /KMZ`, `/KMZ/Corredor`, `/KMZ/OutrasVias` fornecem KMZ com velocidade média/tempo por trecho, filtrável por sentido BC/CB. Solicitar chave e verificar condições de armazenamento/uso comercial antes da importação. Ônibus não são amostras equivalentes a automóveis/motos; calibrar separadamente. Documentação: https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
- **GeoSampa**: download de malha e camadas (SHP, KML, GeoJSON, GPKG). Útil como referência geográfica/infraestrutura, **não** fornece automaticamente o histórico de velocidades desejado. Exige map-matching rigoroso; não basta igualdade do nome de rua. Portal: https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx
- **CET LentidaoTransito (API Store da Prefeitura)**: exige Bearer Token e apresenta apenas **2001 a 2018**. Pode ajudar em pesquisa de padrões antigos, mas **não alimenta** o ranking de hoje sem amostras contemporâneas. URL: https://apilib.prefeitura.sp.gov.br/store/apis/info?name=LentidaoTransito&provider=admin&version=v1
- **CET Trânsito Agora**: consulta existente em `cet-public-overview.mjs` traz km totais por região, sem velocidades segmentadas/horário verificável. Não usar para bloquear ruas.
- **Mapbox/TomTom**: dados correntes já tratados pelo sistema existente; revisar os contratos antes de reter amostras desses fornecedores. A memória não deve copiar permanentemente dados licenciados sem permissão.

## Estado de implementação na branch
1. `server/traffic-memory.mjs`: estrutura de índice espacial por trecho/direção, perfil `weekday, quarter`, tempo previsto de chegada ao trecho, shrinkage por amostragem, decaimento temporal, limite de impacto em ETA e seleção limitada a candidatos fornecidos por Mapbox. Não cria novas geometrias; não efetua HTTP em rota.
2. `server/index.mjs`: gate `VANO_TRAFFIC_MEMORY_MODE`, padrão OFF. SHADOW calcula diagnóstico sem trocar rotas; ON pode alterar somente a rota alternativa `safe` do fallback Mapbox V2, nunca o `fast` nem a segurança validada no motor Python. `a-pe` não utiliza. Sem dados = comportamento original.
3. `server/traffic-memory.test.mjs`: testes com dados sintéticos identificados como tal; estes dados **não** são exportados para produção.
4. `sql/traffic_memory_sp.sql`: esquema separado para perfis de velocidade agregados, PostGIS e índices para futura ingestão e exportação.
5. `scripts/traffic-memory-import.mjs`: conversão local apenas de observações geográficas **explicitamente verificadas e licenciadas** em um snapshot operacional. A rotina de extração SPTrans KMZ/CET requer credenciais, contrato e avaliação do esquema real antes de automatizar.

## Contrato do snapshot operacional (NÃO dados demonstrativos)
```json
{
  "records": [
    {
      "id": "sptrans:edge-unique-id",
      "coordinates": [[-46.7, -23.6], [-46.699, -23.6]],
      "weekday": 3,
      "quarter": 76,
      "speedKmh": 14.5,
      "freeFlowKmh": 45,
      "samples": 65,
      "lastObservedAt": "2026-10-21T21:00:00Z",
      "source": "sptrans-olhovivo",
      "licenseVerified": true,
      "directionVerified": true
    }
  ]
}
```
**Esse JSON é um exemplo de formato, não uma medição da cidade.** Apenas observações com `licenseVerified=true`, `directionVerified=true`, 12 ou mais amostras e registro nos últimos 60 dias entram no índice. Cada registro é um segmento pequeno orientado no sentido efetivo da circulação; sentidos opostos são perfis diferentes.

## Rollout
- **0 / OFF (padrão):** sem efeito. Nenhum dado importado.
- **1 / SHADOW:** configurar `VANO_TRAFFIC_MEMORY_FILE=/caminho/snapshot.json` e `VANO_TRAFFIC_MEMORY_MODE=shadow`, observar somente agregados, latência p50/p95 e diferenças esperadas.
- **2 / ON experimental:** somente após amostras suficientes e testes de replay, `VANO_TRAFFIC_MEMORY_MODE=on`. Na rota de fallback Mapbox V2 somente, alteração conservadora da alternativa `safe` quando padrão recente/por sentido justifica; não altera o ETA oficial.
- **3 / Motor original:** testar suporte explícito no motor Python em PR separada, pois a decisão de segurança é do original. Até lá, não altera `vano/services/routing.py`.
- **4 / Expansão:** Morumbi / Giovanni Gronchi primeiro, depois outras vias de SP após validar ganho real de ETA, segurança viária, redistribuição do tráfego e latência.

## Critérios mínimos de aceite antes de ON
- Observações rastreáveis, licença/retenção documentadas, map-matching da via e **sentido** confirmado.
- Auditoria de amostragem e calibração carro x ônibus, eventos especiais/feriados separados, sem tratar fonte 2018 como atual.
- Testes de replay por horário com baseline e holdout (MAE ETA, chegada real voluntária agregada; nunca guardar trajeto individual).
- Sem piora material de latência p95, número de chamadas externas ou erro de rota. Testar rotas sem dados, fora de SP, mão contrária, horário atravessando meia-noite e outages.
- Restringir persistência a perfis estatísticos, sem GPS bruto de terceiros, IDs de aparelho, histórico de origem/destino ou coordenadas individuais.

## Próximas pendências reais
- Token SPTrans e autorização expressa de retenção/agregação, mais conversor KMZ/KML inspecionado contra payload real.
- Acesso ao portal CET se decidir estudar 2001–2018 (uso somente exploratório).
- Confirmar extensão PostGIS e rodar a migração no banco V2, nunca no schema V1.
- Ingestor periódico idempotente, deduplicação e exportador de snapshots, alertas de qualidade/frescor.
- CI completa e teste em staging; sem deploy automático para produção nesta branch.
