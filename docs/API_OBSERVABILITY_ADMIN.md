# VANO Control Center — observabilidade de APIs

A página autenticada em /admin/apis contém duas abas:
- **APIs consumidas**: tráfego HTTP de serviços externos chamado pelo backend.
- **APIs de parceiros**: requisições identificadas após autenticação da chave de cada parceiro.

A API interna GET /api/admin/apis/stats?range=24h (opções: 24h, 7d, 30d)
é restrita a administradores e lê a tabela existente request_activity_logs.
Não se cria telemetria sintética, nem se exportam chaves ou URLs com dados sensíveis.

## Provedores

A função metered_request instrumenta tentativas HTTP reais, incluindo erros,
429 e timeouts. Cada tentativa de retry é cobrada como uma chamada distinta
**somente em termos de contagem**; taxas financeiras dependem do contrato
com o provedor. Chamadas atendidas pelo cache não entram na contagem.
No momento, estão instrumentadas chamadas de Mapbox no backend, Open-Meteo,
Overpass, ViaCEP, BrasilAPI, OpenRouteService e OSRM onde essas integrações
passam pelos métodos alterados.

**Cobertura parcial importante**: solicitações ao Mapbox GL JS feitas diretamente
pelo navegador/app não passam pelo backend, então não constam aqui.
O consumo total precisa ser conciliado com os medidores oficiais do Mapbox.
Jobs e buscas de CEP executadas em workers sem contexto Flask são contabilizados
como eventos anônimos na mesma fila limitada de observabilidade. Sem amostra não quer dizer offline, e resposta HTTP correta
não garante qualidade semântica, atualização ou precisão dos dados de mapa.

## Identidade autenticada de parceiro

Não se deve identificar um parceiro por IP, Referer, domínio de origem ou
cabeçalho informado pela aplicação cliente. No middleware **após verificar a
credencial no banco**, defina o atributo de contexto de requisição:

    g.vano_authenticated_partner_id = str(partner["id"])

O after_request em vano/routes/api_observability.py conta somente identidades
server-side verificadas e chamadas cujos caminhos começam por /v1/ ou
/api/partner/. Se o middleware da API de parceiros usar outros caminhos,
ajustar o filtro de forma explícita. A branch main consultada ao criar o
recurso ainda não expunha uma camada completa de chaves de parceiros;
até conectá-la, a aba indica ausência de métricas por parceiro.

Registrar separadamente, se possível, chave/serviço com identificador
**não secreto**, produto/endpoint, plano, limite, cache hit e alertas de quota.
Nunca registrar tokens, consultas de endereço, coordenadas precisas ou payloads.

## Custo estimado (opcional)

Configurar VANO_API_TARIFFS_JSON no servidor com taxas definidas pelo
contrato, em BRL por 1.000 chamadas, por exemplo:

    {"providers":{"mapbox":0.50},"partners":{"parceiro_123":1.50}}

**Os números acima são somente um exemplo de formato; não são preços oficiais.**
Sem taxa configurada, a coluna mostra um traço, não R$ 0.
Com taxa, a coluna é uma **estimativa**, nunca uma fatura.

## Integridade e operação

O limite de leitura por janela é 50.000 linhas; acima disso, a API sinaliza
truncamento e os totais mostrados são parciais. Para grandes volumes,
migrar gradualmente para agregados persistidos por hora e contadores
de faturamento transacionais para evitar perdas da fila de audit log.
A escrita é fail-open: uma falha de telemetria não deve quebrar rotas.
A retenção segue a configuração de logs de atividade existente.

As requisições de cliente de parceiros e as respostas não são inspecionadas:
apenas quantidade de bytes e status HTTP quando disponíveis.
Testar em homologação antes de fundir a branch e confirmar que a configuração
de auto-deploy do Render aponta para a branch esperada.
