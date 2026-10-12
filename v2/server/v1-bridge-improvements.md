# Motor V1 → V2: integração por etapas

A V2 usa `VANO_V1_API_URL` para solicitar alternativas do serviço Python V1. Isso permite preservar os algoritmos de micro-rotas **sem prometer uma conversão inexistente para JavaScript**. A biblioteca `server/v1-bridge.mjs` mantém o histórico de `source`, `microRoute` e `etaGainSeconds` somente quando a V1 os retorna; fallback Mapbox é rotulado como tal. Uma migração futura exige testes de contrato com o `vano/routes/routing.py`, migração de banco e equivalência de tráfego/radares/safety/OSINT. Sem essas condições, o motor antigo continua necessário.
