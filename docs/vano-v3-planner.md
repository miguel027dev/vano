# VANO Maps — Planejador de rotas V3 (prévia V2)

## Objetivo e restrições
Criar a experiência visual de busca em tela cheia e escolha de quatro meios de transporte, sem alterar o núcleo de navegação do V2, consumir a rota do V1 ou atribuir horários inventados ao transporte coletivo. Implementação incremental em HTML/CSS/JavaScript sobre Flask; não demanda migração para React.

**Disponibilidade inicial:** somente nas páginas que usam a flag de template `v2_preview`. O recurso não deve ser habilitado em produção sem teste no Android WebView, iOS Safari e navegador convencional.

## Experiência do usuário
1. O usuário toca no campo **Buscar endereço**. Um painel com altura de viewport inteira é aberto, com transição curta e botão Voltar. O campo real `#destinationInput` é **movido**, não clonado.
2. Digita “café”, “rua…” etc. O autocomplete atual (`#searchResults`) é reaproveitado na área rolável da tela cheia. Histórico, CEP, resultados, seleção e confirmação continuam sendo controlados pelo core existente.
3. Ao selecionar um local, a busca fecha. Na preparação da rota aparecem **Carro, Moto, A pé e Público**, em faixa horizontal com toque, swipe e indicação do tempo abaixo de cada opção.
4. Selecionar carro/moto/a pé usa os botões existentes `data-profile`, sem reimplementar o cálculo ou o início da navegação.
5. Selecionar Público abre um painel próprio. Com itinerários reais, o usuário pode ordenar por tempo total, caminhada ou baldeações. Na ausência de planejador externo, aparece estado de indisponibilidade explícito, sem rota falsa.
6. Ao escolher novamente uma modalidade viária, a visualização de rota rodoviária é restaurada.

## Estados e conteúdo
| Estado | Comportamento |
| --- | --- |
| Campo vazio | Instrução sobre destinos e sugestões existentes |
| Digitando | Resultados/indicador do autocomplete atual |
| Sem resultado | Mensagem nativa da busca, sem inventar pontos |
| Sem GPS | Pedir localização/origem antes de calcular estimativas |
| Calculando | Texto curto “Calculando…” no cartão do modo |
| Rota pronta | Duração mais rápida retornada para o modo, com dados reais |
| Falha de serviço | “Indisponível”, sem extrapolação |
| Público sem GTFS/planejador | Painel explicativo, sem tempo ou linha inventada |
| Navegação ativa | Não interceptar o fluxo do navegador de rotas atual |

## Lógica das previsões
- O modo atual utiliza a duração da rota selecionada do core do VANO.
- Os modos viários não selecionados podem consultar `GET /api/route` com `prefetch=1` e prioridade `fastest`; consultas são sequenciais, canceláveis e com cache curto.
- O modo visitante não dispara consultas adicionais automáticas para não consumir recursos ou créditos sem intenção.
- O selo de tempo do transporte público **não** deve somar somente o trecho em ônibus. O planejador deve entregar tempo total, incluindo espera, caminhada, embarque e baldeações.
- ETAs só são exibidos quando o provedor retorna uma duração positiva válida.

## Contrato para integração de transporte público
O endpoint implementado é `GET /api/transit/itineraries?start_lat=...&start_lon=...&end_lat=...&end_lon=...`.

Na primeira etapa ele espera a variável de ambiente de servidor `VANO_TRANSIT_PLANNER_URL` com URL HTTPS de um serviço de itinerários confiável, adaptado para o contrato VANO. **Não** é o endpoint bruto do OpenTripPlanner; um serviço adaptador deve converter a resposta do planejador GTFS para este formato:

```json
{
  "routes": [
    {
      "id": "operadora:trajeto",
      "label": "Ônibus e metrô",
      "duration_seconds": 2100,
      "walking_seconds": 420,
      "transfers": 1,
      "legs": [
        {"mode": "WALK", "line": "", "from": "Origem", "to": "Ponto inicial"},
        {"mode": "BUS", "line": "Linha verificada", "from": "Ponto inicial", "to": "Estação"}
      ]
    }
  ]
}
```

**Os números acima são somente um exemplo de esquema, não uma viagem real.** Configurar um feed GTFS atualizado (ou serviço equivalente), motor multimodal e serviço adaptador antes de mostrar linhas/horários reais. A integração atual responde `503 transit_not_configured` quando não há provedor.

O endpoint valida coordenadas, limita consultas e normaliza apenas campos esperados. Nunca encaminhar URLs externas a partir do cliente.

## Design e acessibilidade
- Busca: fundo grafite (#101318), laranja VANO como acento; cartões com alto contraste e áreas de toque de 44 px.
- Faixa de transporte: quatro opções em trilho horizontal com `scroll-snap`; textos curtos e estados selecionados perceptíveis.
- Entrada: preservar o foco e caret do input original, inclusive com teclado virtual.
- Botão Voltar e tecla Escape encerram a busca. Respeitar `prefers-reduced-motion` e safe areas da tela.
- Não bloquear a câmera ou gestos do mapa fora da tela cheia.
- Elementos do transporte público recebem HTML via DOM e `textContent`, evitando interpolar nomes de linha em `innerHTML`.

## Verificação antes do merge
- [ ] Android WebView Samsung: abrir, digitar, apagar, usar histórico, voltar; teclado não altera posição do cursor
- [ ] Chrome Android: autofill, autocomplete, scroll de resultados, swipe no seletor
- [ ] iOS Safari: teclado, áreas seguras, rolagem e gesto voltar
- [ ] Desktop: Enter, Escape, Tab e foco visível
- [ ] Navegação V2: simulação, câmera, instruções, botão Iniciar rota, recálculo e retomada
- [ ] Modos: carro, moto e caminhada usam a API correta e mostram ETA da resposta
- [ ] Rotas públicas sem provedor: UI indisponível; nenhuma rota de carro exibida como se fosse ônibus
- [ ] Rotas públicas com feed: horários, linhas, transferências, caminhada e chegada são válidos para região consultada
- [ ] Offline/429/500/timeout: mostrar mensagem clara, sem número falso e sem chamadas em loop
- [ ] Lighthouse/a11y e performance: conferir FPS de scroll e uso de CPU, sobretudo em aparelhos leves
- [ ] CI: compileall, node --check, Bandit, pytest e pip-audit
- [ ] Revisar diff e validar rollout em beta antes do merge

## Reversão
Todos os assets da nova experiência são carregados via flag `v2_preview`. Retirar os links do template e o adaptador (ou reverter este PR) restaura o planejador anterior sem migrar dados nem modificar a persistência de viagens.
