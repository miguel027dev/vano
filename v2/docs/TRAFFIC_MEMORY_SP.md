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
5. `scripts/traffic-memory-import.mjs`: conversão local apenas de observações geográficas **explicitamente verificadas e licenciadas** em um snapshot operacional. A integração autenticada SPTrans agora possui verificação KMZ apenas de estrutura, em memória e sem retenção: não transforma os dados em perfis de tráfego até validação do arquivo real, direção e licença.

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
- Confirmar token SPTrans funcionando no Render e obter autorização expressa de retenção/agregação; parser KMZ/KML já possui inspeção estrutural, mas ainda precisa ser validado com payload real antes de conversão/map-matching e influencia nas rotas.
- Acesso ao portal CET se decidir estudar 2001–2018 (uso somente exploratório).
- Confirmar extensão PostGIS e rodar a migração no banco V2, nunca no schema V1.
- Ingestor periódico idempotente, deduplicação e exportador de snapshots, alertas de qualidade/frescor.
- CI completa e teste em staging; sem deploy automático para produção nesta branch.

## Ponte SPTrans ativa em modo diagnóstico (implementação inicial)
- Variável do Render: `VANO_SPTRANS_API_TOKEN` (segredo de backend; nunca colocar no `VITE_` nem GitHub). A integração só tenta conexão se o token estiver presente; opcional `VANO_SPTRANS_LIVE_ENABLED=0` desativa totalmente as consultas.
- `server/sptrans-olhovivo.mjs`: autentica via `POST https://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=...`, preservando cookie no servidor; consulta `GET /KMZ/OutrasVias/BC` a cada 10 minutos quando configurado. Falhas, lentidão e formato inválido não interrompem rotas e não fazem retries agressivos.
- Verificação de ZIP/KMZ com limites de bytes, descompressão e contagem de `Placemark`, `LineString`, propriedades relacionadas a velocidade e sentido. Não armazena payload nem coordenadas, velocidades, IDs dos veículos, GPS de usuários ou token. Resposta contém apenas contadores.
- Endpoint **exclusivo de administrador**: `GET /api/admin/sptrans-status`, sessão necessária, limitação de requisições e `Cache-Control: private, no-store`. Informa `configured`, `authenticated`, `online`, horário de sucesso e estatísticas estruturais. O retorno **não confirma** licença, calibração carro vs. ônibus ou dados prontos para rotas.
- `affectsRouting:false` e `persistsTraffic:false` são intencionais até inspecionar a estrutura e provar o uso autorizado. O histórico direcional exige 12 amostras válidas e uma referência independente de velocidade de fluxo livre; uma única consulta KMZ **não** satisfaz esses critérios.
- Nenhuma variável deve ser usada para forçar `licenseVerified=true` ou `directionVerified=true` sem auditoria real; indicador de sucesso na API não autoriza salvar/redistribuir histórico.

### Aceite para próxima etapa
1. Conferir o diagnóstico autenticado do Render e inspecionar de forma controlada um KMZ real (com permissão) para identificar nome das propriedades, unidades, geometria e sentido verdadeiro; documentar e testar amostras sanitizadas.
2. Consultar termos específicos de uso/armazenamento histórico e de uso em roteamento automotivo; sem autorização, manter observação efêmera.
3. Se autorizado, implementar mapeamento direcional, agregação por 15 minutos, cálculo de velocidades de referência, exportador para snapshot e comparação `shadow` com Mapbox/TomTom; jamais supor que velocidade de ônibus = de carro.
4. Só após dados suficientes, testes e métricas de erro ativar ON da rota alternativa V2. V1 continua isolada.
