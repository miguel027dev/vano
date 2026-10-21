# Trânsito no trajeto administrativo V2

Implementação restrita a `/v2` para o administrador autenticado. O mapa público `/mapa` mantém sua apresentação.

## Fluxo implementado

1. O React solicita contexto apenas para a rota selecionada de carro ou moto. A rota enviada é reduzida a até 650 vértices, sem histórico de localização.
2. A API exige conta administrativa verificada, sessão, CSRF e limite de seis consultas por minuto. A chave TomTom permanece no servidor.
3. O gateway examina até oito pontos nos próximos oito quilômetros. Consultas têm timeout de 2,5 segundos, concorrência máxima de duas, cache de dois minutos, teto de 480 consultas de fluxo por dia por processo e pausa de dez minutos em 401/403/429. O cache de incidentes existente continua independente.
4. Geometria, ordem dos pontos, direção local, extensão e distância lateral são comparadas antes de aceitar um trecho. Pontos isolados não provam impacto na rota; casos ambíguos permanecem sem cor de trânsito.
5. A velocidade relativa ao fluxo livre determina laranja padrão, vermelho ou vermelho escuro. Sem evidência recente: laranja, sem afirmar fluxo livre. Fluxo livre não é limite legal de velocidade.
6. O gradiente acompanha a distância projetada de cada trecho, com suavização curta nas bordas. Mapbox mantém a geometria em cache com `lineMetrics`; Leaflet reproduz os intervalos no fallback.
7. Até três bolhas são mostradas, ordenadas pelo percurso e agrupadas conforme zoom e distância na tela. Interdição recebe prioridade. Eventos ultrapassados são retirados. Causas de incidentes substituem bolhas genéricas sobrepostas.
8. A seleção abre um cartão React no resumo da navegação ou acima do cartão de rota recolhido. Manobras próximas usam uma versão compacta. Temas claro/escuro, toque de 44px, teclado e movimento reduzido são contemplados.

## Atualização e limites

Atualização a cada 90 segundos e ao avançar uma janela de dois quilômetros. Troca de rota aborta a consulta anterior. Mapa inativo, aba oculta e caminhada não iniciam consultas. Evidência expira em três minutos, inclusive após perda de conexão. São amostras: trechos sem cobertura mantêm o laranja da marca, sem afirmar fluxo livre.

Os destaques internos avançam suavemente no V2 sem reconstruir a geometria: atualização Mapbox limitada a 25 quadros por segundo e offset SVG contínuo no Leaflet. Movimento reduzido mantém destaques estáticos.

ETA, cálculo de rotas, pontuação de segurança, câmera, MAVI e GPS não são alterados. Atrasos informados são explicativos, nunca somados ao ETA. Uma interdição externa é apresentada como contexto do provedor; esta entrega não acrescenta recálculo automático. Contrato ou identidade viária mais forte pode permitir cobertura adicional em uma etapa futura.

## Validação

Testes de geometria inversa, rua paralela, curvas, velocidade zero, confiança baixa, expiração, gradiente, agrupamento, duplicidade, orçamento, cache e indisponibilidade do provedor. Rodar `npm test` e `npm run build` antes do deploy. Conferir `/api/health` e a versão dos assets após o serviço ficar `live`.
