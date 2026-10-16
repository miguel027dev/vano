# VANO — Plano de integração, backup e estabilidade da navegação (16/10/2026)

## Escopo e riscos observados
1. **Curvas muito próximas:** a próxima manobra era selecionada quando a posição ainda estava a 10 m da manobra atual; uma atualização gráfica baseada em posição interpolada podia sobrescrever orientação do GPS real.
2. **Áudio fora de ordem:** uma nova fala interrompia a anterior; com voz remota havia risco de marcar uma instrução cancelada como anunciada.
3. **Recálculo tardio:** distância fixa de 75 m, espera de 2,2 s e bloqueio de novas tentativas por 25 s mesmo após desvios confirmados.
4. **Instrução obsoleta ao desviar:** a tolerância para acionar voz era de 100 m fora da linha; instruções e a fala de início podiam disputar prioridade com a próxima curva.
5. **Trabalho visual redundante:** animar o marcador disparava recálculo desnecessário de orientação e movimentações DOM sem alteração visível.
6. **GPS incerto:** precisão ruim, via paralela, cruzamentos ou direção não confiável precisam suspender decisões críticas, sem fabricar localização.

## Backup e recuperação
- Repositório: `miguel027dev/vano`.
- Serviço de produção vinculado: Render `vanu`, branch `preview/vano-react-v2-7`, auto-deploy desligado.
- Ponto anterior às alterações: commit **`ca50b9c4707f8bc9fbab11b7438edcf8e48f7868`**.
- Branch de preservação: **`backup/vanu-20261016-before-navigation-stability`**; não fazer commits nessa branch.
- Branch isolada: `fix/vanu-navigation-stability-20261016`.
- Rollback operacional: restabelecer a branch publicada ao SHA acima por procedimento Git revisado, acionar um deploy manual do `vanu`, verificar `/mapa`, `/v2`, cálculo de rota, navegação, autenticação e eventos GPS; não manipular banco de usuários.
- Em uma falha de validação, manter o deploy anterior ativo. Sem alterações de schema ou variáveis de produção.

## Integração e implementação
1. Extrair as decisões de orientação para `maneuverTracker.js`: o índice da manobra avança apenas com progresso real ao longo da geometria e confirmação por rumo coerente, ou duas leituras após a curva quando o heading não é confiável.
2. Anunciar manobras sequenciais com instrução combinada antes da primeira; preservar a primeira até sua confirmação. Distâncias de 30–50 m são heurística de segurança, não um atraso fixo que ocultaria uma segunda curva a apenas 10 m.
3. `routeDeviation.js`: distância tolerada proporcional à precisão, exigência de duas leituras distintas, espera de ~0,5 s entre leituras de confirmação, pequeno cooldown de 4,5 s contra loops. Posição GPS isolada nunca dispara recálculo.
4. Integrar uma única fonte de decisões de manobra em `MapPage.jsx`. Os frames gráficos de `VanoMap.jsx` **não** emitem instruções de navegação.
5. Voz: preservar MAVI por Cartesia no contexto V2; impedir sobreposição de recados de baixa prioridade, abortar orientações antigas ao recalcular, não anunciar frases genéricas antes de curvas iminentes. Sem trocar a voz da navegação para o navegador.
6. Desenho: não escrever no DOM do marcador quando ponto e rumo quase não variaram, mantendo suavização visual e respeitando redução de movimento.
7. Não alterar autenticação, rotas seguras, cadastro, dados GeoSampa, UI administrativa, bancos, billing ou mapa fora das partes diretamente envolvidas.

## Validação e critérios de publicação
- Rodar `npm test` e `npm run build` no diretório `v2` em CI, sem segredos de produção.
- Simular curvas esquerda → direita separadas por 10 m, aviso antecipado combinado, veículo no vértice, heading confiável, heading nulo, precisão de GPS ruim, desvio real em leituras sucessivas, salto isolado e cooldown.
- Verificar que próximo passo **não** aparece prematuramente, rota antiga fica visível durante cálculo e GPS incerto não orienta de forma inventada.
- Smoke tests após deploy: `/mapa`, `/v2`, busca, prévia, navegação Carro/Moto, rota recalculada, mute/unmute MAVI, app mobile/desktop.
- Medir em aparelhos reais: tempo desde a segunda leitura confirmando desvio até o início da chamada, tempo da API até rota publicada, p95 de resposta da MAVI, FPS, CPU e suavidade do marcador. Não prometer 60 FPS ou recálculo instantâneo sem medição.

## Estratégia de publicação
- Primeiro branch isolada + PR + CI. Somente após aprovação técnica dos testes automatizados integrar à branch `preview/vano-react-v2-7`.
- Render `vanu` está com auto-deploy desligado: depois da integração solicitar deploy manual e verificar status final nos eventos/logs.
- Se os testes ou build falharem, **não** publicar nova versão no Render; corrigir na branch de trabalho.
