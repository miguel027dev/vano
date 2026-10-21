# VANO V2 — Exploração por até 20 quarteirões/corredores (2026-10-20)

## Problema diagnosticado
Mapbox Directions costuma retornar até duas alternativas por solicitação. A V2 explorava até 5 exclusões extras quando a pontuação de congestionamento permitia. Em tráfego classificado como baixo isso resultou em 0 chamadas adicionais. A versão anterior passou a procurar alguns corredores mesmo com tráfego baixo; agora a busca é feita em duas fases com limite de até 20 consultas.

## Nova árvore de busca
1. **Base:** usar rotas reais retornadas por `mapbox/driving-traffic` com geometria, ETA, congestionamento por segmento, avisos, manobras e restrições do provedor.
2. **Onda 1 (até 10):** testar exclusões independentes em 10 posições distribuídas pelo trajeto: início (12%, 20%, 28%), miolo (36%, 44%, 52%, 60%, 68%) e aproximação final (78%, 87%). Selecionar pontos por distância *real na geometria*, não índice de vértice.
3. **Onda intermediária:** onde houver evidência de congestionamento, manter propostas existentes de `adaptiveSpecs` e `denseSpecs`, também sujeitas ao teto de consultas.
4. **Onda 2 (restante até 20):** explorar exclusões em caminhos laterais que o próprio roteador devolveu. Se nenhuma rua lateral for encontrada, fazer exclusões *em pares* de trechos do corredor principal para forçar alternativas locais; os pontos não são vias fabricadas.
5. **Verificação:** excluir alternativas de geometria muito semelhante, tempo acima de 1,45x e distância acima de 1,8x da base, além de respostas contendo `violation` do provedor, indicando exclusão não cumprida. O roteador é responsável por sinalizar suas restrições conhecidas.
6. **Escolha estável:** não substituir o corredor original só por diferença mínima do ETA. Trocar por uma nova geometria apenas com economia >= `max(45s,min(95s,5,5% do ETA base))`, ou usar percurso ao menos 450 m mais curto dentro de uma margem de 30 s. Não altera a regra de rerota quando usuário realmente sai do percurso.
7. **Resultados:** manter até 24 candidatas distintas internamente, expor 2 opções principais ao navegador, e mostrar métricas no console de administrador, incluindo quantidade real de consultas enviadas, limitadas por quota, candidatas aceitas, limiar de troca e zona de exploração.

## Limites / desempenho
- Percursos >= 5km: teto de 20 consultas extras, além da consulta-base; 2,8–5km: 10; 1,35–2,8km: 5; menores: apenas alternativas básicas e sondagens antigas se houver congestionamento forte.
- Teto global da instância: 120 sondagens extras/minuto, acumuladas entre usuários.
- Concorrência: 4 em cada lote. Timeouts de 3,5s por sonda urbana; resposta base continua sendo retornável mesmo quando sondagens falham.
- Cache de 15 segundos para consultas idênticas. Navegação com `reroute:true` continua sem essa exploração profunda para não causar atraso em manobras.
- Todos os resultados com ETA Mapbox; TomTom Flow e CET permanecem em modo diagnóstico, sem adicionar atrasos arbitrários.

## Restrições importantes
- **20 consultas não significam 20 rotas distintas.** Podem resultar em 1 ou várias, conforme malha real, perfis de circulação, direitos de acesso e qualidade do provedor.
- Este processo *não é* uma enumeração completa de todas as ruas de um bairro. Tal funcionalidade exigirá grafo viário próprio, idealmente Valhalla/OSM com restrições de sentido e conversões e revisão de licenças/dados municipais.
- A conformidade com todas as leis de trânsito **não pode ser garantida**: atualidade e abrangência das restrições vêm da base do provedor. A sinalização local prevalece.
- Nenhum fator fictício de tráfego é incorporado ao ETA.

## Rollback
Branch: `backup/vanu-before-20-block-search-20261020`.
