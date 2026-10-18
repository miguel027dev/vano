# VANO V2 Sim — Camera Adaptativa: plano de cenarios e promocao

## Escopo (2026-10-17)
- Experimentacao apenas na camera da **V2 Sim**, ativada pelo administrador na rota `/v2`.
- Nunca usar esta politica como GPS, recomendacao de faixa, certeza sobre manobras ou instrucao de conducao.
- Codigo de navegacao normal, rota, voz Mavi, tracking, API, persistencia e 6x original permanecem inalterados.
- A camera usa o marcador animado como ancora, **sem centralizar na linha**. Zoom, pitch, bearing e centro usam as animacoes ja existentes.
- Nao e permitido promover para navegacao regular somente com testes unitarios.

## Politica de comportamento
| Situacao | Evidencia necessaria | Resposta esperada | Protecoes |
| --- | --- | --- | --- |
| Reta longa (acima de ~300-600m) | Geometria valida e rumo consistente; sem manobra a menos de 430m; velocidade >= 3,5m/s | Zoom sai gradualmente de ~17,7 para ~17,0; mostrar mais via | Apenas no simulador; zoom minimo 16,72; nunca pela velocidade isolada |
| Entrada / saida a ~100m | Manobra tipificada pelo provedor como ramp/off-ramp/on-ramp e distancia | Camera aproxima do ponteiro; alvo nao passa de 18m a frente | Zoom maximo 18,18, continua atras do ponteiro; transicao desde 180m |
| Curva a 60-180m | Provider turn ou geometria com mudanca angular expressiva | Aproximar moderadamente, sem giro excessivo | Limites de bearing e pitch |
| Bifurcacao / junction | Tipo merge/fork/junction confirmado | Moderada aproximacao e menor inclinacao para revelar vias | Nao inventar faixas ou direcao |
| Rotatoria | Provider roundabout | Enquadramento um pouco mais amplo para ver saidas | Evitar zoom excessivo |
| Chegada | Tipo arrival a <=90m | Aproximar um pouco, sem recorte brusco | Nao interferir com finalizacao |
| Local com edificios | Features Mapbox existentes e proximidade do veiculo | Rebaixar pitch, reduzir opacidade de extrusoes | So camadas de predios, nunca arvores e pontes; restaurar fora da V2 Sim |
| Rota curta, mal formada ou distante do marcador | Geometria ausente, >12 mil pontos, posicao longe da geometria ou numeros invalidos | Camera conservadora, sem "reta longa" presumida | Fail-safe sem erro de mapa |
| GPS pouco preciso | Accuracy >75m (quando disponivel) | Desativar afastamento agressivo por reta | Nao inventar dados |
| Celular/tela compacta | Viewport `compact` | Menos inclinacao, limites de zoom e antecipacao | Respeitar overlays e safe areas |
| Movimento reduzido | `prefers-reduced-motion` | Sem pitch e sem antecipacao especulativa | Camera do sim permanece isolada |
| Usuario move a camera | Free-look do controlador existente | Nunca disputar controle de pan/zoom manual | Recenter explicito |
| Mudanca de rota, modo ou parada da sim | Nova referencia de geometria / `droneSimulation=false` | Descartar leitura anterior, restaurar 3D e parametros | Sem vazamento de estado |
| Offline/Mapbox nao pronto | Sem estilo carregado | Ignorar leitura de predios/voltar visual simples | Nao bloquear navegacao nem fallback Leaflet |

## Prioridades de engenharia
1. Classificador **puro, verificavel**: contexto geometico e manobra do provedor; nunca dados ficticios.
2. Amostrar geometria e predios no ciclo ja limitado a ~850ms desktop / ~1100ms mobile. Proibido avaliar polilinha longa por RAF.
3. Ordenar prioridades: entrada > rotatoria > bifurcacao > curva/chegada > reta longa > cruzeiro. A geometria sem referencia suficiente NUNCA ativa uma reta longa.
4. Trocas atenuadas pelo `motionController` existente (half-life 240-390ms), com histerese urbana.
5. Acompanhar atras do icone; manter a projecao da entrada visivel sem deslocar para o tracado.
6. Preservar opacidade original dos edificios fora da simulacao e em `setStyle`.
7. Cobertura automatizada nos extremos: velocidade zero/alta, curva longa, retas continuas, 100m de entrada, rotatoria, GPS ruim, coordenadas invalidas, celular e reduced-motion.

## Matriz de validacao manual obrigatoria antes de promover ao mapa principal
- [ ] Rodar V2 Sim pela Avenida Paulista com edificios densos: sem predios encobrindo o marcador.
- [ ] Rodar reta longa sem entrada proxima: enquadramento recua gradualmente.
- [ ] Aproximar de entrada a 180m, 100m, 50m e 0m: aproximacao gradual e suave, sem a camera passar a frente.
- [ ] Passar por rotatoria: saidas visiveis, sem clip e sem giro descontrolado.
- [ ] Realizar duas manobras em sequencia e mudanca de rota a meio da simulacao.
- [ ] Testar ruas paralelas, tuneis/viadutos e edificios altos (sem usar camada grafica como orientacao real).
- [ ] Testar dispositivos com telas estreitas, tema escuro, 2G/3G lento, preferencia de reduzir movimento e suspensao/reentrada no aplicativo.
- [ ] Entrar e sair do V2 Sim e do modo normal 6x; confirmar que o mapa real e o 3D original nao mudaram.
- [ ] Validar FPS e visual de camera no navegador real; testes Node nao provam qualidade visual ou estabilidade de WebGL.

## Gate de publicacao, observabilidade e rollback
- Feature continua isolada por `droneSimulation` e permissao de administrador em `/v2`.
- Deploy so no servico Render `vanu`, branch `preview/vano-react-v2-7`, apos `npm test` e `npm run build`.
- Confirmar build, inicializacao PostgreSQL e estado final `live` pelo Render.
- Se houver oclusao repetitiva, camera agressiva, erro Mapbox, queda FPS ou regressao em navegacao normal: recuperar deploy anterior no Render ou reverter PR. Nao alterar o servico Flask `vaigo-1`.
- Nao ligar camera inteligente a rotas normais sem testes visuais humanos e telemetria de desempenho em mobile.

## Riscos residuais conhecidos
- Densidade urbana baseada em features 3D visiveis varia por provedor, estilo e nivel de zoom. Nao equivale a altura real de predios ou confiabilidade de direcao.
- A heuristica de reta usa a polilinha disponivel: ruas curvilineas ou rotas muito detalhadas podem continuar no modo conservador.
- A posicao de camera 3D e sua oclusao dependem do renderizador Mapbox; os testes unitarios nao substituem avaliacao em browser com tiles reais.
