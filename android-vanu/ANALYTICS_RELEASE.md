# Candidato Android 3.1.8 / 20270009 — NÃO PUBLICÁVEL

Base: commit `1b8d7344535eee2db55bda412dc0ef0eaa12c3d3`, versão 3.1.7/20270008 confirmada na Play Console. Branch isolada `feat/android-analytics-3.1.8-20261116`.

Esta branch preserva os recursos e o comportamento Android da base 3.1.7. Não mesclar sua árvore web antiga na produção Node. O backend/web desta missão está separado em `feat/analytics-firebase-20261116`.

## Implementação

SDKs oficiais Analytics, Crashlytics e Performance com BoM 35.2.0. A inicialização é manual, apenas depois de consentimento da conta autenticada. Os eventos automáticos Firebase não são recriados na ponte. Publicidade e identificadores publicitários não são habilitados.

As ações `telemetry` e `telemetryConsent` usam somente o listener já existente com origem HTTPS exata e frame principal. Não entram no fallback `onJsPrompt` e não criam `addJavascriptInterface`. A política aceita somente eventos conhecidos, números limitados, modal e códigos fixos de erro; nenhum URL, nome, e-mail, coordenada ou trajeto.

## Verificações executadas

- `assembleDebug`: aprovado com **configuração fictícia local**, sem validar conexão ao Firebase real.
- `testDebugUnitTest`: dois testes aprovados.
- `lintDebug`: 12 erros NewApi, reproduzidos também na base 3.1.7; não foram suprimidos. O candidato possui um aviso adicional de detector de AppCompat sobre chamada já existente.
- Zipalign para 16 KiB e alinhamentos ELF LOAD de 16 KiB aprovados nas quatro ABIs incluídas.
- APK debug comparável: base 1.236.743 bytes, candidato 8.093.053 bytes; não representa tamanho final na Play nem RAM.
- `verifyAnalyticsRelease` rejeitou a configuração fictícia. Ela foi descartada e não consta dos commits.

## Gates de release

Faltam: `app/google-services.json` real do projeto `vano-maps`, acesso da conta autorizada à propriedade GA4 564452827, chave original e senha por arquivo, tratamento dos erros de lint, fluxo de privacidade aprovado e testes reais em dispositivo.

O certificado de upload ainda não foi comparado. Não gerar outra chave para contornar esse bloqueio. Não inserir senha, keystore ou configuração fictícia em commits.

Exemplo de validação futura, com os caminhos já configurados no ambiente autorizado:

```sh
./gradlew :app:verifyAnalyticsRelease :app:testReleaseUnitTest :app:lintRelease :app:bundleRelease
```

Isso não substitui DebugView, crash controlado, sessões/engajamento, duplicidade, tempo de inicialização, memória, GPS real e comparação visual. Performance Monitoring ainda não foi validado e não se afirma cobertura de startup anterior ao consentimento.

Não há AAB novo assinado nem publicação. Solicitar autorização final somente depois de resolver os gates e revisar o artefato real.

Relatório completo: `docs/analytics/implementation-status-20261116.md` na branch web desta missão.
