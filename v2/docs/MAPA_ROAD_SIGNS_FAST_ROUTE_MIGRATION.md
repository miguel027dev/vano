# Migração de placas rua/avenida e rota rápida — VANO 2026-10-22

## Auditoria V2
As caixas são placas ancoradas nas próximas conversões, usando nomes e coordenadas fornecidos pelo provedor (Mapbox/V1), não uma camada de nomes fixos para todas as ruas. Antes, eram restritas à /v2 por uma flag de administrador.
Detectamos atualização incompleta quando a localização do passo mudava mantendo o mesmo nome; placas durante tela inativa; colisão da segunda placa não recalculada após movimento da câmera; nomes com marcação inválida; incompatibilidade da API Mapbox entre previsão de saída futura e raio de manobra no recálculo.

## Migração para /mapa
As placas são compartilhadas entre /mapa e /v2 somente em navegação de carro/moto, com informações reais de passos, quando o mapa Mapbox está ativo. Não afetam câmeras, rota, GPS, MAVI, POIs ou simulações.
Rollback do recurso visual: definir VITE_PUBLIC_ROAD_SIGNS=0 e fazer redeploy. A flag administrativa permanece separada. Em Leaflet fallback ou sem instruções confiáveis, o recurso não desenha placas. Semáforo mapeado nunca significa o estado atual do sinal.

## Rota rápida
O fallback Mapbox driving-traffic já usa ETA real do provedor considerando trânsito atual e histórico. A atualização mantém o critério de estabilidade para empates, mas descarta dos candidatos de exploração e de ambas as opções exibidas os trajetos com aviso explícito de violação de acesso do próprio provedor. Nunca desenha ruas sintéticas.
A opção avoid_maneuver_radius não é enviada junto de depart_at futuro (incompatível com a API). Quando há duration_typical do Mapbox, o servidor repassa apenas a comparação com duration atual: durationTypicalSeconds e trafficVsTypicalSeconds. Não inventa pesos históricos.
Se o motor Python original está online, ele permanece sendo o provedor principal. As alterações do ranking atuam somente no fallback Mapbox. Se a API trafegada degrada ao perfil driving, nenhuma precisão de trânsito ao vivo é afirmada.

## Papel da base CEM/USP
A auditoria interna tem 7.500 nomes de ruas, 7.421 coerentes com CEM 2025 e 79 pendentes, além de 1.368 etiquetas de avenidas. O material NÃO é uma rede de navegação; não inclui velocidade medida por sentido, conectividade legal, inclinação homologada nem licença de histórico de velocidade. Portanto continua auditável, mas com peso ZERO na rota rápida até checagem externa e medição real. A rota rápida usa a rede e ETAs reais do roteador.
Antes de inserir pesos próprios: reconciliar GeoSampa/CET por trecho e sentido; validar conversões e vias restritas; obter série histórica legalmente reutilizável; aferir tempo por segmento e dia/15min, com feriados; medir precisão ETA, taxa de desvios ilegais, cobertura e custo; executar shadow e implantação gradual com rollback.
Não habilitar VANO_TRAFFIC_MEMORY_MODE=on com a planilha de ruas sem observações.

## Testes de aceitação
- /mapa carro/moto: placa nomeada e ancorada na conversão, muda ao cruzar o ponto; não atrapalha GPS.
- /mapa a pé, sem navegação ou retido em segundo plano: nenhuma placa automotiva.
- /v2: mantém isolamento de ferramentas administrativas e simulação.
- Zoom/pan, alteração de passo mantendo nome e troca de tema atualizam/removem placas sem vazamento de listeners.
- Fallback Leaflet ou nome ausente: não inventa placa.
- Aviso Mapbox tipo violation exclui corredor da rota rápida e da alternativa; ausência de rota válida nunca vira desvio fabricado.
- depart_at futuro não entra em conflito com avoid_maneuver_radius, ETA e histórico vêm só do provedor.

Referências: https://docs.mapbox.com/api/navigation/directions/ ; https://centrodametropole.fflch.usp.br/pt-br/node/17657