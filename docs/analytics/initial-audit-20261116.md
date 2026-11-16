> Registro histórico da auditoria antes da retomada do login. Para o estado atual, consulte [implementation-status-20261116.md](implementation-status-20261116.md).

# Auditoria inicial — Analytics Android — 2026-11-16

Status: execução parcial, bloqueada pela autenticação Google expirada. Nenhum SDK integrado, projeto Firebase criado, exportação ativada ou AAB gerado/publicado.

## Produção verificada
- Repositório: miguel027dev/vano.
- Render: Miguel's workspace, serviço vanu (srv-db67qjss728c73fg5amg).
- Branch configurada: preview/vano-react-v2-7; autoDeploy desativado.
- Deploy confirmado live na consulta inicial: dep-dbtc45m1egvs73a6oto0.
- Commit: d1e7b2a7ad7da707fa5117bad9afe04bd392102a.
- Runtime real: Node, v2/server/index.mjs. Build: cd v2 && npm install --no-audit --no-fund && npm test && npm run build.
- Branch isolada: feat/analytics-firebase-20261116, criada desse commit.
- Revalidar HEAD remoto e deploy antes de integração: há trabalho recente em paralelo.

## Repositórios Android
- vano_android/main: protótipo Kotlin/Compose/MapLibre. applicationId com.vano.nativeapp, versionCode 1, versionName 0.1-test, minSdk 26, target/compile 36. Não corresponde ao pacote solicitado.
- vano.maps: metadados informam size 0; não foi identificada fonte Android nesse repositório.
- vano/android-vanu: WebView Java, applicationId com.vano.maps, namespace com.vano.maps.fluidez, minSdk 24, target/compile 36, AGP 8.7.3, Java 17, androidx.webkit 1.12.1.
- Nesse commit: versionCode 20270006, versionName 3.1.5; WebView carrega https://vanu-73xu.onrender.com/mapa.
- README diverge em pacote e SDK. Existe branch fix/android-system-bars-3.1.7, commit 1b8d7344535eee2db55bda412dc0ef0eaa12c3d3. Não é seguro escolher o próximo versionCode antes de consultar todos os tracks da Play.
- Release espera VANO_UPLOAD_KEYSTORE e VANO_UPLOAD_PASSWORD_FILE; alias vano-maps-upload. Chave/certificado não foram verificados nem divulgados.
- Workflow android-candidate.yml compila android-webview e publica APK de teste; não prova a origem do AAB publicado.

## Ponte WebView existente
VanoHost usa WebViewCompat.addWebMessageListener, origem HTTPS exata e validação de mainFrame; há fallback onJsPrompt com ações permitidas. Não foi adicionada interface JavaScript nem alterada navegação.
Futura instrumentação deve usar allowlist separada de eventos/parâmetros, limites de payload e consentimento; jamais coordenadas, URLs com query, destinos ou texto livre.
Firebase deve ser a única fonte dos eventos automáticos Android; não reenviar first_open/session_start pela camada web.

## Observabilidade existente
- v2/server/retention.mjs: pulsos em primeiro plano; sessões observadas para contas autenticadas; dias ativos limitados a 120; coortes D1/D7/D30.
- firstOpenAt existente significa primeira abertura medida após implantação, não instalação e não necessariamente primeiro uso do app.
- Endpoints admin de retenção e Intelligence já existem; preservar autorização e CSRF.
- v2/server/intelligence.mjs registra decisões de rota, latência e falhas, limitado a 2.500 registros/30 dias.
- Navigation outcomes exigem consentimento explícito.
- Não foram identificadas dependências Firebase no Gradle auditado.
- Esses mecanismos não equivalem a instalações/desinstalações oficiais, Crashlytics ou exportação GA4.

## Validação executada
Comando: node --test v2/server/retention.test.mjs v2/server/intelligence.test.mjs
Resultado: 7 testes aprovados, 0 falhas.
São verificações de baseline dos módulos existentes, não validação de nova integração.
Não executados: build Android/release, DebugView, crash controlado, medição em aparelho, comparação visual, assinatura ou upload Play.
Arquivos funcionais, interface, mapas, GPS, câmera, veículo e algoritmos não foram modificados nesta etapa.

## Bloqueios e continuação
1. Autenticar a conta autorizada no navegador compartilhado; sessão Google expirou por inatividade.
2. Conferir Firebase/GA4 existentes antes de criar recursos; verificar consentimento e política em vigor.
3. Consultar Play Console: AAB ativo, maior versionCode em todos os tracks, certificado de upload e origem exata do código.
4. Só então integrar SDKs oficiais e validar dependências atuais na documentação oficial.
5. Exportação BigQuery requer confirmar projeto, região, permissões, modo de exportação, faturamento e limites antes de qualquer custo.
6. Sistema de baixa latência deve ter ingestão autenticada, validação estrita, fila durável, deduplicação persistente, retentativas limitadas, TTL, agregados e métricas de rejeição. Não usar memória de uma instância como garantia de entrega.
7. Instalações oficiais vêm da Play; Analytics mede primeira abertura. Não prometer entrega instantânea de todos os eventos GA4.
8. Publicação permanece condicionada aos testes críticos e autorização final do usuário.

Sem mudanças em produção, novos custos ou publicação nesta etapa.
