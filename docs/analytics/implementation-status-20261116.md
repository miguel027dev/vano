# VANO Maps — instrumentação Android e observabilidade

**Situação: implementação em branches isoladas; coleta nova desativada; release bloqueado. Não há novo AAB assinado, deploy nem publicação.**

## Fontes e bases verificadas

| Componente | Base utilizada |
|---|---|
| Web/backend | `miguel027dev/vano`, produção `preview/vano-react-v2-7`, commit `d1e7b2a7ad7da707fa5117bad9afe04bd392102a` |
| Render | Serviço `vanu`, `srv-db67qjss728c73fg5amg`, Miguel's workspace; deploy observado `dep-dbtc45m1egvs73a6oto0` com status live |
| Branch web desta missão | `feat/analytics-firebase-20261116` |
| Android publicado | Play Console confirma **3.1.7 / 20270008**, produção, lançamento completo |
| Base Android correspondente à versão | `fix/android-system-bars-3.1.7`, commit `1b8d7344535eee2db55bda412dc0ef0eaa12c3d3`, pasta `android-vanu` |
| Branch Android desta missão | `feat/android-analytics-3.1.8-20261116` |
| Candidato no código | **3.1.8 / 20270009**, pacote `com.vano.maps`; não assinado para publicação |

A versão Android na branch web de produção ainda declara 3.1.5. Usar essa pasta para gerar a atualização perderia mudanças posteriores do aplicativo. Por isso os trabalhos estão separados. **Não mesclar a árvore web antiga da branch Android na produção web.** A correspondência de versão foi confirmada; ainda falta comparar o artefato original e o certificado de upload.

`vano_android/main` é um protótipo Kotlin/Compose/MapLibre (`com.vano.nativeapp`, 0.1-test/1), não o app publicado. `vano.maps` aparece com tamanho zero e não forneceu fonte Android identificável.

O app publicado usa WebView Java, Java 17, AGP 8.7.3, compile/target 36, minSdk 24, AndroidX WebKit 1.12.1. A página é carregada de `https://vanu-73xu.onrender.com/mapa`. O release existente espera a chave por `VANO_UPLOAD_KEYSTORE`, senha por arquivo `VANO_UPLOAD_PASSWORD_FILE` e alias `vano-maps-upload`. Chave e certificado não foram obtidos nem substituídos.

## Firebase, GA4 e Google Play: estado observado

Conta verificada nas duas plataformas: `miguelpinxs@gmail.com`. Nenhum projeto ou conta duplicada foi criado.

| Recurso | Evidência e estado real |
|---|---|
| Firebase | Projeto existente `vano-maps`, número `194011733049`, plano Spark |
| Android Firebase | `com.vano.maps`, app ID `1:194011733049:android:8256905680c01f9d8b81e8` |
| GA4 | Já ativado e vinculado; conta `241580348`, propriedade `564452827` |
| DebugView | A interface do GA4 retorna **Permissões ausentes** para a conta autorizada; eventos de teste não foram validados |
| Crashlytics | Console ainda oferece **Adicione o SDK**; nenhum crash real ou não fatal desta implementação foi recebido e confirmado |
| Google Play | Integração Firebase já informa um app vinculado; 3.1.7/20270008 está disponível no Google Play |
| Android vitals | Taxas de crash, ANR e inicialização a frio aparecem como dados indisponíveis; isso não significa zero falhas |
| Aquisição Play | Painel observado nos últimos 28 dias: 12 aquisições de dispositivos, 7 primeiros acessos por dispositivo e 9 dispositivos ativos mensais; métricas distintas, não um único total de instalações |

Links verificados:

- [Firebase — app Android](https://console.firebase.google.com/project/vano-maps/settings/general/android:com.vano.maps)
- [BigQuery — integração Firebase](https://console.firebase.google.com/project/vano-maps/settings/integrations/bigquery)
- [Crashlytics](https://console.firebase.google.com/project/vano-maps/crashlytics/app/android:com.vano.maps/issues)
- [Play — versões](https://play.google.com/console/u/0/developers/5802082395047112614/app/4973938782528627436/releases/overview)
- [Play — Segurança dos dados](https://play.google.com/console/u/0/developers/5802082395047112614/app/4973938782528627436/app-content/data-privacy-security)

O download do `google-services.json` pelo console não produziu arquivo acessível neste ambiente, apesar das tentativas pela página de configurações e pelo assistente oficial. Nenhum arquivo de configuração real foi inventado. A compilação usou exclusivamente uma configuração fictícia descartável, incapaz de validar recebimento no projeto real.

## BigQuery e custos

A integração já existe em modo Sandbox, região `southamerica-east1`:

- Analytics: exportação diária marcada; streaming desligado; identificadores publicitários excluídos; **dataset ainda não criado**.
- Crashlytics e sessões: exportação marcada; datasets `firebase_crashlytics` e `firebase_sessions`; TTL exibido de 60 dias; streaming desligado.
- Exportação de Performance Monitoring: desligada.

O console informa limite cumulativo de 10 GiB no sandbox e necessidade de upgrade para streaming. Nenhum faturamento, plano pago, permissão nova ou exportação contínua foi ativado. A exportação diária não oferece eventos de todos os usuários em segundos. Ainda é necessário confirmar recebimento efetivo e quotas no projeto, além do acesso GA4.

O pipeline próprio usa o PostgreSQL existente somente após `VANO_ANALYTICS_ENABLED=1`: pool limitado a duas conexões, até 100 mil eventos brutos, TTL de 30 dias e agregados até 120 dias. A capacidade é uma proteção operacional; ao atingi-la, novas admissões recebem 429 e não há cobrança automática ou expansão de infraestrutura.

## Implementação Android

- SDKs oficiais: BoM 35.2.0, Analytics, Crashlytics, Performance; plugins Google Services 4.6.0 e Crashlytics 3.0.8.
- Inicialização Firebase automática removida. A inicialização manual aguarda consentimento da conta atual; não herda silenciosamente a autorização de outra conta.
- Analytics, relatórios de falhas e Performance iniciam desativados. Publicidade, personalização de anúncios, Advertising ID e SSAID não são habilitados.
- Ponte usa exclusivamente o `VanoHost` existente com origem HTTPS exata e validação de frame principal. As novas ações não foram adicionadas ao fallback `onJsPrompt`, que não comprova o frame principal.
- Nenhum `addJavascriptInterface`, permissão de localização adicional ou nova interface visual.
- Allowlist de eventos, parâmetros numéricos limitados, códigos de erro fixos, 60 eventos/minuto e deduplicação limitada em memória. Não são enviados URLs, mensagens livres de provedores, e-mail, nome, coordenadas ou geometria de rotas.
- Falhas não fatais de mapa/navegação são registradas com exceção sintética e código fixo. Exceções nativas capturadas pelo SDK ainda exigem revisão prática dos relatórios e das declarações de privacidade.
- `verifyAnalyticsRelease` impede gerar release com configuração fictícia, projeto/app diferentes ou sem material original de assinatura.

O manifesto mesclado contém as permissões normais dos SDKs `WAKE_LOCK` e `BIND_GET_INSTALL_REFERRER_SERVICE`, além das já existentes e da proteção privada de receiver AndroidX. AD_ID e permissões AdServices foram removidas. Não foi adicionado prompt de permissão em tempo de execução.

## Eventos e limites de interpretação

| Evento/métrica | Implementação e cobertura |
|---|---|
| Primeira abertura, sessões, engajamento, versão e SO | Delegados aos eventos automáticos do Firebase; não recriados na ponte. Dependem de configuração real, consentimento e validação em aparelho |
| `route_requested`, `route_calculation_started` | Observação de chamadas reais a `/route`, incluindo cálculos de prévia e outros consumidores desse endpoint |
| `route_calculation_completed`, `route_calculation_failed` | Resposta ou falha observada da chamada, com duração; mede espera do cliente, não apenas CPU do servidor |
| `navigation_started` | Início real aceito pelo fluxo existente; simulação excluída |
| `navigation_ended` | Encerramento manual existente, duração observada e modal; não presume chegada |
| `route_recalculated` | Sucesso do recálculo de desvio observado no fluxo instrumentado |
| `navigation_error` | Falha do fluxo de recálculo instrumentado |
| `map_load_failed` | Erros durante carregamento do mapa e perda do renderer WebView; códigos sanitizados |
| `communication_failure`, `api_error` | Falhas de chamadas de rota e erros nativos do documento principal; não se afirma cobertura de toda solicitação de terceiros |
| `app_returned` | Retorno de visibilidade observado na camada web, com revalidação de consentimento |
| `route_completed`, `navigation_cancelled` | Contrato preparado, **sem produtor confiável implementado**: o fluxo atual oferece encerramento manual, sem distinguir chegada de cancelamento. Não inventamos essa classificação |
| Instalações/desinstalações oficiais | Fonte Play separada; adaptador autenticado ainda não conectado ao painel |
| Retenção | Módulo existente por contas autenticadas preservado; não equivale à retenção por instalação do Firebase |

Os timestamps novos são ISO 8601 UTC; a agregação nova usa dia UTC. A retenção anterior agrupa dias em São Paulo e não foi modificada. Primeira abertura do SDK ou primeira abertura medida após implantação não representa a hora exata de instalação.

## Pipeline próprio e VANO Intelligence

Novos endpoints, desativados por padrão:

- `GET/POST /api/observability/consent`: escolha explícita, versionada; escrita protegida por sessão e CSRF.
- `POST /api/observability/events`: sessão autenticada, consentimento, CSRF, quotas de IP/conta, lotes de até 20 eventos e payload até 16 KiB.
- `GET /api/admin/observability`: exige administrador; agregados, saúde da fila e até 100 eventos recentes sanitizados. Não foi criado dashboard novo.

PostgreSQL usa tabelas próprias em `vano_observability`, sem alterar o snapshot da aplicação. O endpoint só confirma recebimento depois de COMMIT. UUID único evita duplicação inclusive após reinício; o worker usa transações e `FOR UPDATE SKIP LOCKED`, e atualiza contador e status do evento na mesma transação.

O worker processa até 100 eventos por ciclo, inicialmente a cada dois segundos, com recuo limitado a 60 segundos após falhas. A fila do cliente tem até 100 itens em memória, seis tentativas, recuo máximo de 60 segundos e IDs preservados; reinício do processo pode perder itens ainda não aceitos. As tentativas ao backend não reenviam eventos ao SDK nativo.

Consentimento é revalidado ao retomar o app e a cada 60 segundos em primeiro plano. Falha ou desativação do endpoint desliga a nova coleta; não depende de um novo deploy Android para respeitar a revogação quando conectado. Isso não garante interrupção instantânea sem rede.

A latência projetada é a soma do lote do cliente (cinco segundos), rede e worker (dois segundos sem falhas), **não uma medição já confirmada em produção**. O endpoint diferencia sessões com evento nos últimos 60 segundos de usuários ativos. Instalações oficiais, usuários GA4 e retenção não conectados aparecem como `null`, jamais zero inventado.

## Privacidade e Segurança dos dados

As declarações atuais da Play selecionam zero tipos em Atividade em apps (0/5), Informações/desempenho do app (0/3) e Identificadores do dispositivo/outros IDs (0/1). Precisam ser revisadas antes de ativar os SDKs para usuários. Não foi salvo rascunho nem submetida declaração nova.

A política atual também não detalha os novos SDKs, finalidade, retenção e transferência. A missão proíbe mudanças perceptíveis na interface; por isso não foi inserido banner, botão ou controle novo. **Não existe ainda um fluxo aprovado para obter a escolha de coleta opcional. A coleta permanece desligada.** Qualquer tratamento por outra base legal precisa de avaliação própria; consentimento não é apresentado aqui como exigência universal da LGPD.

## Testes e evidência

| Verificação | Resultado |
|---|---|
| Suíte web final | 1.202 aprovados; zero falhas; uma integração PostgreSQL nativa ignorada por falta de banco local de teste |
| Build web/SEO | Aprovado; aviso de chunk grande já existente, sem alterar divisão do app |
| Teste SQL PostgreSQL/WASM | Aprovou deduplicação no lote e após recriar worker, agregação única, sanitização e TTL de 30 dias; lock consultivo foi simulado, não valida concorrência PostgreSQL completa |
| CI PostgreSQL nativo | Workflow preparado com PostgreSQL 16 descartável; resultado do CI deve ser consultado no PR |
| Android debug | `assembleDebug` aprovado com configuração fictícia; não valida Firebase real |
| Testes Java | Dois aprovados, zero falhas, para a política de filtragem |
| Android lint | **Falha: 12 erros NewApi já reproduzidos na base 3.1.7.** Mesmos 12 erros no candidato; oito avisos contra sete na base, pois uma dependência adiciona detector sobre chamada de drawable já existente |
| Proteção de release | Rejeitou corretamente o projeto fictício de compilação |
| Compatibilidade estática 16 KiB | `zipalign -P 16` e alinhamentos ELF LOAD de 16.384 bytes aprovados para as quatro ABIs incluídas |
| Tamanho debug comparável | Base: 1.236.743 bytes; candidato: 8.093.053 bytes. Não representa tamanho final de download/AAB nem consumo de RAM |
| DebugView/crash controlado/sessões reais | Não validados: acesso GA4 ausente, configuração real indisponível e nenhum aparelho conectado |
| Inicialização, RAM, bateria, GPS em estrada e comparação visual | Pendentes em dispositivo; não são certificados pelos testes de código |

CSS, JSX renderizado, assets de mapa/veículo, recursos visuais Android e algoritmos de GPS/câmera/roteamento não foram alterados. Nos componentes web existem apenas importações e chamadas observacionais; na Activity as adições são coleta condicionada e encaminhamento de erros. Essa revisão de diff é evidência de escopo preservado, **não substitui comparação funcional/visual no aparelho**. Os erros de estilos existentes não foram ocultados nem corrigidos nesta missão.

## Arquivos principais

Web: `v2/server/analytics-{events,http,queue,runtime}.mjs`, testes associados, `v2/server/index.mjs`, `v2/src/lib/{analytics,telemetryClient}.mjs`, `v2/src/lib/api.js`, hooks observacionais em `App.jsx`, `MapPage.jsx`, `VanoMap.jsx`, e `.github/workflows/analytics-validation.yml`.

Android: Gradle raiz/app, manifesto, `.gitignore`, `AnalyticsTelemetry.java`, `TelemetryPolicy.java`, `TelemetryPolicyTest.java` e chamadas na `MainActivity.java`.

## Bloqueios para concluir e publicar

1. Restaurar o acesso de `miguelpinxs@gmail.com` à propriedade GA4 **564452827**, pelo administrador autorizado. Não criar outra propriedade equivalente.
2. Obter o `google-services.json` real do app já registrado e manter sua configuração local/CI fora dos commits.
3. Disponibilizar a chave original e o arquivo de senha no computador autorizado. O dispositivo Desktop Commander `miguel` está offline; não pedir senha ou chave em texto no chat.
4. Aprovar e implementar a transparência e o mecanismo de escolha de coleta; revisar as declarações Play. Sem isso, manter todos os novos coletores desativados.
5. Resolver os erros de lint anteriores sem regressão visual; validar base e candidato em aparelho, DebugView, Crashlytics, sessões, duplicidade, inicialização, memória e GPS/rotas.
6. Definir fonte confiável de conclusão/cancelamento e concluir os adaptadores oficiais de instalações, desinstalações e aquisição. Hoje a infraestrutura não consolida todas essas fontes automaticamente.
7. Gerar AAB de release com assinatura original, conferir pacote/versionCode/certificado e compatibilidade. **Somente então solicitar autorização final de publicação.**

## Procedimento de rollout e recuperação preparado

- Começar por validação interna com configuração real; exigir todos os gates críticos aprovados.
- Após autorização final, enviar o AAB e verificar processamento/revisão na Play. Não tratar upload como publicação.
- Se disponível e adequado à pequena base, iniciar rollout gradual e acompanhar crashes, ANRs, abertura, sessões e recebimento por versão. Métricas sem amostra suficiente não comprovam ausência de regressão.
- Em regressão: interromper a expansão na Play; desligar a coleta nova no backend; observar revalidação dos clientes. Não modificar rotas/GPS como reação a um problema analítico.
- Dispositivos já atualizados não voltam automaticamente para versionCode menor. Se preciso, gerar correção a partir da base preservada, usando versionCode superior e a mesma assinatura.
- Não houve monitoramento pós-publicação desta versão porque ela ainda não foi publicada.
