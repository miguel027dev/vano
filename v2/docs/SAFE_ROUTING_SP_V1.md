# VANO Safe Routing SP — protótipo experimental V0.1

> **ISOLADO.** Não há importação desse módulo no backend de produção, alteração de UI,
> conexão com bancos existentes ou deploy. Feature branch `feature/safe-routing-sp-v1`.
> O cadastro de postes NÃO comprova lâmpadas funcionando ou segurança pública.

## Estado da auditoria (15/out/2026)

- Serviço: `vanu` / Render workspace Miguel PINXS (`srv-db67qjss728c73fg5amg`).
- Branch de deploy: `preview/vano-react-v2-7`; auto-deploy desativado.
- Commit-base do deploy identificado: `61f0ce523e6a31f5b324ec2b96a903928e1e26e5`.
- Branch de recuperação de código: `backup/vanu-pre-safe-routing-2026-10-15`, fixada no commit-base.
- O serviço utiliza Node em `v2/server/index.mjs`, com React/Vite e fallback para
  Mapbox caso o motor V1 esteja indisponível. `/api/route` é POST com rate limit.
- O armazenamento do backend V2 pode ser PostgreSQL externo (`DATABASE_URL`) ou
  JSON de instância; a lista de bancos deste workspace mostra apenas um banco do TYVON.
  O destino real do armazenamento VANO ainda precisa de verificação, e NÃO foi feito
  backup de dados de usuários. Não capturar nem publicar segredos em logs.
- **Backup de código por ref Git NÃO substitui backup separado** nem snapshot de banco.

## Camadas/fontes (inventário inicial)

| Origem | Dados | Entrada esperada | Status |
|---|---|---|---|
| GeoSampa / SP Regula | Pontos de iluminação | GPKG/SHP/GeoJSON após validação | Catálogo público confirmado; dataset NÃO baixado |
| GeoSampa | Logradouros, cruzamentos, obras, riscos físicos | Camadas isoladas | Metadados e licenças a verificar individualmente |
| OSM | Malha navegável | Extração versionada; ODbL | Integração já existe para POIs no VANO |
| IBGE | Características do entorno | Agregados históricos | Não equivale a luz funcionando |
| Mapbox | Rotas candidatas, tempos, trânsito | Resultado vigente do motor | Existente |
| SSP/SP156/CGE | Ocorrências e eventos | Fontes futuras auditadas | Não ativadas no protótipo |

Catálogo de GeoSampa: https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx

## Código experimental

- `engine.mjs`: determina dia/noite via posição aproximada do sol, considera idade
  e cobertura dos registros e seleciona entre rotas previamente válidas.
- `geojson.mjs`: valida FeatureCollection em WGS84, ID, geometria, duplicação e
  faixa territorial aproximada. **Dados EPSG:31983 devem ser transformados por GIS
  verificado, não por heurística**.
- `source-fetch.mjs`: origens HTTPS allowlisted, sem redirects, limite de bytes,
  timeout e SHA-256; bytes voltam RAW e não são publicados automaticamente.
- `schema.sql`: esquema isolado PostGIS para snapshots, pontos, vias e evidências.
  É rascunho de migração manual, ainda NÃO executado.
- `adapter.mjs`: shadow mode com injeção de fornecedor de evidências, limite temporal
  e fallback; mantém exatamente o resultado do provedor de rotas.
- `safe-routing.test.mjs`, `safe-routing-adapter.test.mjs`: testes unitários
  sem rede, sem DB, sem gravações ou Mapbox real.

**Contrato de observação por trecho**, antes do ranking:
```json
{
  "lighting": "registered",
  "lengthMeters": 100,
  "sourceId": "geosampa-light",
  "inventoryComplete": true,
  "associationConfidence": 0.95,
  "updatedAt": "2026-10-15T23:00:00Z"
}
```

`registered` = infraestrutura presente em inventário, NÃO poste em funcionamento.
`no_record` = nenhuma correspondência cadastrada, NÃO rua escura.
`inventoryComplete` só pode ser true após QA da área e metadados.
Nenhum atributo do IBGE relativo a favela, raça, renda ou faixa etária é usado
como indicador de perigo; a idade considerada no algoritmo é a **idade do registro**.

## Ordem segura de integração

1. Confirmar licenças, URL final, formato e campos do GeoSampa sem suposições.
2. Baixar **amostra limitada** em staging, registrar SHA-256 e metadados da fonte.
3. Transformar geometrias projetadas com GIS para EPSG:4326, validar polígono municipal,
   conferir taxas de duplicação e rejeição, e recusar snapshots anormais.
4. Construir `road_segments` a partir da rede viária e associar iluminação
   respeitando viadutos, pontes e vias separadas; auditar manualmente amostra.
5. Implantar PostGIS **isolado**, aplicar migração revisada, persistir RAW/STAGING/APPROVED,
   aprovar snapshots de forma atômica e com rollback.
6. Criar evidenceProvider parametrizado que não registra viagens nem identifica usuários;
   usar `dryRunSafeRouting` exclusivamente em staging e com limite de CPU/timeout.
7. Verificar condições de tempo/sol, limitações de visibilidade, exigência de
   cobertura comparável e limites de desvio, além de rotas de carro e moto.
8. Executar testes unitários, geoespaciais, regressão do VANO, integração Mapbox,
   falhas simuladas de banco, latência P95 e segurança. Repetir testes via Android WebView.
9. Entregar relatório com métricas, licenças, hashes, QA e testes.
10. Só ativar a feature flag e iniciar beta voluntário **após aprovação explícita**.

## Política de risco e rollback

- Nunca desviar o usuário com base em demografia, classificação de comunidade
  ou contagem crua de ocorrências policiais.
- Bloqueios absolutos apenas quando há restrição oficial de circulação, interdição
  confirmada ou condição física impeditiva validada; respeitar veículo e sentido.
- Se fontes, contexto solar, cobertura ou banco falharem, manter rota Mapbox original.
- Não fornecer garantias de segurança. Informar insuficiência de dados.
- Manter atribuições e obrigações de licença das fontes originais.
- Nunca criar/importar dados no banco de produção a partir do downloader experimental.
- Segurança de deploy: branch isolada, sem alteração de `/api/route`, sem mudança
  das env vars Render e sem deploy automático neste branch.

## Pendências abertas

- Backup INDEPENDENTE do Git e snapshot real do banco/JSON (após identificar backend).
- Credenciais privadas do GeoSampa: não necessárias para catálogo, mas algumas APIs
  podem ter requisitos próprios; não presumir acesso.
- Baixar dataset real, extrair metadados/CRS/campos, conferir e licenciar.
- ETL persistente/worker agendado, garantia de atualização e limites de custo.
- Matching geográfico auditado e testes com dados reais.
- Indicadores de luminosidade funcional e visibilidade (não inferíveis apenas do mapa).
- Conexão real com Mapbox e feature flag no backend, condicionada aos testes.
- Revisão de UX para rótulos que chamam rota alternativa de “mais segura” quando
  o resultado assinala `verifiedSafety:false` — corrigir separadamente.


## Resultados reais do GeoSampa — teste CI de 15/out/2026 (horário de São Paulo)

O workflow `.github/workflows/geosampa-wfs-staging.yml` confirmou por
consulta HTTPS ao serviço WFS oficial:
- FeatureType: `geoportal:iluminacao_publica`.
- `numberMatched` informado pelo provedor: **662945** registros.
- Página de amostra: 250 registros, 250 aceitos, 0 rejeitados.
- Capabilities SHA-256: `3cf8e44378bd58fd90a18fd64cb7007f5fb3f65644a324e5dc3a8b9198a664cc`.
- Amostra SHA-256: `654174838c2778db890e3185596699dea5c90b1df39d81cfb5707afa11493ffa`.
- Dados: somente dry-run em runner GitHub, não persistidos no app ou PostGIS.
- Referência de metadados oficial:
  https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/intranet/api/records/1a0c8fd5-9273-4d71-8e20-440f9ccc7b5e

**O número 662945 foi declarado pelo WFS; ele não prova que todos esses
registros foram baixados, verificados, são únicos ou estão atualizados.**

### Componentes adicionados na branch de integração
- `geosampa-wfs.mjs`: consulta capabilities e amostras GeoJSON reais,
  normaliza identificadores e recusa reprojeções supostamente corretas.
- `scripts/safe-routing/import-geosampa.mjs`: executa dry-run por padrão;
  importa 1 página para banco dedicado apenas com `SAFE_ALLOW_IMPORT=1`,
  `VANO_SAFE_DB_URL` válido e `--apply`. O script recusa usar o banco principal.
- `lighting-postgis.mjs`: consultas espaciais de pontos perto da geometria
  da rota, apenas quando houver um snapshot oficialmente aprovado.
  **A distância de um poste à rota não confirma iluminação daquela via,
  não comprova funcionamento e não autoriza alterar a ordem das rotas.**
- `schema.sql`: páginas brutas, snapshots versionados, staging e
  aprovação explícita. Não executado em nenhum banco real.
- Testes de WFS e PostGIS adicionados a `v2/server/*.test.mjs`.

### Bloqueio conhecido de infraestrutura
A conta Render Miguel PINXS já possui um banco PostgreSQL gratuito
`tyvon-db`, que pertence a outro produto. Render permite somente
um banco gratuito ativo por workspace; também expira após 30 dias.
**Não compartilhar o banco do TYVON, não criar plano pago sem custo aprovado
e não configurar `DATABASE_URL` de produção para essa integração.**
Um banco PostGIS dedicado e durável ainda precisa ser provisionado,
com segredo `VANO_SAFE_DB_URL` somente no serviço de staging.

### Próximas etapas para uso na navegação
1. Provisionar banco isolado com backup e política de custos, aplicar
   `schema.sql` manualmente e conferir extensão PostGIS.
2. Planejar ingestão paginada completa dos 662945 registros:
   limites de taxa, recomeço após falhas, checksums, limites de volume e
   inspeção de licença por camada antes de publicar.
3. Cruzar os pontos de luz com a rede viária respeitando diferenças de
   nível, viadutos e ruas paralelas, e validar amostras por região.
4. Conectar provedor de evidências à rota somente após dados completos,
   snapshots aprovados, testes e modo shadow.
5. Testar falhas de WFS e banco, alternativas reais Mapbox, uso durante
   navegação, desempenho e reversão.
6. Manter sem alterações a produção e a função da MAVI até liberação.
