# VANO Street Atlas — bloquinhos persistentes para ruas e avenidas

## Problema resolvido

Antes, as "placas" da V2 só mostravam nomes das ruas **nas próximas conversões**, a partir dos passos da navegação. A camada Street Atlas é adicional, presente no /mapa e /v2 inclusive sem rota ativa. A placa de próxima conversão continua com prioridade própria e fica separada.

## Algoritmo de posicionamento

1. Ao carregar um estilo vetorial ou terminar o deslocamento da câmera, consultar **apenas as feições de vias atualmente desenhadas** pelas camadas Mapbox Road/Street/Transportation. Não há requisições adicionais por rua nem instalação de banco novo.
2. Aceitar somente nomes explícitos presentes nas propriedades do provedor, e geometrias de via LineString/MultiLineString ou, quando fornecido pelo estilo, nome de via em símbolo Point. Rejeitar nomes genéricos, marcação HTML, valores sem geometria. Nunca criar nomes pela aproximação com o catálogo CEM.
3. Percorrer até 1.100 feições e escolher **no máximo uma placa por nome de rua** no viewport. Para segmentos mais curtos colocar no **meio** (50%). Em avenidas/trechos extensos escolher aproximadamente **26% do começo do trecho geométrico visível**. A posição é uma aproximação cartográfica, não o início postal/oficial da rua.
4. Deduplicar camada/faixas renderizadas, privilegiar avenidas e trechos expressivos, usar distância mínima entre retângulos. Respeitar área superior de busca, controles e painel inferior. Em navegação reservar um espaço central para o marcador e a manobra, e reduzir densidade.
5. Preservar a mesma coordenada quando o trecho ainda estiver visível e a próxima geometria equivalente estiver próxima. Atualizar/criar/remover **somente as placas modificadas** após pan/zoom/style, evitando saltos, repetição de DOM e vazamentos. Mapbox Marker conserva posição ao mover a câmera.
6. Limites adaptativos: zoom <14 nenhuma placa; zoom 14–17 até 10–23 no celular, até 46 em telas grandes; em navegação metade dessa densidade e sob economia de dados/memória mais baixa, 72% dessa quantidade. Sem polling de API e sem gravação de nomes ou localização do usuário.
7. Nomes do Mapbox são desenhados apenas com `textContent`, o que impede injeção HTML. Os cartões têm `pointer-events:none` para não bloquear gestos, contraste claro/escuro, vidro fosco discreto e detalhe laranja nas avenidas.

## Persistência e limitações

- **Persistente na sessão da visualização:** as placas continuam visíveis ao navegar, aproximar e trocar o estilo, enquanto a via nomeada continuar disponível na área mapeada. Quando saem da tela, os marcadores são destruídos; reaparecem ao voltar.
- **Não** significa gravar um cadastro duplicado com posições dos rótulos, nem afirmar cobertura de todas as ruas brasileiras. A cobertura depende de nomes e linhas publicados no estilo vetorial Mapbox. Ruas sem nome validado, fora de zoom, mapa raster/Leaflet de emergência e locais que não cabem sem colisões continuam sem bloquinho.
- A auditoria CEM/USP 7.500 ruas é um registro cartográfico e não é utilizada para impor novos horários/ETAs. Nenhum componente do algoritmo de rota, GPS, MAVI ou transmissão de dados foi alterado.
- Flag de rollback: configurar `VITE_VISIBLE_STREET_CARDS=0` e efetuar o redeploy do front-end.

## Testes

- Curta no centro e longa no início; avenida em destaque visual.
- Deduplicação por nome/estilo, orçamento de marcadores, minimização de colisões.
- Modo carro com prioridade para instrução de conversão, sem obstruir controles.
- Continuidade ao movimentar, atualizar tema e mudar estilo; liberação de todos os eventos e marcadores ao encerrar.
- Nomes ou geometrias inválidos não criam placas.
- Sem acesso a API externa, GPS persistido, motor de rotas, sincronização ou HTML dinâmico.

**Fontes:** https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/markers/ ;
https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/
