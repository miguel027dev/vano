# VANO V2 — MAVI, ETA e fallback do mapa
Data: 2026-10-20
Alvo: `preview/vano-react-v2-7` (serviço Render `vanu`)
Backup: `backup/vanu-v2-before-mavi-mapfix-20261020`

## Problema reproduzido
- Pedido verbal: "recalcule uma rota que não passe pela Marginal Pinheiros".
- O assistente ofereceu uma rota aproximadamente 27 min, aceitou "sim" e confirmou a troca.
- O usuário observou um traçado aparentemente igual ao anterior.
- O mapa vetorial às vezes é substituído pelo raster/Leaflet antes de concluir a carga do estilo.

## Correção pontual aplicada
1. A expressão "Marginal Pinheiros" não pode ser confundida com "Rua Pinheiros".
2. A validação de desvios por nome continua exigindo passos de navegação do provedor.
3. Uma proposta de evitar rua/avenida só pode ser aceita se a geometria divergir de maneira relevante do percurso atual. A checagem é realizada no servidor e de novo no cliente ao confirmar.
4. O Mapbox recebe tempo adicional para carregar o estilo vetorial; ao exceder o limite, há uma recuperação por estilo Standard antes de mudar para raster.
5. Testes de regressão em parser, tipo de via, geometria e rota oferecida pela API.

## Limitações e próximos incrementos
- A geometria da rota não comprova sozinha trânsito ao vivo nem equivalência de destinos.
- O Mapbox `driving-traffic` pode cair para `driving` sem estimativa atualizada de congestionamento. A API já informa o perfil em `candidateEngine.provider` nas rotas locais, e esse campo deve ser auditado em cada benchmark.
- Nomes informados pelo provedor não cobrem necessariamente todos os segmentos. Por isso a checagem é conservadora, podendo recusar uma alternativa que seria válida.
- Expandir busca de vias laterais com grafo de conexões direcionadas, acessos permitidos, curvas obrigatórias, retornos válidos e caminhos de baixa sobreposição; não gerar atalhos em ruas proibidas ou contramão.
- Comparar 20+ pares origem/destino fixos, mesmo horário/modalidade e coordenadas; coletar ETA previsto, ETA real, comprimento, uso do perfil traffic, percentil p50/p90 de latência e % de fallback de mapa.
- O resultado entre Waze 68 min e VANO 28 min ainda precisa de percurso real antes de ser usado como prova de superioridade.

## Critérios de lançamento
- `npm test` e `npm run build` aprovados no Render.
- Teste de comando "evite a Marginal Pinheiros": se não houver rota comprovadamente distinta, a MAVI deve informar que manteve a rota atual; não pode dizer "rota selecionada".
- Validação em navegador e celular: mapa vetorial aparece sem fallback prematuro.
- Verificar `candidateEngine.provider` e `source` dos tempos publicados.

## Rollback
Restaure a branch `preview/vano-react-v2-7` usando a referência backup mencionada no cabeçalho, caso testes falhem ou haja regressão de navegação.
