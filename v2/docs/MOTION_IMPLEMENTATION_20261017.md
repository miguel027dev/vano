# VANO V2 — Plano de implementação de animações (17/10/2026)

## Contexto e baseline
- Aplicação em uso: Render `vanu`, diretório `v2/`, React + Mapbox.
- Branch configurada no Render: `preview/vano-react-v2-7`.
- Deploy `live` verificado antes do trabalho: `3fd488d64933985feebd798b20f0208f94885723`.
- Esta implementação acontece em `polish/motion-system-v2-20261017`, sem alterar o serviço nem a configuração de deploy.

## P0 — Segurança e inventário
1. O commit de baseline é o ponto de restauração; manter o histórico e não fazer force-push nem merge automático.
2. Preservar `navigationMotion.js`, `liveMotion.js`, `VanoMap.jsx`, `MapPage.jsx`, roteamento, GPS, áudio/MAVI e APIs.
3. Registrar FPS/frame times e regressões visuais em Android WebView, Chrome desktop, tema claro/escuro.
4. Identificar animações que alteram `top/left/width/height`, sombra/filtro a cada quadro, ou multiplicam RAF/intervalos.

## P1 — Primeira camada de UI (implementada na branch)
- `src/motion-polish.css`: tokens de tempo e easing, entradas leves de painel de rota, sugestões de busca, card de rota recolhida e fundo de ocorrência.
- Mantém `translateX(-50%)` na animação de elementos ancorados ao centro (sem salto horizontal).
- Unifica microinterações de botões e seleção sem alterar dimensões nem z-index.
- Elimina a pulsação permanente de `box-shadow` da classe `.jev-listening`; conserva o anel de estado da MAVI baseado em `transform/opacity`.
- `prefers-reduced-motion` e telas de atualização lenta não recebem floreios.
- `src/lib/motionPolish.test.mjs` protege o carregamento, ancoragem, escopo e acessibilidade.
- Ainda **não foram medidos FPS nem realizados testes em dispositivos reais**.

## P2 — Câmera/GPS, somente depois de instrumentar
1. Levantar todos os escritores de câmera `easeTo/jumpTo/flyTo` e origem de `requestAnimationFrame` no V2 atual.
2. Evitar animações concorrentes (um proprietário da câmera por estado); respeitar panorâmica manual/gestos.
3. Interpolar mudanças de heading pelo menor ângulo, limitando variações bruscas com GPS instável.
4. Separar suavização visual de amostras reais do GPS, sem inventar posições ou manobras.
5. Recálculo: manter rota anterior visível até confirmar a nova e descartar resultados assíncronos antigos.
6. Testar correção de GPS, curva, rotatória, recálculo, túnel, retomada do app e orientação de tela.

## P3 — Microinterações completas e acessibilidade
1. Busca, modal de detalhes, seleção carro/moto/pedestre, pontos de interesse e marcadores.
2. Estados MAVI: ouvindo, processando, falando, pausada, sem adicionar latência à voz.
3. Manter sinais de direção e alertas imediatamente legíveis; evitar animações que distraiam o motorista.
4. Desativar decoração em economia de energia/reduced-motion sem interromper navegação ou feedback.
5. Verificar iOS Safari e Android WebView, contraste de temas, toque, teclado e leitores de tela.

## Portões antes do merge/deploy
- `cd v2 && npm test && npm run build` executados com sucesso.
- Smoke manual: abrir /mapa e /v2 admin, iniciar/finalizar navegação, buscar e escolher destino, abrir/fechar ocorrências, alternar temas, operar microfone e áudio MAVI.
- Sem divergência nas rotas, câmera, GPS, TTS, cookies, créditos, densidade de POIs ou endpoints.
- Validar a mudança em Android físico intermediário + desktop; ideal 60 FPS, sem regressões perceptíveis.
- Só então merge explícito para branch ativa e deploy acompanhado; rollback para commit anterior se falhar.

## Riscos controlados
- CSS aplicado no final das camadas do V2, não na versão Flask antiga.
- Nenhuma alteração de lógica de negócio, autenticação, layout, Mapbox source/layer ou código Android nesta etapa.
- Em caso de falha, reverter o commit/PR da camada de CSS; não restaurar backups antigos sobre melhorias posteriores.
