# VANO V2 — plano de correção e validação do roteamento (13/11/2026)

## Escopo e fonte de verdade
Base de auditoria: `preview/vano-react-v2-7` (commit `8a187412030dbc5e96ec54e5ff5a7684b6c9f988`), serviço Render `vanu` na conta `miguelpinxs@gmail.com`. A produção continua intocada. As propostas do Argon e do modelo Google são **hipóteses**, não fatos de desempenho.

**Atenção ao caminho ativo:** `v2/server/index.mjs` invoca `calculateMapboxV1Candidates` e, se `VANO_V1_API_URL` estiver configurada, pode preferir o serviço original ou combiná-lo via `chooseV2FastCorridor` na modalidade administrativa. `route-engine.mjs` contém um motor independente, mas não foi encontrado como caminho padrão da API. Não prometer independência total sem verificar a configuração efetiva do Render.

## Achados auditados
| Tema | Estado observado | Ação |
|---|---|---|
| `unknown` versus `low` | `v1-candidates.mjs` e `route-candidates.mjs` atribuíam 15 a ambos; fallback dizia `hasTraffic:true` mesmo sem qualquer amostra conhecida | Corrigir e testar imediatamente |
| Custos de conversões | Provedor fornece ETA e geometria legal; `stepsOf` expõe manobras, mas não há modelo próprio calibrado de atraso de reentrada | Somente diagnóstico/shadow; evitar dupla contagem no ETA |
| Excluir congestionamento cedo | `congestion-bottlenecks.mjs` já aplica 500 m antes e 500 m depois, múltiplos pontos e rejeição espacial posterior | Medir eficácia antes de alterar |
| Exploração combinatória | Até 20 chamadas extras por rota longa, em duas ondas; resultados deduplicados por assinatura/aproximação | Medir latência, custo, diversidade real e reduzir só mediante ganho |
| Histórico | `traffic-memory.mjs` já possui controle de licença, direção, validade, modos `off/shadow/on` | Não substituir por previsão não calibrada |
| Recalcular/GPS | Exige auditoria separada de map-matching, histerese e cliente | Testes em trajetos gravados, nunca em produção sem validação |
| Motocicletas | Mapbox usa grafo rodoviário sem perfil de moto | Não inferir corredor livre nem velocidades seguras a partir de pistas ou faixa |

## Correção implementada nesta branch — fase 1
- Tráfego desconhecido não é classificado como `low` nem vira severidade numérica inventada.
- Cobertura de dados conhecidos é calculada por distância; `knownRatio>=0.8` é necessária para a avaliação geral receber `hasTraffic:true`, alinhando-a à exigência já usada em `hasTrafficEvidence`.
- A média de congestionamento usa **somente segmentos com evidência**; ausência de informação não é lida como velocidade livre.
- `denseSpecs` e `adaptiveSpecs` não exploram tráfego sem cobertura suficiente.
- Nenhuma mudança no ETA informado pelo Mapbox, nas permissões viárias, no modo moto ou na seleção `fast` (que permanece orientada ao ETA do provedor).
- Testes unitários com tráfego totalmente desconhecido, conhecido, parcial, inválido e sem custo adicional de API.

## Plano sequencial e critérios objetivos de aceite

### P0 — Integridade e regressão
1. Rodar `npm ci && npm test && npm run build` em Node 22, e CI completa do PR.
2. Conferir que não houve desvio em casos `low/moderate/heavy/severe`, que 0 numérico é válido e que `unknown` não libera classificação "livre".
3. Manter comportamento anterior com rollback por revert do commit; não ativar ambiente de produção.
4. Verificar se o serviço Render de produção tem `VANO_V1_API_URL`, `VANO_V2_BOTTLENECK_ROUTING` e modo `VANO_TRAFFIC_MEMORY_MODE`; registrar **apenas nomes e estados**, jamais tokens.

### P1 — Medição de qualidade/custo das alternativas
Criar replay de rotas reais anonimizado e consentido e registrar:
- `TTFB`, P50/P95/P99 do cálculo, chamadas adicionais por rota e taxa de timeout.
- Candidatos únicos reais, razão de sobreposição, aceitos/rejeitados, % de probes sem ganho.
- `MAE` e P90 do erro absoluto do ETA contra a viagem observada; taxa de desvios que não compensam.
- Casos com congestionamento, rotas paralelas, bairros sinuosos, ausência de dados, ruas interditadas, vias expressas sem saída e contramão.
**Passa** somente sem regressão de restrições, GPS, modo de transporte, ETA e dentro do orçamento definido por baseline. Sem medição, não afirmar economia percentual de requisições.

### P2 — Custo de manobra e reentrada (shadow)
Construir dataset de cruzamentos por direção/sentido e tempos reais de parada, usando dados permitidos, agregados e com consentimento. Avaliar `T = ETA_provedor + delta_residual`, **não** somar penalidades genéricas duplicadas a semáforos já modelados pelo provedor. Comparar `MAE/P90` e falsos positivos contra baseline. Só promover para decisão após melhoria replicável em horários e regiões diferentes.

### P3 — Micro-bolhas locais (protótipo isolado)
Comparar gerador atual de até 20 probes globais com decomposição de gargalos e desvios locais no **mesmo conjunto** de origens/destinos, horários e orçamento. Garantir junções topologicamente válidas, sentidos, restrições de acesso, tempos dependentes da chegada e reentrada legal; não apenas costurar linhas GeoJSON visualmente. Validar com provedor e teste de condução seguro, sem orientar o usuário a manobras arriscadas. CCH/CRP só após medir a escala do grafo e o custo da manutenção.

### P4 — Previsão temporal de congestionamentos
Usar apenas históricos e licença verificados. Colocar fusão live/histórico em `shadow`, quantificar degradação por horizonte temporal e calibrar coeficientes por região/horário. Nenhum tempo projetado deve ser apresentado como observação ao vivo.

### P5 — GPS, estabilidade e mudanças de rota
A/B offline sobre replay de rastros: HMM map-matching versus método atual, estabilidade em marginais/viadutos, falso recálculo por quilômetro, atraso de atualização e custo de CPU no celular. Introduzir histerese com limites ajustáveis e bloqueio de mudanças de última hora, sem instruções súbitas potencialmente perigosas.

### P6 — Validação e rollout
Testes unitários, propriedades, regressão, integração com mocks do Mapbox, testes offline de performance, carga controlada e canário opt-in. Com rollback explícito por flag/commit, aprovação humana antes de qualquer deploy em produção. Métricas contrafactuais são **simulações**, não equivalem a dois veículos simultaneamente medidos.

## Propostas rejeitadas por enquanto
- `unknown=low`; velocidades especulativas de corredor para moto; afirmar que a 2ª paralela está livre; desvio pela esquerda/direita com segundos fixos sem medição.
- Aleatoriedade Softmax que troque o melhor caminho por outro pior para “dispersar” motoristas.
- CCH/CRP completo, Kriging ou CVaR por nome apenas: exigir formulação correta, datasets, licença e benchmarks.
- Promessas de 70% menos chamadas ou superioridade ao Waze/Google sem experimento reproduzível.

## Status
Fase 1 proposta em branch não produtiva; testes do PR devem confirmar funcionamento. Fases P1–P6 pendentes de medições e/ou dados reais. Não houve deploy, migração de banco ou alteração das configurações do Render.
