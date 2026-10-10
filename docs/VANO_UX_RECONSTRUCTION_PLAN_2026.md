# VANO MAPS — Plano de reconstrução de UX/UI e confiabilidade

Baseline: `5539f58fde7f797225b8a18a93a8ab6a5699fc6f` (9 out 2026).
Regra: não reescrever o mapa ou empilhar animações em produção sem evidência.
Cada pacote tem branch, regressões, CI, verificação de deploy e rollback.

## Fase 1 — Bugs comprovados (pacote de baixa regressão)
- [x] Rotina semanal: coordenadas vazias/null não podem virar `0,0`.
- [x] Rotina semanal: pesquisa cancelada e obsoleta não pode repintar sugestões após editar/fechar/selecionar.
- [x] Rotina semanal: validar coordenadas e recusar sugestões sem latitude/longitude válidas.
- [x] Voz: fechar/ocultar painel na entrada da navegação deve cancelar reconhecimento, IA e áudio.
- [x] Voz: chamadas anteriores canceladas não podem sobrescrever o estado de requisição nova.
- [x] Offline: incluir script opcional da voz no cache versionado do Service Worker.
- [x] Câmera: alinhar máximos configurados de zoom aos limites já aplicados na renderização, sem mudar os limites efetivos.
- [x] Testes JS executados via Node e integrados ao pytest.
Critério de saída: testes verdes, Render live no commit correspondente, zero erros novos de inicialização; validação funcional no Android permanece separada.

## Fase 2 — Funcionalidades essenciais e acessibilidade
- Construir E2E com Playwright em viewport Android (320–430 px), tablet, landscape, desktop, teclado aberto e foco por Tab.
- Percorrer fluxos de visitante e usuário: cadastro, personalização, busca de CEP/número, confirmar destino, modos de rota, iniciar/encerrar.
- Auditar botões visíveis (ações, feedback de loading, prevenção de duplicidade, erros, modal e foco), não apenas handlers definidos.
- Verificar estado de voz na barra de pesquisa principal e no candidato Android com permissão concedida/negada.
- Garantir estados acessíveis, Escape, foco de modais, feedback não visual, preferência por movimento reduzido.

## Fase 3 — Mapa e animação
- Criar testes instrumentados para câmera em curvas/rotatórias, parada, GPS com erro de 15/50/120m, recálculo, túnel e recentralização.
- Um controlador por propriedade de câmera durante cada estado (bearing, zoom, pitch, padding).
- Inspecionar competição de timers, observers e `requestAnimationFrame`, especialmente no início da navegação e após suspender WebView.
- Reduzir animações em dispositivos de baixo desempenho sem afetar a precisão do marcador.
- Medir FPS/jank e tempo de resposta ao toque num Android de entrada e intermediário antes/depois de cada mudança.

## Fase 4 — CSS, WebView e desempenho
- Perfilar a folha canônica `static/vano.css` (2,34 MB no repositório, antes da compressão). Medir antes de modularizar.
- Consolidar regras repetidas e `!important` somente por componente, com snapshots visuais para não alterar layout.
- Conferir sobreposições: teclado, painel de busca, bottom sheet, barra do Android, safe-area, radares, overlays de navegação, orientação.
- Medir first input delay, carregamento Mapbox, memória, rede, tempos de geocodificação, cache do Service Worker.
- Testar offline real: página previamente carregada, cache presente/ausente, reconexão, servidor de geocodificação indisponível.

## Fase 5 — Segurança e entrega
- Revisar autenticação/CSRF, telemetria, vinculação de sessão, isolamento por usuário, APIs de localização ao vivo e segredos em variáveis.
- Rodar testes de regressão da fase 1 junto com CI completa e build Android de testes.
- Publicar em PRs pequenos; observar logs e deixar rollback da versão anterior disponível.
- Fazer teste físico de GPS em ambiente controlado; nunca operar testes tocando na tela enquanto dirige.

## Critérios de pronto e transparência
- P0/P1 reproduzidos e corrigidos; cobertura automatizada de todos os fluxos críticos.
- Sem erros **conhecidos** sem triagem, métricas comparadas antes/depois, CI verde e verificação pós-deploy.
- 'Zero bugs' absoluto não pode ser garantido por inspeção estática nem por CI.
- Não misturar features novas (NVIDIA/ElevenLabs) com correções da câmera e rotas.
