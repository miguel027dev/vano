# VANO Traffic Intelligence — implementação conservadora (20/10/2026)

## O que foi integrado
- TomTom Traffic Flow v4: usa a credencial já existente `VANO_TOMTOM_API_KEY` somente no backend, limitada a três amostras por rota no console administrativo. Cada observação verifica qualidade/confiança, distância à geometria e **sentido da via** antes de ser considerada compatível. Chamada sob demanda, cache de 2 minutos e limite por instância de 96 chamadas/dia. Se a chave só tiver permissão de incidentes, o console apresenta indisponibilidade sem quebrar as rotas.
- CET SP: resumo público `https://www.cetsp.com.br/transito-agora/transito-nas-principais-vias.aspx` com lentidão agregada por Norte, Oeste, Centro, Leste e Sul. Consulta limitada ao painel administrativo e a trajetos com origem/destino em São Paulo; cache de 15 minutos; não atribui a lentidão agregada a um segmento específico. O conteúdo é apenas referência ao dado oficial, sem redistribuição de feed de trechos nem alegação de licença de uso.
- Fonte nacional histórica CET via API Store: não conectada a tempo real (dados de 2001–2018; exige token).
- Fontes regionais sem credencial que já existiam: TfL Londres, DriveBC Open511 no Canadá e Fintraffic na Finlândia, preservadas como eventos consultivos de infraestrutura e interdições, não como ETA por rua.
- CEMADEN: dados de chuvas de estações públicas e downloads, com mecanismos de confirmação humana e dados UTC. Sem um contrato de feed automatizado e licença verificada, não é usado para gerar minutos. Referência: https://www2.cemaden.gov.br/pluviometros-automatico/
- Open-Meteo sem chave: **não ligado** em produção; os termos do serviço gratuito limitam a uso não comercial. Avaliar plano comercial ou meteorologia pública equivalente.
- Satélite: imagem não equivale a medições viárias de congestionamento minuto a minuto.

## Fórmula auditada
Para cada segmento orientado `e` de comprimento `d_e`:
`T_e = d_e / max(v_e, v_min)`, mas apenas depois que houver ligação inequívoca com a mesma pista e dados de velocidade com licença adequada. **Ainda não aplicar esse cálculo em produção** com amostras esparsas do TomTom.

Auditoria independente:
- Mapbox segue gerando `ETA_mb = sum(tempo_dos_trechos_mapbox)`.
- TomTom Flow indica `q_e = velocidade_atual/velocidade_fluxo_livre` de poucos pontos da rota (confiabilidade `c_e` e correspondência geométrica/direcional confirmadas).
- O painel mostra média ponderada `q = sum(c_e*q_e)/sum(c_e)`, número de amostras compatíveis e discrepâncias. Nunca propaga um único `q` para todos os quilômetros.
- CET SP mostra lentidão por região **sem estimar (v_e)**.
- Nenhuma nova fonte adiciona minutos ao ETA do usuário, para não duplicar congestionamentos já contemplados no Mapbox.

## Para transformar em ETA calibrado futuramente
1. Obter velocidades por segmentos dirigidos e licenças para cálculos/combinação de fontes.
2. Mapear estrada, sentido, pista, horário e validade; rejeitar pontos próximos em pistas diferentes.
3. Medir cobertura espacial e temporal; nunca substituir trecho desconhecido por velocidade livre.
4. Comparar ETA Mapbox e ETA da fonte alternativa em *shadow-mode*, com 100+ viagens reais de usuários com consentimento, em condições variadas.
5. Ajustar pesos só após demonstrar queda na MAE, P90 do erro absoluto, viés e erro por faixa de duração.
6. Ativar correção graduada por segmento com rollback e limites, **não pela média municipal da CET nem por um fator arbitrário**.

## Privacidade, quota e rollback
Somente API do administrador autenticado com sessão, proteção CSRF e limite de consultas. Não grava histórico de posições, não retorna chave TomTom nem disponibiliza rotas de terceiros. A API principal de navegação **não é alterada**.
Branch de backup disponível: `backup/vanu-before-admin-eta-console-20261020` (para retorno à versão sem console); para retorno ao início da atual rodada, usar o commit pré-integração obtido a partir do log Git.
