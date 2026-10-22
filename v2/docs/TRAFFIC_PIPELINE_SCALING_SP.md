# Pipeline de trânsito do VANO — V2 admin (outubro de 2026)

## Problema que a implementação resolve
Há três fontes com papéis *distintos*:
1. **Mapbox Traffic v1**, atualização aproximada de 8 min: visualização de congestionamento no mapa, com atribuição adequada. Não é um conjunto de velocidades por rua que possamos extrair livremente e armazenar.
2. **TomTom Flow Segment Data v4**, observação em segmentos próximos da rota selecionada: evidência atual de velocidade/tempo livre e grau de confiança, rejeitando geometrias desalinhadas e confiança inferior a 0,65; cache em memória de 120 segundos, até 8 amostras ao longo dos próximos 8 km. O VANO não armazena GPS individual nem persiste valores do provedor. O próprio TomTom recomenda APIs Orbis para novas integrações (avaliar migração com contrato/permissões).
3. **TomTom Incidents Orbis**, ocorrências temporárias na via: somente observações no mapa/trecho, com cache separado; não equivale a uma série histórica de velocidade.
4. **SPTrans Olho Vivo**: somente diagnóstico porque a autenticação retornou `auth-denied`; é fonte de ônibus/corredores, **não** velocidade de carros em todas as ruas.
5. **CEM/USP LOG2025, CET/GeoSampa**: cadastro geográfico, tipo, nome, distrito e geometria. Não informa velocidades ou picos reais de 2026.

## O que mudou
- Consulta TomTom apenas para rota selecionada na V2 administrativa; até **8** pontos, no máximo **2** requisições simultâneas; cache compartilhado por coordenada arredondada de **120 segundos**, máximo **64** itens; deduplicação de requisições simultâneas.
- Orçamento automático: no máximo **60** consultas por hora e **480** por dia por instância do servidor, sem recarregamento oculto e sem deixar um fornecedor indisponível consumir chamadas indefinidamente. São tetos internos conservadores e **não** substituem a cota do contrato.
- Circuit breaker: 401/403 põem em espera por 60 min; 429 por 10 min; 5xx por 1 min. Sem chave ou dados válidos, degrada de forma segura para `unavailable`.
- Diagnósticos agregados (cacheHits, acceptedSegments, rejectedSegments, remaining quota, failures, circuitOpen, lastSuccessAt) **sem** dados de usuário, credenciais, URLs ou pontos geográficos. Só pela API autenticada `GET /api/admin/traffic-pipeline-status`.
- Na V2, abra **Auditoria de ruas** para encontrar a seção **Fontes de trânsito · diagnóstico**, com atualização sob demanda.
- A avaliação de ETA, geometria, escolha de rota, MAVI, GPS e saída para usuários da V1 ficam **iguais**. Nada é ativado por `VANO_TRAFFIC_MEMORY_MODE` nesta entrega.

## Evolução do processamento — pipeline recomendado
`Provider → Fetch limitado → Verificação legal → Validação geométrica/direcional → Rejeição de outliers → Frescor/confiança → Cache efêmero → Observabilidade → (apenas se contratado) armazenamento agregado → backtest → shadow → ativação gradual`.

Para liberar modelo histórico:
- Obter explicitamente permissão de **retenção, agregação, processamento e aplicação em roteamento**. A licença de visualização de mapas geralmente não garante direito de criar histórico independente.
- Padronizar `segment_id`, trecho, direção e unidade, janela SP `America/Sao_Paulo`, dia da semana, calendário de feriados/eventos e amostras com prazo de validade.
- Rejeitar geometria no contrafluxo, rua homônima, trecho desconectado, retornos proibidos e alternativas em ruas residenciais sem validação.
- Separar fonte de *velocidade atual* de média histórica (não somar atrasos já computados pelo Mapbox Directions driving-traffic).
- Rodar simulações por segmentos e dias separados do conjunto de treinamento: **MAE de ETA, cobertura, taxa de desvios inválidos, custo por viagem, latência p95 e falhas da fonte**.
- Evitar coletar históricos de localização de motoristas; usar somente amostras agregadas com base legal e prazo de retenção definidos.
- Somente ativar política em produção após aprovação legal, testes de segurança e melhoria consistente. O modo `off` do histórico deve permanecer o padrão.

## Cotas e escala
- A quota de 480 por dia é compartilhada somente **na instância**; múltiplas réplicas exigem um contador central em Redis/PG para limite global antes de aumentar escala. O painel não afirma visibilidade sobre outras réplicas.
- Quando expandir para 7.500 ruas, não consultar cada rua continuamente: estimar 7.500 × 24 = 180 mil consultas por dia se feita apenas a cada hora; isso excede o orçamento atual muitas vezes. Use amostragem por corredores ativos/solicitações de usuários agregadas, espaço geográfico adaptativo e dados históricos licenciados em lote.
- Nenhum polling massivo foi ativado; o tráfego visual Mapbox continua carregado no cliente de acordo com o produto licenciado.

## Fontes
- TomTom Flow v4: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data
- TomTom Orbis/migração: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/introduction
- Mapbox Traffic visual: https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/
- Mapbox Traffic Data empresarial: https://docs.mapbox.com/data/traffic/guides/data/
- Doc do inventário: `v2/docs/TRAFFIC_MEMORY_SP.md`

## Revisão honesta
A implementação entrega **controle, resiliência, rastreabilidade e observabilidade do tráfego real na V2**. Ela não produz artificialmente um banco com horários históricos para todas as 7.500 ruas, porque não há medições licenciadas disponíveis para isso.
