# VANO Global Data Engine — rollout seguro

Estado: adaptadores adicionados; credenciais e feeds dependem do provedor. `/api/route`
e o motor de rotas NÃO foram alterados. Todos os feeds novos informam
`affectsRouting:false`; dados não validados não geram manobras ou bloqueios.

## 1. APIs e variáveis Render

| Fonte / região | Variável de chave (se necessária) | Variável de endpoint/arquivo | Situação |
| --- | --- | --- | --- |
| Open Charge Map, global | `VANO_OPENCHARGEMAP_API_KEY` | Não precisa de URL, endpoint oficial fixo | Ativa com chave |
| Overture Maps, global por extrato | Sem chave | `VANO_OVERTURE_PLACES_GEOJSON_URL` | Requer extrato regional previamente gerado no R2/B2 |
| PRF acidentes, Brasil, histórico | Sem chave | `VANO_PRF_RISK_DATA_FILE` | Requer CSV histórico agregado; não representa incidentes ativos |
| US DOT WZDx, EUA | `VANO_US_WZDX_API_KEY` (opcional conforme feed) | `VANO_US_WZDX_GEOJSON_URL` | Feed WZDx oficial estadual, opcional |
| National Highways, Inglaterra | `VANO_UK_ROADS_API_KEY` | `VANO_UK_ROADS_GEOJSON_URL` | Requer conversão segura DATEX II -> GeoJSON |
| DGT, Espanha | `VANO_ES_DGT_API_KEY` (se exigida) | `VANO_ES_DGT_GEOJSON_URL` | Requer conversão DATEX II -> GeoJSON; DGT não cobre Catalunha/País Basco |
| Bison Futé, França | `VANO_FR_BISON_API_KEY` (se exigida) | `VANO_FR_BISON_GEOJSON_URL` | Requer conversão DATEX II -> GeoJSON |
| NDW, Países Baixos | `VANO_NL_NDW_API_KEY` (se exigida) | `VANO_NL_NDW_GEOJSON_URL` | Requer conversão DATEX II -> GeoJSON e atenção à migração v3 |
| Statens vegvesen, Noruega | `VANO_NO_ROADS_API_KEY` (segundo acesso concedido) | `VANO_NO_ROADS_GEOJSON_URL` | Requer adapter/transformação validada de avisos oficiais |
| Transport NSW, Austrália | `VANO_AU_NSW_API_KEY` (segundo portal) | `VANO_AU_NSW_GEOJSON_URL` | Incidentes de trânsito; eventos de incêndio excluídos |
| Transport Victoria, Austrália | `VANO_AU_VIC_API_KEY` | `VANO_AU_VIC_GEOJSON_URL` | Cabeçalho de chave `KeyID`; conversão a GeoJSON se necessário |
| NZTA, Nova Zelândia | `VANO_NZ_NZTA_API_KEY` (se exigida) | `VANO_NZ_NZTA_GEOJSON_URL` | Requer feed validado de incidentes rodoviários |

**IMPORTANTE:** a variável `*_GEOJSON_URL` deve apontar para uma URL HTTPS
confiável do provedor oficial ou transformador por nós controlado, retornando
um `FeatureCollection` GeoJSON NORMALIZADO com eventos ativos. Apenas cadastrar
a chave NÃO torna feeds DATEX II/XML compatíveis com os adaptadores JSON.
Não cadastrar uma API apontando para dados de outro formato ou exemplo falso.
URLs são validadas pela família do domínio da agência oficial; se houver um
proxy/transformador privado será necessário auditar explicitamente seu domínio
antes de habilitá-lo. Não existe fallback secreto ou uso de dados inventados.

Referências principais:
- https://www.openchargemap.org/develop/api
- https://docs.overturemaps.org/getting-data/
- https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf
- https://data.transportation.gov/Roadways-and-Bridges/Work-Zone-Data-Feed-Registry/69qe-yiui
- https://developer.data.nationalhighways.co.uk/apis
- https://nap.dgt.es/
- https://www1.bison-fute.gouv.fr/donnees-sur-le-rrn.html
- https://opendata.ndw.nu/
- https://dataut.vegvesen.no/
- https://opendata.transport.vic.gov.au/dataset/unplanned-disruptions-road
- https://www.nzta.govt.nz/about-us/our-data-and-official-information/use-our-data/about-the-apis

## 2. Endpoints implementados

- `/api/places/openchargemap?bbox=w,s,e,n`: locais reais de recarga, cache,
  sem chave no frontend; não indica disponibilidade em tempo real.
- `/api/places/overture?bbox=w,s,e,n`: estabelecimentos do extrato regional
  hospedado; não carrega GeoParquet em requests do Render.
- `/api/historical/prf?bbox=w,s,e,n`: células agregadas históricas; não viram
  alerta de acidente ativo ou sugestão automática de risco.
- `/api/road-events/regional?bbox=w,s,e,n`: fontes oficiais habilitadas e
  fallback regional já existente; sem alterar geometria/navegação.
- `/api/road-events/regional/sources`: estados e instruções de configuração.

## 3. Preparação de dados por lote

Overture Places (fora do Render, com `pip install overturemaps`):
```sh
python scripts/extract-overture.py -46.69 -23.60 -46.59 -23.50 ./out/sp-places.geojson
```
Enviar o GeoJSON resultante, revisado e menor que 2,8 MB, ao armazenamento de
objetos sob domínio HTTPS autorizado pelo gateway (por exemplo subdomínio
`.vanomaps.online` ou URL `.r2.dev`). Configurar
`VANO_OVERTURE_PLACES_GEOJSON_URL`. Para várias regiões, adicionar depois um
manifesto regional de extratos; o adaptador atual aceita UM extrato por serviço.

PRF: obter CSV **agrupado por ocorrência** no portal oficial, descompactar e rodar
fora do Render:
```sh
node scripts/import-prf-accidents.mjs ./prf-acidentes.csv ./out/prf-risk-grid.json
```
Enviar apenas o arquivo agregado para o runtime configurado via
`VANO_PRF_RISK_DATA_FILE`. A integração não armazena identificação pessoal.

## 4. Regras de não-conflito

1. Uma região ativa por requisição, sem varredura planetária; feeds fora da
   viewport não são consultados.
2. Fonte oficial habilitada é primária; TfL/DriveBC/Fintraffic continuam como
   fallback regional independente. Duplicatas do mesmo tipo e a menos de ~70 m
   são descartadas antes de retornar ao mapa.
3. Para cada região, fontes sem URL ou chave correta permanecem desabilitadas,
   sem comprometer as demais. OCM/Oveture usam endpoints próprios.
4. Falhas, timeouts e respostas inválidas mantêm snapshots válidos recentes.
   Consulta assíncrona nunca bloqueia `/api/route`.
5. Obras/incidentes oficiais e sinalização de radares são módulos separados.
   Sem mudanças na política de radares, no mapa escuro, GPS ou animações.
6. DATEX II de eventos, medições de velocidade e tempos de viagem são
   **tipos distintos**: nunca misturar tempos/velocidades no feed de incidentes
   ou calcular uma velocidade "confiável" somando provedores.
7. Nenhum fechamento de via altera o roteador automaticamente sem validação
   independente de geometria, recência e cobertura. Dados históricos da PRF
   nunca são promovidos a alertas ao vivo.
8. Registrar os termos comerciais, atribuição, atualização e limites de cada
   agência antes de habilitar publicamente.

## 5. Etapas para ativar por país

1. Validar contrato oficial (formato e permissão).
2. Obter chave se a agência exigir, adicionar apenas como ENV no Render.
3. Obter feed com URL fixa confiável; se DATEX II/XML, criar e testar conversão
   auditável para GeoJSON do tipo `FeatureCollection` com geometria verificada.
4. Executar testes com fixtures reais, indisponibilidade, erro HTTP e
   sobreposição com o fallback existente.
5. Habilitar em uma região piloto e inspecionar `/sources`, logs e UX.
6. Só então considerar efeito sobre rotas — **fora deste rollout**.

As variáveis podem ser omitidas sem efeito na usabilidade atual.
Não incluídos por pedido: Mobility Database, SPTrans, incêndios australianos,
CDMX/México ou modo transporte coletivo.
