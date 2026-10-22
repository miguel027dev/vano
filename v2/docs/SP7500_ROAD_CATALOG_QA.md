# VANO V2 ADMIN — Auditoria das 7.500 ruas (21/10/2026)

## Proveniência
- Base original: CEM/USP LOG2025 RMSP (cartografia), arquivo original SHA256 `f9e2cafb8009cdd148c023b3415b3f62c8f220a0955da4dfb0df4dd6f0ac5f2c`.
- Lote inicial 2.500 ruas + adicional 5.000 ruas, total 7.500 IDs únicos de São Paulo, 97 distritos de referência.
- Releitura da tabela original por `MUNICIPIO=SAO PAULO`, `TIPO=R` e grupo (nome, distrito); verificação de `ETIQ`, contagem de segmentos e comprimento `LENGTH`.
- A comparação normaliza case, acentos e espaços, **mas não valida a grafia postal pela CET**. 7.421 linhas consistentes internamente; 79 exigem revisão.
- Divergências: 46 pares nome/distrito ausentes, 33 contagens diferentes, 30 extensões divergentes (grupos sobrepostos). 40 alternativas candidatas primárias e 38 secundárias sem nome correspondente em logradouros da mesma base. Nomes compatíveis NÃO implicam conexão ou mão permitida.
- **Nenhum** pico horário ou velocidade foi confirmado; nenhuma direção, declive, conversão, alternativa ou licença de memória histórica foi validada para uso no roteamento.

- **Avenidas:** conferência adicional de 1.368 etiquetas e 21.523 segmentos `TIPO=AV` no mesmo arquivo CEM, comparando ID, ETIQ, distrito e comprimento com os dados exportados: 1.368 etiquetas sem divergência interna. Nomes genéricos e homologação oficial CET continuam pendentes. Nenhum horário de pico aferido.

## Implementação segura
- Painel somente /v2 **e somente administradores**, na UI (`RoadAuditPanel.jsx`) sem import no motor de rotas; fechado inicialmente.
- A interface exibe contagens auditadas e aceita leitura local de `VANO_SP7500_Auditoria_Cruzamento_CEM2025.csv`, oferecido separadamente ao administrador. Não faz upload de CSV nem grava no servidor.
- Pesquisas por código, distrito e nome; até 100 linhas visíveis e filtro das 79 divergências.
- Qualquer CSV com campo `eligible_for_v2_routing` diferente de `False` é rejeitado.
- Integração no cálculo de rota, ETA e `traffic-memory`: **ZERO** (controle de segurança deliberado).

## Faltas bloqueadoras para mudança efetiva do algoritmo
1. Comparar segmentos homologados com as camadas oficiais GeoSampa Logradouro e CET Classificação Viária, inclusive revisão de homônimos e CEP.
2. Map matching e topologia direcionada; proibir conversões ilegais e restrições de passagem, validar declive por sentido.
3. Obter séries contemporâneas por trecho, dia da semana e janela de 15 minutos, de provedor com contrato autorizando retenção/uso; a API TomTom Flow é corrente, e TomTom Traffic Stats é produto distinto.
4. Validar amostras suficientes (>=12), detecção de outlier, holdout/replay da ETA, custos de desvio, testes noturnos e feriados, restrições por modal.
5. Ativar somente piloto em shadow e analisar piora de ETA e regressões antes de qualquer ON.
6. Manter `VANO_TRAFFIC_MEMORY_MODE=off` caso não existam dados históricos licenciados.

## Referências
- https://centrodametropole.fflch.usp.br/pt-br/node/17657
- https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx
- https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data
- https://docs.tomtom.com/traffic-stats/documentation/product-information/introduction
