# Migração de placas V2 → /mapa e revisão da rota rápida

## 1. Diagnóstico antes da alteração
- `privateRoadSigns.js` montava um componente DOM para o nome da rua **no próximo ponto de manobra** (Mapbox route step `name` + `maneuver.location`). No `/v2` o recurso era exclusivo do admin. Não é uma caixa de texto para todas as ruas do mapa e não altera a geometria.
- O cache de marcadores identificava nomes/índice, mas **não** as coordenadas do ponto de manobra. Após um recálculo com a mesma rua, podia preservar uma placa no ponto antigo. Também não recalculava a separação visual da próxima manobra ao mudar o zoom.
- No fallback de cálculo Mapbox, a escolha da rota `fast` usava `chooseStableFastRoute`, que admitia uma opção até 30s mais lenta para economizar 450m: não era consistente com o rótulo *Mais rápida*.
- O algoritmo VANO já explora corredores reais via Mapbox Directions `driving-traffic`, com limite de chamadas, geometria e acesso conferidos pelo provedor. Não é correto usar nomes de ruas/horários presumidos como penalidade de ETA.

## 2. Entrega implementada
**Placas em /mapa:** são mostradas apenas em navegação automobilística/motociclística real, com GPS atualizado e direção confiável entregue pelos passos de rota do provedor. Não aparecem no mapa livre, na prévia, em caminhada, na demonstração, quando GPS expira ou quando mapa está inativo. /v2 administrativo mantém a simulação e as placas originais. No máximo uma placa principal e uma secundária, como antes.

**Corrigido:** o cache considera coordenadas e id da rota; o overlay remove marcadores quando a navegação termina e recalcula distâncias visuais ao alterar zoom, pitch ou rotação. Eventos são liberados no unmount; nomes de ruas continuam como `textContent`, evitando HTML injetado. Avenidas recebem destaque laranja discreto, inclusive no tema escuro.

**Rota rápida:** a seleção mantém o **menor ETA do conjunto validado do Mapbox**, com exceção de empate técnico limitado a **5s**, somente quando economiza ao menos **450m**. Exceções de rota por vias laterais que o provedor classifica como `violation` são rejeitadas tanto em nível de rota quanto de trecho, pois exclusões são best-effort. O fallback sem `driving-traffic` é identificado como `degraded`; não é vendido como trânsito atual.

## 3. Catálogo 7.500 ruas: função real e bloqueio
A auditoria interna detectou 7.421 entradas coerentes com o CEM e 79 pendências. Porém, o CSV próprio da auditoria tem **0 amostras históricas**, `direction_verified=False`, `authorized_history=False` e `eligible_for_v2_routing=False` em todos os registros. A geometria/nome cartográfico **não implica** trânsito horário, inclinação, sentido legal ou desvio autorizado.
- **Ativo:** rotas e tempos atuais obtidos do Mapbox Directions Traffic com várias alternativas e desvio por trechos reais, como antes, agora com seleção de ETA mais consistente.
- **Não ativado:** penas históricas baseadas no catálogo, porque inventariam congestionamento e poderiam induzir ruas de contramão, fechadas ou inseguras.
- Para integrar histórico no futuro: validar coordenadas de segmento, sentido, dias e fuso SP, amostras por quartil horário e direitos de armazenamento; alinhar segmento observado ao caminho autorizado do Mapbox, backtest de ETA, fase `shadow`, apenas depois liberação gradual.

## 4. Checklist regressivo
- [/mapa] Sem rota ativa → nenhuma placa; navegação com GPS recente e rua com manobra confirmada → placa no ponto correto; chegada/cancelamento → limpeza imediata.
- [/v2] Somente admin; simulação e painel de auditoria preservados, sem persistir GPS sintético.
- Zoom, giro, mudança de rota e tema não deixam marcadores fantasma.
- Rota rápida prioriza trânsito Mapbox disponível; se cair para `driving`, não promete dados de fluxo ao vivo.
- Navegação a pé, indicador de rua do GPS, trânsito visual, MAVI, App WebView, login e permissões intactos.
- Funções reais não alteram a fonte cartográfica nem obrigam upload do CSV da auditoria para navegar.

## Referências
- https://docs.mapbox.com/api/navigation/directions/
- https://centrodametropole.fflch.usp.br/pt-br/node/17657
- `v2/docs/TRAFFIC_PIPELINE_SCALING_SP.md`

> Importante: uma alteração de seleção em **até cinco segundos** por empate técnico não torna a ETA uma medição perfeita. Nem toda geometria de alternativa do provedor pode ser comprovada sem observações de viagem em campo.
