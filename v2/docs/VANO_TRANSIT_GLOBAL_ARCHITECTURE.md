# VANO Transit — arquitetura global e plano de implementação

Status: Fase 1 de arquitetura e código. Não publicado; sem cobertura ativada.

## Princípios

O Transit é um roteador de viagens multimodais com caminhada, ônibus, metrô, trem, VLT, ferry e futuras modalidades locais. Não reaproveita o roteador rodoviário de carros/motos. Jamais inventa viagens, horários, linhas, preço, veículos em tempo real, disponibilidade de acessibilidade ou cobertura.

Global significa arquitetura repetível em regiões e países, não que todos os operadores do mundo já estejam conectados. Cada cidade depende de feed real publicado pela agência, licença de uso, atualização e grafo de rotas.

## Fluxo técnico

~~~text
[VANO React: /transporte]
  --> [VANO Node: /api/transit/capabilities e /api/transit/plan]
  --> [validação, CSRF, rate limiting, timeout e seleção regional]
  --> [OpenTripPlanner 2 GraphQL por região]
  --> [GTFS Schedule + OSM + atualização GTFS-RT/SIRI se existir]
  --> [normalização e ordenação das alternativas]
  --> [cartões de trechos e mapa com geometria fornecida pelo provedor]
~~~

O GTFS define agências, linhas, paradas, viagens, calendário e horários. GTFS-RT pode adicionar atrasos, alertas e posição de veículos, quando fornecido. OTP2 combina rede de caminhada OSM com horários e baldeações, e disponibiliza GraphQL. A Mobility Database ajuda a localizar feeds; a existência de um feed não garante cobertura ou qualidade.

Não consultar feeds arbitrários do navegador nem aceitar URL externa no body da requisição: os servidores OTP autorizados são definidos privadamente no backend. Viagens inter-regionais conectadas vão exigir federação/grafos mesclados em fase futura.

## Região: configuração de exemplo NÃO OPERACIONAL

~~~env
VANO_TRANSIT_ENABLED=1
VITE_TRANSIT_PREVIEW=1
VANO_TRANSIT_REGIONS_JSON=[{"id":"sp-metropolitana","name":"Grande São Paulo","bbox":[-47.5,-24.4,-45.7,-22.8],"timezone":"America/Sao_Paulo","otpUrl":"https://transit.example.org/otp/gtfs/v1"}]
~~~

transit.example.org é placeholder sem dados reais. Em produção, configurar uma instância OTP2 funcional e autorizada, alimentada com GTFS e OSM oficiais. Usar URL HTTPS com path fixo /otp/gtfs/v1.

As duas flags ficam desativadas por padrão. Mesmo com a flag visual ativada, o sistema não apresenta viagens até que exista configuração e cobertura real.

## API do módulo

- GET /api/transit/capabilities: lista áreas disponíveis e estado do módulo, sem divulgar URLs privadas.
- POST /api/transit/plan: origem e destino em [longitude, latitude], horário ISO 8601 opcional, sort opcional.
- sort: balanced, fastest, lessWalking, fewerTransfers.
- Resposta: região, fonte, itinerários, legs, duração, horários previstos e reais somente onde disponíveis, caminhada, baldeações e geometria. Tarifa inicialmente desconhecida (null).
- Se a área não estiver coberta: código not_covered; sem fallback inventado.
- Endpoint exige sessão, CSRF e limite de 12 consultas/minuto (além do limite geral).

A implementação atual faz uma consulta OTP2 planConnection e reordena alternativas. A verdadeira otimização de caminhada e transferências deve, na fase 2, influenciar também a busca dentro do OTP e não apenas a ordenação.

## Identidade visual — VANO

Paleta: fundo #F5F7F7, superfície #FFFFFF, texto #20272E, secundário #687681, laranja VANO #EA6229, bordas #E7E9EB. Cor de linha de transporte vinda da fonte quando disponível. Tipografia Manrope/DM Sans.

Desktop: header com voltar e VANO; painel esquerdo de 370 a 470px com origem, destino, hora, preferências e lista de viagens; mapa à direita. Mobile: campos e viagens no topo, mapa em área responsiva abaixo na primeira fase. Futuramente transformar o mapa em canvas completo com cartões recolhíveis.

~~~text
+----------------------------------------------------------+
| <- VANO.                              Transporte beta     |
|-----------------------+----------------------------------|
| SUA VIAGEM            |                                  |
| ORIGEM                |          MAPA INTERATIVO         |
| [ Sua localização ]   |                                  |
| DESTINO               |       segmentos reais do OTP     |
| [ Para onde vamos? ]  |       caminhada: tracejado      |
|                       |       ônibus/trem: cor da linha  |
| [ Agora / data/hora ] |                                  |
| [ Preferências      ] |                                  |
| [ Encontrar viagens ] |                                  |
|                       |                                  |
| [ Resultados reais  ] |                                  |
+-----------------------+----------------------------------+
~~~

As opções devem mostrar tempo total, horário de saída/chegada, quantas baldeações, trecho a pé, sequências de linhas e situação dos dados: programado ou atualizado em tempo real. Sem preço se tarifa desconhecida. Avisar quando não há fonte e nunca supor acessibilidade.

## Pipeline de dados a construir por região

1. Registrar operadoras e fontes oficiais, direitos de uso e calendário de atualização.
2. Ingerir ZIP GTFS em lote, validar estrutura, serviços, fusos e qualidade; ingestão GTFS-RT separada e frequente onde disponível.
3. Importar OpenStreetMap PBF e construir grafo OTP2 regional em infraestrutura separada.
4. Validar itinerários de referência, baldeações e caminhada; publicar uma versão atômica do grafo.
5. Monitorar feeds, realtime desatualizado, performance, gaps e incidentes.
6. Repetir por regiões: São Paulo piloto, depois outras cidades/países. Desenhar federação para trajetos que cruzam regiões ou fronteiras.

## Etapas e qualidade

Fase 1: módulo backend isolado, contratos, normalização, testes mockados, página beta responsiva, renderização de linhas reais. Essa é a fase deste ciclo.

Fase 2: rodar npm test e npm run build, homologar com OTP real/GTFS de uma região, medir tempo/respostas, aplicar cache por região, abortar requisições obsoletas e tratar realtime stale.

Fase 3: preferências diretamente em OTP (caminhada, baldeações, acessibilidade conforme dados), alertas, tarifas confiáveis, versões de feed, renderização de paradas e plataformas.

Fase 4: entrada via seletor de transportes do mapa existente com rollout por flag/canário, análise de latência, custo por rota e regressões em carro, moto, navegação e rotas a pé.

Observação: OTP2 JVM com grafos GTFS/OSM para múltiplas regiões não deve ser instalado sem dimensionamento no pequeno serviço Node/Render Free do VANO. Rodar OTP dedicado e manter o VANO como gateway.

## Arquivos do primeiro ciclo

- server/transit-engine.mjs — motor/adaptador regional.
- server/transit-engine.test.mjs — testes de validação, normalização, provedores e cobertura.
- server/index.mjs — endpoints isolados atrás de feature flag.
- src/pages/TransitPage.jsx — interface experimental.
- src/components/TransitMap.jsx — geometria Mapbox por perna de viagem.
- src/transit-preview.css — design responsivo sem tocar os estilos globais.
- src/App.jsx — rota experimental /transporte atrás de feature flag.

Referências oficiais:
- https://gtfs.org/documentation/overview/
- https://docs.opentripplanner.org/en/latest/apis/GTFS-GraphQL-API/
- https://github.com/MobilityData/mobility-feed-api
- https://transitous.org/doc/


## Atualização: rotas econômicas, velocidade e atrasos

O seletor Transit mostra apenas duas escolhas principais:

- **Mais econômica:** ordenar pelo preço total somente quando tarifas completas forem verificáveis e comparáveis. Integrações gratuitas e descontos não devem ser cobrados novamente.
- **Mais rápida:** menor duração completa, incluindo espera e caminhada.

Se qualquer opção do conjunto de resultados não tiver preço confiável, a econômica vira **menos embarques** como aproximação de conveniência, e a UI explica que **não há garantia de menor preço**. Nunca assumir que trocar de ônibus obriga pagar outra passagem. GTFS Fares V2 inclui produtos tarifários e regras de integração.

O módulo OTP2 pede fareProducts de cada Leg. Cada FareProductUse.id representa uma instância de bilhete e deve ser deduplicada em vários trechos. Na versão inicial o cálculo só aceita exatamente um DefaultFareProduct normal e precificado por trecho, com moeda consistente. Não soma passagens alternativas nem bilhetes dependentes; categorias especiais exigem implementação adicional. Há testes dessa deduplicação e do fallback.

### Atrasos

GTFS Realtime suporta TripUpdates, VehiclePositions e ServiceAlerts. A API Olho Vivo da SPTrans é possível adaptador adicional para ônibus de São Paulo. A disponibilidade depende da agência, licença e limites de acesso.

- Atualizar as fontes aproximadamente a cada 30 segundos quando permitido; aproveitar cache e deduplicação de requisições.
- Usar timestamp da **observação original do veículo/operadora**, não o momento do download.
- TripUpdates e VehiclePositions acima de 90 segundos são desatualizados; alertas com mais de 10 minutos necessitam revisão.
- OTP2 pode fornecer estimated.time sem timestamp da observação. Nesse caso a interface pode exibir **previsão da operadora**, mas não afirmar que foi atualizada agora.
- O atraso é a diferença entre o horário previsto e o programado; valores negativos indicam adiantamento. Calcular sobre timestamps ISO com fuso.
- Nunca usar dados atrasados/inválidos para sobrescrever horários programados com aparência de tempo real.

A base de validação foi criada em server/transit-realtime.mjs com testes unitários; o conector GTFS-RT/SIRI real, scheduler e cache ainda não estão implementados.

### Futuras confirmações dos passageiros — fase posterior

Possíveis botões: "Passou", "Ainda não passou", "Chegou adiantado", "Lotado". Isso ainda NÃO foi implementado. Antes de liberar:

1. Relato ligado à **parada + viagem + janela de horário**, não apenas ao número da linha.
2. Privacidade por padrão: não publicar pessoa ou GPS individual; retenção curta e consentimento quando necessário.
3. Rate limiting, deduplicação, proteção contra spam, moderação e correção de informações equivocadas.
4. Relatos marcados como **comunidade** e não como dados oficiais; preferir múltiplas confirmações independentes antes de alterar ETA.
5. Relatos expirados não devem continuar interferindo na navegação.

### Branding e requisitos de qualidade

Dois cartões no preview: carteira para econômica e raio para rápida. Exibir total da tarifa quando verificado; caso contrário, "Tarifa não informada". Exibir separadamente minutos de atraso e rótulos "horário programado" e "previsão da operadora". Mapa mantém cores oficiais de cada linha, caminhada cinza tracejada e badges pequenos com identificação da linha de ônibus.

Antes do rollout, validar região-piloto com dados e tarifas reais, medir latência e frescor, testar meio-dia/meia-noite/feriados/fusos, certificar desempenho mobile e ajustar a busca OTP: ordenar os primeiros resultados por preço **não garante** a verdadeira rota mais econômica global, por isso o produto deve evitar essa promessa até a política de exploração de itinerários estar completa.

Feature flags continuam desativadas; não realizar deploy no domínio público durante esta fase.

Fontes:
- https://gtfs.org/getting-started/features/fares/
- https://gtfs.org/documentation/realtime/realtime-best-practices/
- https://gtfs.org/documentation/realtime/feed-entities/trip-updates/
- https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
