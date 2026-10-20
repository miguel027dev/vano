# Diagnóstico por rota — painel administrativo VANO V2
Data: 20 de outubro de 2026
Branch: preview/vano-react-v2-7
Rollback: backup/vanu-before-admin-eta-console-20261020

## Objetivo
Determinar a origem da estimativa inicial do VANO (ex.: 14 km/25 min) sem impor um tempo arbitrário, mesmo que aplicativos concorrentes indiquem outra duração.

## Como usar
1. Entrar com a conta de administrador verificada no VANO.
2. Abrir /admin > Console de rotas.
3. Digitar coordenadas EXATAS da origem e destino usados no comparativo ou selecionar um par de exemplo.
4. Selecionar carro/moto, ativar/desativar microdesvios e pressionar Analisar rotas.
5. Comparar os dados independentes das rotas rápida e alternativa; copiar o relatório JSON quando necessário.

## Campos observáveis
- Fonte do motor e perfil efetivo: Python / Mapbox, driving-traffic, driving, ou não verificado.
- Tempo exato em segundos, distância, velocidade média implícita (distância/ETA).
- Quantidade de candidatas, sondagens extras e microdesvios, quando o motor fornecer.
- Cobertura dos níveis de congestionamento: quilômetros conhecidos, desconhecidos, pesados; proporções dos dados anotados.
- Cobertura de duração por segmento e por manobra; soma de durações versus ETA.
- Trechos com congestionamento severo e ruas com maior tempo de percurso.
- Atraso em relação à duração típica *somente quando esse valor vier do provedor*.
- Influência da seleção via TomTom quando disponível; os incidentes não são convertidos em minutos arbitrários.

## Proteções
- Endpoint POST privado com sessão verificada do administrador, CSRF e limite 4/min.
- Coordenadas fornecidas manualmente; não lista nem persiste GPS ou trajetos de outros usuários.
- Não expõe tokens, provas de rota nem geometria inteira no JSON.
- Resultado não altera o algoritmo da navegação normal, o ETA dos usuários ou a ordem original de cálculo.
- Indisponibilidade de anotações aparece como 'sem dados', nunca como trânsito livre.

## Achados técnicos que motivaram o painel
- O motor Mapbox pode usar driving comum quando a consulta driving-traffic falhar.
- A média de velocidade calculada pelo ETA não comprova velocidade real.
- Faltavam indicadores da cobertura das anotações por segmento.
- Na pontuação interna, congestionamento unknown pode assumir peso 15/100; isso não deve ser interpretado como evidência de via livre.
- Comparativos com Waze não comprovam acurácia sem trajetos equivalentes e medição da viagem real.

## Próximos incrementos
- Registrar com consentimento ETA de partida e duração real, acompanhar P50/P90/P95 do erro absoluto e viés de otimismo.
- Diferenciar dados atuais de históricos por fonte e idade do dado, quando o provedor realmente informar.
- Reavaliar a pontuação de congestionamento desconhecido para desvio adaptativo, isoladamente e com testes de regressão, sem inventar penalidades em minutos.
- Avaliar compatibilidade e cobertura de fluxos oficiais TomTom antes de combiná-los com o ETA.
