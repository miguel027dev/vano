# VANO ETA honesto — implementação e plano
Data: 20/10/2026 · serviço: vanu · branch: preview/vano-react-v2-7
Backup pré-alteração: backup/vanu-v2-before-honest-eta-20261020

## Princípios
1. Não prometer chegada exata nem margem de ±5 minutos sem evidências reais.
2. Tempo do provedor (driving-traffic quando disponível) é a estimativa de partida; não reduzi-lo para efeitos comerciais.
3. Trânsito desconhecido ou indisponível deve ser comunicado ao usuário.
4. Não trocar silenciosamente o traçado durante uma atualização de ETA.
5. Manter fallback seguro quando anotações de tempo estiverem faltando ou incoerentes.

## Etapa implementada
- Preservação de durationSeconds na ponte original Python e no fallback Mapbox Node.
- Preservação de steps[].duration (segundos) da resposta Mapbox.
- Cálculo do tempo restante pelo perfil de duração de cada manobra, distribuído pela distância, calibrado ao ETA total do provedor.
- Se duração/distância das etapas não cobrir pelo menos 80% da rota ou divergir muito do tempo total, mantém método proporcional antigo e o classifica como fallback.
- Identificação de routingProfile e trafficDataStatus. Se o perfil não informar uso comprovado de driving-traffic, o aplicativo não o classifica como tráfego ao vivo.
- Checagem de trânsito a cada 150 segundos durante navegação ativa, dependente de GPS recente e preciso. Uma resposta pode revisar somente o ETA se os caminhos de ruas forem equivalentes e a distância até o destino for coerente; o traçado, modo escolhido e comandos de voz não mudam.
- Se o serviço falhar ou retornar um caminho diferente, o ETA não é ajustado artificialmente.
- Marca de trânsito ausente/não confirmado no painel de rota e navegação.
- Testes de cálculo por trecho, duração exata, perfil driving sem trânsito e ajuste sem mudança geométrica.

## Próximas etapas (NÃO implementadas nesta publicação)
- Registrar dados anônimos/agregados mediante consentimento: previsão de partida, revisões, origem/destino reduzidos, perfil, data/hora de chegada real; evitar armazenar trajetos detalhados desnecessários.
- Calibrar com >=100 viagens reais iniciais (pico e fora de pico), alvo P90 de erro absoluto <=5 min e acompanhar média, p50, p95, viés (ETA real menos ETA previsto).
- Verificar qualidade/latência da origem TomTom/Mapbox em incidentes e interdições, sem simplesmente somar um atraso arbitrário.
- Instrumentar taxa de uso driving-traffic, indisponibilidade de dados, resumos de refresh aceitos/rejeitados e idade do tráfego.
- Se necessário, implementar anotação fina duration por geometria para vias expressas/corredores congestionados e melhorar pareamento por GPS e incerteza.

## Critérios de publicação
- Build de produção e testes automatizados aprovados.
- Validação prática pós-deploy do funcionamento e de 1 viagem real no mesmo destino.
- Reverter pela branch backup caso navegação, cálculo ou apresentação de ETA tenha regressões.
