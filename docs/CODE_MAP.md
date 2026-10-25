# Mapa de código rastreado

Gerado a partir de `git ls-files` da branch de produção (814 arquivos antes da limpeza).

Este índice localiza os arquivos, agrupados por diretório. Para módulos de domínio, consulte também `ARCHITECTURE.md`. A descrição de cada arquivo é inferida pelo papel e nome, não substitui revisão de implementação.

## `./`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `.dockerignore` | Asset, recurso ou arquivo auxiliar |
| `.gitignore` | Asset, recurso ou arquivo auxiliar |
| `.python-version` | Asset, recurso ou arquivo auxiliar |
| `app.py` | Ponto de entrada: Módulo Python |
| `db_backend.py` | Módulo Python |
| `Dockerfile.vano-v2` | Asset, recurso ou arquivo auxiliar |
| `gunicorn.conf.py` | Módulo Python |
| `mobile_routes.py` | Módulo Python |
| `README.md` | Documentação |
| `render.yaml` | Asset, recurso ou arquivo auxiliar |
| `requirements-dev.txt` | Asset, recurso ou arquivo auxiliar |
| `requirements.in` | Asset, recurso ou arquivo auxiliar |
| `requirements.lock` | Asset, recurso ou arquivo auxiliar |
| `requirements.txt` | Asset, recurso ou arquivo auxiliar |
| `robots.txt` | Asset, recurso ou arquivo auxiliar |
| `sitemap.xml` | Manifesto/recurso/configuração |
| `test_vano_radars.py` | Teste de regressão: test vano radars |
| `V2_PREVIEW_BRANCH.md` | Documentação |
| `vano_ai_routing.py` | Módulo Python |
| `vano_osint_bridge.py` | Módulo Python |
| `vano_radars.py` | Módulo Python |

## `.github/workflows/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `android-candidate.yml` | Asset, recurso ou arquivo auxiliar |
| `ci.yml` | Asset, recurso ou arquivo auxiliar |
| `geosampa-wfs-staging.yml` | Asset, recurso ou arquivo auxiliar |
| `vano-radar-data.yml` | Asset, recurso ou arquivo auxiliar |
| `vano-react-v2.yml` | Asset, recurso ou arquivo auxiliar |
| `vano-v2-preview.yml` | Asset, recurso ou arquivo auxiliar |
| `vanu-live-navigation-qa.yml` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `.gitignore` | Asset, recurso ou arquivo auxiliar |
| `build.gradle` | Asset, recurso ou arquivo auxiliar |
| `gradle.properties` | Asset, recurso ou arquivo auxiliar |
| `gradlew` | Asset, recurso ou arquivo auxiliar |
| `gradlew.bat` | Asset, recurso ou arquivo auxiliar |
| `README.md` | Documentação |
| `settings.gradle` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/app/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `build.gradle` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/app/src/main/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `AndroidManifest.xml` | Manifesto/recurso/configuração |

## `android-vanu/app/src/main/assets/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `native-audio.js` | Utilitário ou configuração JavaScript |
| `shell.js` | Utilitário ou configuração JavaScript |

## `android-vanu/app/src/main/java/com/vano/maps/fluidez/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `LocalVoice.java` | Asset, recurso ou arquivo auxiliar |
| `MainActivity.java` | Asset, recurso ou arquivo auxiliar |
| `NativeSpeech.java` | Asset, recurso ou arquivo auxiliar |
| `OfflineCache.java` | Asset, recurso ou arquivo auxiliar |
| `TileCorridor.java` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/app/src/main/res/drawable/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `ic_vano.png` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/app/src/main/res/values/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `styles.xml` | Manifesto/recurso/configuração |

## `android-vanu/app/src/main/res/values-v27/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `styles.xml` | Manifesto/recurso/configuração |

## `android-vanu/app/src/main/res/values-v31/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `styles.xml` | Manifesto/recurso/configuração |

## `android-vanu/gradle/wrapper/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `gradle-wrapper.jar` | Asset, recurso ou arquivo auxiliar |
| `gradle-wrapper.properties` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/tests/offline-cache/android/content/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `Context.java` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/tests/offline-cache/android/net/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `Uri.java` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/tests/offline-cache/android/webkit/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `WebResourceRequest.java` | Asset, recurso ou arquivo auxiliar |
| `WebResourceResponse.java` | Asset, recurso ou arquivo auxiliar |

## `android-vanu/tests/offline-cache/com/vano/maps/fluidez/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `OfflineCacheTest.java` | Asset, recurso ou arquivo auxiliar |
| `TileCorridorTest.java` | Asset, recurso ou arquivo auxiliar |

## `android-webview/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `.gitignore` | Asset, recurso ou arquivo auxiliar |
| `AndroidManifest.xml` | Manifesto/recurso/configuração |
| `build.sh` | Script shell |
| `README.md` | Documentação |

## `android-webview/res/drawable/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `ic_vano.png` | Asset, recurso ou arquivo auxiliar |

## `android-webview/res/values/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `styles.xml` | Manifesto/recurso/configuração |

## `android-webview/src/com/vano/maps/fluidez/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `MainActivity.java` | Asset, recurso ou arquivo auxiliar |

## `cloudflare/safe-routing/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `quota.sql` | SQL |
| `README.md` | Documentação |
| `worker.mjs` | Módulo JavaScript/Node ou testes |
| `worker.test.mjs` | Teste de regressão: worker.test |
| `wrangler.toml` | Asset, recurso ou arquivo auxiliar |

## `docs/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `ANDROID_FLUIDITY_PLAN.md` | Documentação |
| `LAUNCH_CORRECTIONS.md` | Documentação |
| `THEME_CONTROLS_2026.md` | Documentação |
| `VANO_MOTION_SYSTEM_BLUEPRINT.md` | Documentação |
| `VANO_UX_RECONSTRUCTION_PLAN_2026.md` | Documentação |
| `VOICE_ASSISTANT_INTEGRATION.md` | Documentação |

## `static/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `auth-city-route-vano.webp` | Asset, recurso ou arquivo auxiliar |
| `auth-entry.js` | Utilitário ou configuração JavaScript |
| `manifest.webmanifest` | Asset, recurso ou arquivo auxiliar |
| `vano-access.js` | Utilitário ou configuração JavaScript |
| `vano-admin-experience.js` | Utilitário ou configuração JavaScript |
| `vano-admin-finance.js` | Utilitário ou configuração JavaScript |
| `vano-admin-infrastructure.js` | Utilitário ou configuração JavaScript |
| `vano-admin-node.js` | Utilitário ou configuração JavaScript |
| `vano-admin-reset.js` | Utilitário ou configuração JavaScript |
| `vano-admob-search.js` | Utilitário ou configuração JavaScript |
| `vano-android-nav-layout.js` | Utilitário ou configuração JavaScript |
| `vano-auth-startup.js` | Utilitário ou configuração JavaScript |
| `vano-benchmark-admin.js` | Utilitário ou configuração JavaScript |
| `vano-benchmark.js` | Utilitário ou configuração JavaScript |
| `vano-brand-icon.png` | Asset, recurso ou arquivo auxiliar |
| `vano-entry-day-mobile.svg` | Asset, recurso ou arquivo auxiliar |
| `vano-entry-day.svg` | Asset, recurso ou arquivo auxiliar |
| `vano-experience.js` | Utilitário ou configuração JavaScript |
| `vano-foundation.css` | Estilos |
| `vano-i18n.js` | Utilitário ou configuração JavaScript |
| `vano-inapp-auth.js` | Utilitário ou configuração JavaScript |
| `vano-login-startup.js` | Utilitário ou configuração JavaScript |
| `vano-map-fallback.js` | Utilitário ou configuração JavaScript |
| `vano-map.js` | Utilitário ou configuração JavaScript |
| `vano-maps-banner-dark.png` | Asset, recurso ou arquivo auxiliar |
| `vano-maps-banner.png` | Asset, recurso ou arquivo auxiliar |
| `vano-maps-icon-192.png` | Asset, recurso ou arquivo auxiliar |
| `vano-maps-icon-512.png` | Asset, recurso ou arquivo auxiliar |
| `vano-maps-icon-64.png` | Asset, recurso ou arquivo auxiliar |
| `vano-nearby-cars.js` | Utilitário ou configuração JavaScript |
| `vano-nearby-users.js` | Utilitário ou configuração JavaScript |
| `vano-onboarding.js` | Utilitário ou configuração JavaScript |
| `vano-profile.js` | Utilitário ou configuração JavaScript |
| `vano-public-refresh.js` | Utilitário ou configuração JavaScript |
| `vano-routine.js` | Utilitário ou configuração JavaScript |
| `vano-runtime.css` | Estilos |
| `vano-runtime.js` | Utilitário ou configuração JavaScript |
| `vano-shared-links.js` | Utilitário ou configuração JavaScript |
| `vano-sw.js` | Utilitário ou configuração JavaScript |
| `vano-telemetry.js` | Utilitário ou configuração JavaScript |
| `vano-theme.js` | Utilitário ou configuração JavaScript |
| `vano-ui.js` | Utilitário ou configuração JavaScript |
| `vano-v2.css` | Estilos |
| `vano-v2.js` | Utilitário ou configuração JavaScript |
| `vano.css` | Estilos |

## `static/icons/vano/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `alert-accident-premium.png` | Asset, recurso ou arquivo auxiliar |
| `alert-broken-signal.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-construction.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-crowd.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-flood.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-generic.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-hazard.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-light.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-object-road.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-pothole.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-robbery-premium.png` | Asset, recurso ou arquivo auxiliar |
| `alert-security.svg` | Asset, recurso ou arquivo auxiliar |
| `alert-stopped-vehicle.svg` | Asset, recurso ou arquivo auxiliar |
| `destination.svg` | Asset, recurso ou arquivo auxiliar |
| `nearby-car-graphite.png` | Asset, recurso ou arquivo auxiliar |
| `nearby-car-midnight.png` | Asset, recurso ou arquivo auxiliar |
| `nearby-car-silver.png` | Asset, recurso ou arquivo auxiliar |
| `road-sign.svg` | Asset, recurso ou arquivo auxiliar |
| `speed-camera.svg` | Asset, recurso ou arquivo auxiliar |
| `stop-sign.svg` | Asset, recurso ou arquivo auxiliar |
| `traffic-signal.svg` | Asset, recurso ou arquivo auxiliar |
| `traffic.svg` | Asset, recurso ou arquivo auxiliar |
| `user-puck.svg` | Asset, recurso ou arquivo auxiliar |
| `yield-sign.svg` | Asset, recurso ou arquivo auxiliar |

## `static/icons/vano/reports/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `report-police.png` | Asset, recurso ou arquivo auxiliar |
| `report-radar.png` | Asset, recurso ou arquivo auxiliar |
| `report-roadblock.png` | Asset, recurso ou arquivo auxiliar |
| `report-traffic.png` | Asset, recurso ou arquivo auxiliar |

## `static/mapbox/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `vano-dark-3d.json` | Configuração/dados |
| `vano-light-3d.json` | Configuração/dados |

## `static/voices/vano/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `chegou_ao_destino.mp3` | Asset, recurso ou arquivo auxiliar |
| `continue_em_frente.mp3` | Asset, recurso ou arquivo auxiliar |
| `destino_a_esquerda.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_1_km.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_200_metros.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_2_km.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_300_metros.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_500_metros.mp3` | Asset, recurso ou arquivo auxiliar |
| `em_50_metros.mp3` | Asset, recurso ou arquivo auxiliar |
| `faca_retorno.mp3` | Asset, recurso ou arquivo auxiliar |
| `leve_curva_a_direita.mp3` | Asset, recurso ou arquivo auxiliar |
| `leve_curva_a_esquerda.mp3` | Asset, recurso ou arquivo auxiliar |
| `mantenha_a_direita.mp3` | Asset, recurso ou arquivo auxiliar |
| `mantenha_a_esquerda.mp3` | Asset, recurso ou arquivo auxiliar |
| `mantenha_se_a_direita.mp3` | Asset, recurso ou arquivo auxiliar |
| `siga_em_frente.mp3` | Asset, recurso ou arquivo auxiliar |
| `vire_a_direita.mp3` | Asset, recurso ou arquivo auxiliar |

## `templates/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `_performance_probe.html` | Template/HTML |
| `_seo_links.html` | Template/HTML |
| `_theme_boot.html` | Template/HTML |
| `_theme_icon.html` | Template/HTML |
| `about.html` | Template/HTML |
| `account_delete_page.html` | Template/HTML |
| `acessar.html` | Template/HTML |
| `admin.html` | Template/HTML |
| `admin_analytics.html` | Template/HTML |
| `admin_audit.html` | Template/HTML |
| `admin_benchmark.html` | Template/HTML |
| `admin_beta.html` | Template/HTML |
| `admin_finance.html` | Template/HTML |
| `admin_privacy.html` | Template/HTML |
| `admin_reports.html` | Template/HTML |
| `admin_risk_zones.html` | Template/HTML |
| `admin_server_detail.html` | Template/HTML |
| `admin_users.html` | Template/HTML |
| `alerts.html` | Template/HTML |
| `base.html` | Template/HTML |
| `benchmark_de_rotas.html` | Template/HTML |
| `beta.html` | Template/HTML |
| `contact.html` | Template/HTML |
| `error.html` | Template/HTML |
| `family_invite.html` | Template/HTML |
| `forgot_password.html` | Template/HTML |
| `help.html` | Template/HTML |
| `index.html` | Template/HTML |
| `live_trip.html` | Template/HTML |
| `login.html` | Template/HTML |
| `notifications.html` | Template/HTML |
| `onboarding.html` | Template/HTML |
| `press.html` | Template/HTML |
| `privacy_policy.html` | Template/HTML |
| `profile.html` | Template/HTML |
| `register.html` | Template/HTML |
| `report.html` | Template/HTML |
| `reset_password.html` | Template/HTML |
| `seo_alternativa_google_maps.html` | Template/HTML |
| `seo_alternativa_waze.html` | Template/HTML |
| `seo_evitar_transito.html` | Template/HTML |
| `seo_gps_moto.html` | Template/HTML |
| `seo_o_que_e_vano.html` | Template/HTML |
| `seo_rota_mais_rapida.html` | Template/HTML |
| `shared_route.html` | Template/HTML |
| `sobre.html` | Template/HTML |
| `terms_of_use.html` | Template/HTML |

## `tests/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `guest_route_controls.cjs` | Script/teste CommonJS |
| `map_fluidity_behavior.cjs` | Script/teste CommonJS |
| `onboarding_continue.cjs` | Script/teste CommonJS |
| `routine_validation_behavior.cjs` | Script/teste CommonJS |
| `search_latency_behavior.cjs` | Script/teste CommonJS |
| `service_worker_latency.cjs` | Script/teste CommonJS |
| `test_admin_analytics.py` | Teste de regressão: test admin analytics |
| `test_android_navfix_2026.py` | Teste de regressão: test android navfix 2026 |
| `test_database_checkout_latency.py` | Teste de regressão: test database checkout latency |
| `test_desktop_request_latency.py` | Teste de regressão: test desktop request latency |
| `test_frontend_performance.py` | Teste de regressão: test frontend performance |
| `test_launch_audit_security.py` | Teste de regressão: test launch audit security |
| `test_map_fluidity_behavior.py` | Teste de regressão: test map fluidity behavior |
| `test_mobile_oauth_exchange.py` | Teste de regressão: test mobile oauth exchange |
| `test_navigation_motion_v400.py` | Teste de regressão: test navigation motion v400 |
| `test_onboarding_continue.py` | Teste de regressão: test onboarding continue |
| `test_public_pages_navigation_2026.py` | Teste de regressão: test public pages navigation 2026 |
| `test_public_refresh_2026.py` | Teste de regressão: test public refresh 2026 |
| `test_quality_security_v500.py` | Teste de regressão: test quality security v500 |
| `test_rate_limit_postgres.py` | Teste de regressão: test rate limit postgres |
| `test_repository_smoke.py` | Teste de regressão: test repository smoke |
| `test_responsive_contract_v520.py` | Teste de regressão: test responsive contract v520 |
| `test_responsive_hardening_v521.py` | Teste de regressão: test responsive hardening v521 |
| `test_route_cta_regression.py` | Teste de regressão: test route cta regression |
| `test_search_latency.py` | Teste de regressão: test search latency |
| `test_security_hardening_v400.py` | Teste de regressão: test security hardening v400 |
| `test_seo_discovery.py` | Teste de regressão: test seo discovery |
| `test_single_use_postgres.py` | Teste de regressão: test single use postgres |
| `test_stabilization_security_guest.py` | Teste de regressão: test stabilization security guest |
| `test_startup_beta.py` | Teste de regressão: test startup beta |
| `test_theme_controls.py` | Teste de regressão: test theme controls |
| `test_ux_reconstruction.py` | Teste de regressão: test ux reconstruction |
| `test_voice_offline_first.py` | Teste de regressão: test voice offline first |
| `test_web_load_performance_2026.py` | Teste de regressão: test web load performance 2026 |
| `theme_controls.cjs` | Script/teste CommonJS |
| `ux_lifecycle_contract.cjs` | Script/teste CommonJS |

## `v2/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `.gitignore` | Asset, recurso ou arquivo auxiliar |
| `ANDROID_AUDIO_3_1_4.md` | Documentação |
| `ANDROID_RELEASE_3_1_3.md` | Documentação |
| `HOTFIX_GPS_V2_1.md` | Documentação |
| `index.html` | Template/HTML |
| `iniciar-linux.sh` | Script shell |
| `iniciar-v2-https.sh` | Script shell |
| `iniciar-v2.sh` | Script shell |
| `package-lock.json` | Configuração/dados |
| `package.json` | Configuração/dados |
| `README.md` | Documentação |
| `RENDER_STAGING_V2.md` | Documentação |
| `SECURITY_RELEASE_NOTES.md` | Documentação |
| `STAGING_BRANCH_README.md` | Documentação |
| `V2_3_NOTAS.md` | Documentação |
| `V2_4_RELEASE_NOTES.md` | Documentação |
| `V2_5_RELEASE_NOTES.md` | Documentação |
| `V2_7_LOCALES.md` | Documentação |
| `V2_8_NAVEGACAO_GOOGLE.md` | Documentação |
| `V2_9_POLIMENTO.md` | Documentação |
| `V2_RELEASE_NOTES.md` | Documentação |
| `vite.config.js` | Utilitário ou configuração JavaScript |

## `v2/.github/workflows/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `security.yml` | Asset, recurso ou arquivo auxiliar |

## `v2/data/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `radars-br.json` | Configuração/dados |

## `v2/deploy/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `Caddyfile.example` | Asset, recurso ou arquivo auxiliar |
| `GOOGLE_LOGIN_SETUP.md` | Documentação |
| `production.env.example` | Asset, recurso ou arquivo auxiliar |
| `vano.service.example` | Asset, recurso ou arquivo auxiliar |
| `VANO_V3_BRIEFING.md` | Documentação |

## `v2/design/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `BRIEFING_ATLAS_V2_4.md` | Documentação |
| `BRIEFING_ENTRADA_V2_3.md` | Documentação |
| `DESIGN.md` | Documentação |
| `DESIGN_V2.md` | Documentação |
| `VANO_ATLAS_MAPBOX_STYLE.md` | Documentação |

## `v2/docs/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `ADMIN_ETA_CONSOLE_2026-10-20.md` | Documentação |
| `ETA_HONESTO_2026-10-20.md` | Documentação |
| `global-map-sources.md` | Documentação |
| `GLOBAL_DATA_INTEGRATIONS.md` | Documentação |
| `GPS_NAVIGATION_RECOVERY_PLAN_2026-10-16.md` | Documentação |
| `MAPA_ROAD_SIGNS_FAST_ROUTE_MIGRATION.md` | Documentação |
| `MAVI_MAPBOX_ETA_FIX_PLAN_2026-10-20.md` | Documentação |
| `MAVI_TALK_PLAN_2026-10-16.md` | Documentação |
| `NAVIGATION_STABILITY_PLAN_2026-10-16.md` | Documentação |
| `SAFE_ROUTING_SP_V1.md` | Documentação |
| `SP7500_ROAD_CATALOG_QA.md` | Documentação |
| `TRAFFIC_MEMORY_SP.md` | Documentação |
| `TRAFFIC_MULTI_SOURCE_PLAN_2026-10-20.md` | Documentação |
| `TRAFFIC_PIPELINE_SCALING_SP.md` | Documentação |
| `URBAN_BLOCK_SEARCH_20_2026-10-20.md` | Documentação |
| `V2_ROUTE_TRAFFIC.md` | Documentação |
| `V2_SIM_SMART_CAMERA_PLAN.md` | Documentação |
| `VANO_TRANSIT_GLOBAL_ARCHITECTURE.md` | Documentação |
| `VANO_TRANSIT_UI_BRIEF.md` | Documentação |
| `VISIBLE_STREET_ATLAS_CARDS.md` | Documentação |

## `v2/original-engine/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `architecture.json` | Configuração/dados |
| `README.md` | Documentação |
| `start.sh` | Script shell |

## `v2/public/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `app-ads.txt` | Asset, recurso ou arquivo auxiliar |
| `apple-touch-icon.png` | Asset, recurso ou arquivo auxiliar |
| `theme-preflight.js` | Utilitário ou configuração JavaScript |
| `vano-city-lines.svg` | Asset, recurso ou arquivo auxiliar |
| `vano-logo-original.webp` | Asset, recurso ou arquivo auxiliar |
| `vano-mark.svg` | Asset, recurso ou arquivo auxiliar |
| `vano-trip-line.svg` | Asset, recurso ou arquivo auxiliar |
| `vehicle-car-cutout.png` | Asset, recurso ou arquivo auxiliar |
| `vehicle-car.webp` | Asset, recurso ou arquivo auxiliar |
| `vehicle-moto-cutout.svg` | Asset, recurso ou arquivo auxiliar |
| `vehicle-moto.webp` | Asset, recurso ou arquivo auxiliar |

## `v2/public/mapbox/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `vano-atlas-black.json` | Configuração/dados |
| `vano-atlas-light.json` | Configuração/dados |

## `v2/scripts/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `audit-seo.mjs` | Módulo JavaScript/Node ou testes |
| `check-production.mjs` | Módulo JavaScript/Node ou testes |
| `dev.mjs` | Módulo JavaScript/Node ou testes |
| `extract-overture.py` | Módulo Python |
| `import-prf-accidents.mjs` | Módulo JavaScript/Node ou testes |
| `prerender-seo.mjs` | Módulo JavaScript/Node ou testes |
| `run-tests.mjs` | Módulo JavaScript/Node ou testes |
| `sync-radars.mjs` | Módulo JavaScript/Node ou testes |
| `traffic-memory-export-pg.mjs` | Módulo JavaScript/Node ou testes |
| `traffic-memory-import.mjs` | Módulo JavaScript/Node ou testes |

## `v2/scripts/safe-routing/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `archive-geosampa-b2.mjs` | Módulo JavaScript/Node ou testes |
| `build-context-grid.mjs` | Módulo JavaScript/Node ou testes |
| `build-lighting-grid.mjs` | Módulo JavaScript/Node ou testes |
| `import-geosampa.mjs` | Módulo JavaScript/Node ou testes |
| `inspect-catalog.mjs` | Módulo JavaScript/Node ou testes |
| `inspect-sources.mjs` | Módulo JavaScript/Node ou testes |
| `stage-geosampa-b2.mjs` | Módulo JavaScript/Node ou testes |
| `verify-b2-snapshot.mjs` | Módulo JavaScript/Node ou testes |

## `v2/seo/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `catalog.mjs` | Módulo JavaScript/Node ou testes |
| `catalog.test.mjs` | Teste de regressão: catalog.test |

## `v2/server/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `account-deletion.mjs` | Módulo JavaScript/Node ou testes |
| `account-deletion.test.mjs` | Teste de regressão: account deletion.test |
| `admin-eta-access.test.mjs` | Teste de regressão: admin eta access.test |
| `admin-map-access.test.mjs` | Teste de regressão: admin map access.test |
| `admin.mjs` | Módulo JavaScript/Node ou testes |
| `admin.test.mjs` | Teste de regressão: admin.test |
| `api.test.mjs` | Teste de regressão: api.test |
| `b2-snapshot.test.mjs` | Teste de regressão: b2 snapshot.test |
| `benchmark.mjs` | Módulo JavaScript/Node ou testes |
| `benchmark.test.mjs` | Teste de regressão: benchmark.test |
| `cet-public-overview.mjs` | Módulo JavaScript/Node ou testes |
| `cet-public-overview.test.mjs` | Teste de regressão: cet public overview.test |
| `client-ip.mjs` | Módulo JavaScript/Node ou testes |
| `client-ip.test.mjs` | Teste de regressão: client ip.test |
| `congestion-bottlenecks.mjs` | Módulo JavaScript/Node ou testes |
| `congestion-bottlenecks.test.mjs` | Teste de regressão: congestion bottlenecks.test |
| `context-grid.test.mjs` | Teste de regressão: context grid.test |
| `email-degraded-production.test.mjs` | Teste de regressão: email degraded production.test |
| `engagement.mjs` | Módulo JavaScript/Node ou testes |
| `engagement.test.mjs` | Teste de regressão: engagement.test |
| `geosampa-recovery.test.mjs` | Teste de regressão: geosampa recovery.test |
| `geosampa-registry.test.mjs` | Teste de regressão: geosampa registry.test |
| `geosampa-wfs.test.mjs` | Teste de regressão: geosampa wfs.test |
| `global-earthquakes.mjs` | Módulo JavaScript/Node ou testes |
| `global-earthquakes.test.mjs` | Teste de regressão: global earthquakes.test |
| `global-live-context.mjs` | Módulo JavaScript/Node ou testes |
| `global-live-context.test.mjs` | Teste de regressão: global live context.test |
| `google-oauth.mjs` | Módulo JavaScript/Node ou testes |
| `google-oauth.test.mjs` | Teste de regressão: google oauth.test |
| `guest-retention.mjs` | Módulo JavaScript/Node ou testes |
| `guest-retention.test.mjs` | Teste de regressão: guest retention.test |
| `index.mjs` | Ponto de entrada: Módulo JavaScript/Node ou testes |
| `intelligence-conversation.mjs` | Módulo JavaScript/Node ou testes |
| `intelligence-conversation.test.mjs` | Teste de regressão: intelligence conversation.test |
| `intelligence-history.mjs` | Módulo JavaScript/Node ou testes |
| `intelligence-history.test.mjs` | Teste de regressão: intelligence history.test |
| `intelligence.mjs` | Módulo JavaScript/Node ou testes |
| `intelligence.test.mjs` | Teste de regressão: intelligence.test |
| `jev-assistant.test.mjs` | Teste de regressão: jev assistant.test |
| `jev-mic-api.test.mjs` | Teste de regressão: jev mic api.test |
| `lighting-grid.test.mjs` | Teste de regressão: lighting grid.test |
| `lighting-postgis.test.mjs` | Teste de regressão: lighting postgis.test |
| `locale.mjs` | Módulo JavaScript/Node ou testes |
| `locale.test.mjs` | Teste de regressão: locale.test |
| `map-public-data.mjs` | Módulo JavaScript/Node ou testes |
| `map-public-data.test.mjs` | Teste de regressão: map public data.test |
| `map-radars.mjs` | Módulo JavaScript/Node ou testes |
| `map-radars.test.mjs` | Teste de regressão: map radars.test |
| `mapbox-v1-fallback.mjs` | Módulo JavaScript/Node ou testes |
| `mapbox-v1-fallback.test.mjs` | Teste de regressão: mapbox v1 fallback.test |
| `mavi-assistant-http.test.mjs` | Teste de regressão: mavi assistant http.test |
| `mavi-cartesia-http.test.mjs` | Teste de regressão: mavi cartesia http.test |
| `mavi-cartesia.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-cartesia.test.mjs` | Teste de regressão: mavi cartesia.test |
| `mavi-elevenlabs.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-elevenlabs.test.mjs` | Teste de regressão: mavi elevenlabs.test |
| `mavi-first-response-http.test.mjs` | Teste de regressão: mavi first response http.test |
| `mavi-gptoss.test.mjs` | Teste de regressão: mavi gptoss.test |
| `mavi-grounding.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-grounding.test.mjs` | Teste de regressão: mavi grounding.test |
| `mavi-instant.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-instant.test.mjs` | Teste de regressão: mavi instant.test |
| `mavi-nvidia-http.test.mjs` | Teste de regressão: mavi nvidia http.test |
| `mavi-nvidia.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-nvidia.test.mjs` | Teste de regressão: mavi nvidia.test |
| `mavi-poi-http.test.mjs` | Teste de regressão: mavi poi http.test |
| `mavi-poi.mjs` | Módulo JavaScript/Node ou testes |
| `mavi-poi.test.mjs` | Teste de regressão: mavi poi.test |
| `mavi-street-http.test.mjs` | Teste de regressão: mavi street http.test |
| `mavi-talk-http.test.mjs` | Teste de regressão: mavi talk http.test |
| `mavi-voice-http.test.mjs` | Teste de regressão: mavi voice http.test |
| `mobile-auth.mjs` | Módulo JavaScript/Node ou testes |
| `mobile-auth.test.mjs` | Teste de regressão: mobile auth.test |
| `navigation-voice-proof.mjs` | Módulo JavaScript/Node ou testes |
| `navigation-voice-proof.test.mjs` | Teste de regressão: navigation voice proof.test |
| `navigation-voice-ticket-http.test.mjs` | Teste de regressão: navigation voice ticket http.test |
| `official-road-providers.mjs` | Módulo JavaScript/Node ou testes |
| `official-road-providers.test.mjs` | Teste de regressão: official road providers.test |
| `open-charge-map.mjs` | Módulo JavaScript/Node ou testes |
| `open-charge-map.test.mjs` | Teste de regressão: open charge map.test |
| `origin-alias.test.mjs` | Teste de regressão: origin alias.test |
| `original-engine-source.test.mjs` | Teste de regressão: original engine source.test |
| `overture-places.mjs` | Módulo JavaScript/Node ou testes |
| `overture-prf.test.mjs` | Teste de regressão: overture prf.test |
| `prf-historical.mjs` | Módulo JavaScript/Node ou testes |
| `public-api-security.test.mjs` | Teste de regressão: public api security.test |
| `radar-catalog.mjs` | Módulo JavaScript/Node ou testes |
| `radar-catalog.test.mjs` | Teste de regressão: radar catalog.test |
| `radar-geography.mjs` | Módulo JavaScript/Node ou testes |
| `radar-global.test.mjs` | Teste de regressão: radar global.test |
| `regional-road-events.mjs` | Módulo JavaScript/Node ou testes |
| `regional-road-events.test.mjs` | Teste de regressão: regional road events.test |
| `render-production-security.test.mjs` | Teste de regressão: render production security.test |
| `reports-live.mjs` | Módulo JavaScript/Node ou testes |
| `reports-live.test.mjs` | Teste de regressão: reports live.test |
| `reverse-geocode.mjs` | Módulo JavaScript/Node ou testes |
| `reverse-geocode.test.mjs` | Teste de regressão: reverse geocode.test |
| `route-candidates.mjs` | Módulo JavaScript/Node ou testes |
| `route-engine.mjs` | Módulo JavaScript/Node ou testes |
| `route-eta-diagnostics.mjs` | Módulo JavaScript/Node ou testes |
| `route-eta-diagnostics.test.mjs` | Teste de regressão: route eta diagnostics.test |
| `route-failover.mjs` | Módulo JavaScript/Node ou testes |
| `route-failover.test.mjs` | Teste de regressão: route failover.test |
| `route-traffic-http.test.mjs` | Teste de regressão: route traffic http.test |
| `route-traffic.mjs` | Módulo JavaScript/Node ou testes |
| `route-traffic.test.mjs` | Teste de regressão: route traffic.test |
| `routing.mjs` | Módulo JavaScript/Node ou testes |
| `routing.test.mjs` | Teste de regressão: routing.test |
| `safe-routing-adapter.test.mjs` | Teste de regressão: safe routing adapter.test |
| `safe-routing.test.mjs` | Teste de regressão: safe routing.test |
| `search-provider.mjs` | Módulo JavaScript/Node ou testes |
| `search-provider.test.mjs` | Teste de regressão: search provider.test |
| `search-utils.mjs` | Módulo JavaScript/Node ou testes |
| `search-utils.test.mjs` | Teste de regressão: search utils.test |
| `security.mjs` | Módulo JavaScript/Node ou testes |
| `sptrans-olhovivo.mjs` | Módulo JavaScript/Node ou testes |
| `sptrans-olhovivo.test.mjs` | Teste de regressão: sptrans olhovivo.test |
| `storage-pg.mjs` | Módulo JavaScript/Node ou testes |
| `storage-pg.test.mjs` | Teste de regressão: storage pg.test |
| `storage.mjs` | Módulo JavaScript/Node ou testes |
| `tomtom-flow-audit.mjs` | Módulo JavaScript/Node ou testes |
| `tomtom-flow-audit.test.mjs` | Teste de regressão: tomtom flow audit.test |
| `tomtom-fusion.test.mjs` | Teste de regressão: tomtom fusion.test |
| `tomtom-incidents.mjs` | Módulo JavaScript/Node ou testes |
| `tomtom-incidents.test.mjs` | Teste de regressão: tomtom incidents.test |
| `tomtom-pois.mjs` | Módulo JavaScript/Node ou testes |
| `tomtom-route-ranking.mjs` | Módulo JavaScript/Node ou testes |
| `traffic-memory.mjs` | Módulo JavaScript/Node ou testes |
| `traffic-memory.test.mjs` | Teste de regressão: traffic memory.test |
| `traffic-public.mjs` | Módulo JavaScript/Node ou testes |
| `traffic-public.test.mjs` | Teste de regressão: traffic public.test |
| `transit-engine.mjs` | Módulo JavaScript/Node ou testes |
| `transit-engine.test.mjs` | Teste de regressão: transit engine.test |
| `transit-realtime.mjs` | Módulo JavaScript/Node ou testes |
| `transit-realtime.test.mjs` | Teste de regressão: transit realtime.test |
| `urban-route-exploration.mjs` | Módulo JavaScript/Node ou testes |
| `urban-route-exploration.test.mjs` | Teste de regressão: urban route exploration.test |
| `v1-bridge-improvements.md` | Documentação |
| `v1-bridge.mjs` | Módulo JavaScript/Node ou testes |
| `v1-bridge.test.mjs` | Teste de regressão: v1 bridge.test |
| `v1-candidates.mjs` | Módulo JavaScript/Node ou testes |
| `v1-candidates.test.mjs` | Teste de regressão: v1 candidates.test |
| `v1-singleflight.mjs` | Módulo JavaScript/Node ou testes |
| `v1-singleflight.test.mjs` | Teste de regressão: v1 singleflight.test |
| `v2-fast-route-selector.mjs` | Módulo JavaScript/Node ou testes |
| `v2-fast-route-selector.test.mjs` | Teste de regressão: v2 fast route selector.test |
| `walking-crossings.mjs` | Módulo JavaScript/Node ou testes |
| `walking-crossings.test.mjs` | Teste de regressão: walking crossings.test |
| `walking-route.mjs` | Módulo JavaScript/Node ou testes |
| `walking-route.test.mjs` | Teste de regressão: walking route.test |
| `world-radar-catalog.mjs` | Módulo JavaScript/Node ou testes |
| `world-radar-catalog.test.mjs` | Teste de regressão: world radar catalog.test |
| `world-search.test.mjs` | Teste de regressão: world search.test |

## `v2/server/safe-routing/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `adapter.mjs` | Módulo JavaScript/Node ou testes |
| `b2-snapshot.mjs` | Módulo JavaScript/Node ou testes |
| `b2-storage.mjs` | Módulo JavaScript/Node ou testes |
| `b2-storage.test.mjs` | Teste de regressão: b2 storage.test |
| `context-grid.mjs` | Módulo JavaScript/Node ou testes |
| `CONTEXT-STAGING.md` | Documentação |
| `dataset-policy.mjs` | Módulo JavaScript/Node ou testes |
| `dataset-policy.test.mjs` | Teste de regressão: dataset policy.test |
| `engine.mjs` | Módulo JavaScript/Node ou testes |
| `geojson.mjs` | Módulo JavaScript/Node ou testes |
| `geosampa-registry.mjs` | Módulo JavaScript/Node ou testes |
| `geosampa-wfs.mjs` | Módulo JavaScript/Node ou testes |
| `ingestion.mjs` | Módulo JavaScript/Node ou testes |
| `ingestion.test.mjs` | Teste de regressão: ingestion.test |
| `lighting-grid.mjs` | Módulo JavaScript/Node ou testes |
| `lighting-postgis.mjs` | Módulo JavaScript/Node ou testes |
| `live-verified.mjs` | Módulo JavaScript/Node ou testes |
| `live-verified.test.mjs` | Teste de regressão: live verified.test |
| `schema.sql` | SQL |
| `source-fetch.mjs` | Módulo JavaScript/Node ou testes |
| `spatial-context.mjs` | Módulo JavaScript/Node ou testes |

## `v2/sql/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `traffic_memory_sp.sql` | SQL |

## `v2/src/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `admin-console.css` | Estilos |
| `admin-insights.css` | Estilos |
| `admin-route-simulator.css` | Estilos |
| `App.jsx` | Componente ou página React |
| `benchmark-page.css` | Estilos |
| `community-reports.css` | Estilos |
| `context.jsx` | Componente ou página React |
| `entry-v3.css` | Estilos |
| `home-motion.css` | Estilos |
| `intelligence-console.css` | Estilos |
| `jev-voice.css` | Estilos |
| `legal-pages.css` | Estilos |
| `main.jsx` | Ponto de entrada: Componente ou página React |
| `native-shell.css` | Estilos |
| `private-road-signs.css` | Estilos |
| `public-pages.css` | Estilos |
| `route-mode-detail.css` | Estilos |
| `route-traffic.css` | Estilos |
| `styles.css` | Estilos |
| `transit-preview.css` | Estilos |
| `v27-locales.css` | Estilos |
| `v28-navigation.css` | Estilos |
| `v29-polish.css` | Estilos |
| `v30-atlas.css` | Estilos |
| `v31-map-address.css` | Estilos |
| `v39-vehicle3d.css` | Estilos |
| `v4-design.css` | Estilos |
| `v40-public-map.css` | Estilos |
| `v43-speed-arrival.css` | Estilos |
| `v44-desktop-workspace.css` | Estilos |
| `v45-traffic.css` | Estilos |
| `v47-route-vehicle.css` | Estilos |
| `v48-moto-focus.css` | Estilos |
| `v49-map-appearance.css` | Estilos |
| `v5-refinement.css` | Estilos |
| `v50-night-system.css` | Estilos |
| `v80-dynamic-guidance.css` | Estilos |
| `v81-desktop-tablet.css` | Estilos |
| `v82-pc-provider-credits.css` | Estilos |
| `v92-profile-mavi.css` | Estilos |
| `visible-street-cards.css` | Estilos |

## `v2/src/components/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `AdminEtaConsole.css` | Estilos |
| `AdminEtaConsole.jsx` | Componente ou página React |
| `AdminInsights.jsx` | Componente ou página React |
| `AppErrorBoundary.jsx` | Componente ou página React |
| `Brand.jsx` | Componente ou página React |
| `BrandSplash.jsx` | Componente ou página React |
| `CityMapIntro.jsx` | Componente ou página React |
| `JevVoiceButton.jsx` | Componente ou página React |
| `ManeuverGlyph.jsx` | Componente ou página React |
| `MaviSetupChat.jsx` | Componente ou página React |
| `MotorcycleIcon.jsx` | Componente ou página React |
| `Navigation.jsx` | Componente ou página React |
| `QuickReportSheet.jsx` | Componente ou página React |
| `RoadAuditPanel.css` | Estilos |
| `RoadAuditPanel.jsx` | Componente ou página React |
| `RouteTraffic.jsx` | Componente ou página React |
| `SafeRoutingTestPanel.jsx` | Componente ou página React |
| `TrafficPipelineHealth.jsx` | Componente ou página React |
| `TransitJourneyPreview.jsx` | Componente ou página React |
| `TransitMap.jsx` | Componente ou página React |
| `Ui.jsx` | Componente ou página React |
| `VanoMap.jsx` | Componente ou página React |

## `v2/src/config/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `vano-mapbox-white-black.json` | Configuração/dados |

## `v2/src/lib/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `adaptiveRoadCamera.mjs` | Módulo JavaScript/Node ou testes |
| `adaptiveRoadCamera.test.mjs` | Teste de regressão: adaptiveRoadCamera.test |
| `addressCard.js` | Utilitário ou configuração JavaScript |
| `addressCard.test.mjs` | Teste de regressão: addressCard.test |
| `adminProfileSpeed.test.mjs` | Teste de regressão: adminProfileSpeed.test |
| `adminRouteSimulator.mjs` | Módulo JavaScript/Node ou testes |
| `adminRouteSimulator.test.mjs` | Teste de regressão: adminRouteSimulator.test |
| `api.js` | Utilitário ou configuração JavaScript |
| `arrivalMarker.js` | Utilitário ou configuração JavaScript |
| `atlasStyle.test.mjs` | Teste de regressão: atlasStyle.test |
| `atlasUx.test.mjs` | Teste de regressão: atlasUx.test |
| `communityPopupIntegration.test.mjs` | Teste de regressão: communityPopupIntegration.test |
| `communityReportOverlay.js` | Utilitário ou configuração JavaScript |
| `communityReports.js` | Utilitário ou configuração JavaScript |
| `communityReports.test.mjs` | Teste de regressão: communityReports.test |
| `dedupePublicFeatureSources.js` | Utilitário ou configuração JavaScript |
| `desktopTabletResponsive.test.mjs` | Teste de regressão: desktopTabletResponsive.test |
| `desktopWorkspaceAdmin.test.mjs` | Teste de regressão: desktopWorkspaceAdmin.test |
| `dynamicManeuverIsland.mjs` | Módulo JavaScript/Node ou testes |
| `dynamicManeuverIsland.test.mjs` | Teste de regressão: dynamicManeuverIsland.test |
| `formatTime.mjs` | Módulo JavaScript/Node ou testes |
| `formatTime.test.mjs` | Teste de regressão: formatTime.test |
| `geolocation.js` | Utilitário ou configuração JavaScript |
| `geolocation.test.mjs` | Teste de regressão: geolocation.test |
| `gpsSession.js` | Utilitário ou configuração JavaScript |
| `gpsSession.test.mjs` | Teste de regressão: gpsSession.test |
| `gpsWarmStart.js` | Utilitário ou configuração JavaScript |
| `gpsWarmStart.test.mjs` | Teste de regressão: gpsWarmStart.test |
| `homeViewport.test.mjs` | Teste de regressão: homeViewport.test |
| `i18n.js` | Utilitário ou configuração JavaScript |
| `i18n.test.mjs` | Teste de regressão: i18n.test |
| `jevMicSupport.mjs` | Módulo JavaScript/Node ou testes |
| `jevMicSupport.test.mjs` | Teste de regressão: jevMicSupport.test |
| `jevShared.mjs` | Módulo JavaScript/Node ou testes |
| `jevStreetRouting.mjs` | Módulo JavaScript/Node ou testes |
| `jevStreetRouting.test.mjs` | Teste de regressão: jevStreetRouting.test |
| `legalCenter.test.mjs` | Teste de regressão: legalCenter.test |
| `liveMotion.js` | Utilitário ou configuração JavaScript |
| `liveMotion.test.mjs` | Teste de regressão: liveMotion.test |
| `maneuverTracker.js` | Utilitário ou configuração JavaScript |
| `maneuverVisuals.js` | Utilitário ou configuração JavaScript |
| `maneuverVisuals.test.mjs` | Teste de regressão: maneuverVisuals.test |
| `mapAppearance.test.mjs` | Teste de regressão: mapAppearance.test |
| `mapboxPoiFallback.js` | Utilitário ou configuração JavaScript |
| `mapboxPoiFallback.test.mjs` | Teste de regressão: mapboxPoiFallback.test |
| `mapEntryExperience.test.mjs` | Teste de regressão: mapEntryExperience.test |
| `mapFeaturePersistence.js` | Utilitário ou configuração JavaScript |
| `mapFeaturePersistence.test.mjs` | Teste de regressão: mapFeaturePersistence.test |
| `mapLayers.js` | Utilitário ou configuração JavaScript |
| `mapLayers.test.mjs` | Teste de regressão: mapLayers.test |
| `mapLocationLayout.test.mjs` | Teste de regressão: mapLocationLayout.test |
| `mapPoiContinuity.test.mjs` | Teste de regressão: mapPoiContinuity.test |
| `mapPoiExpansion.test.mjs` | Teste de regressão: mapPoiExpansion.test |
| `mapProviderCreditsPosition.test.mjs` | Teste de regressão: mapProviderCreditsPosition.test |
| `mapPublicIcons.js` | Utilitário ou configuração JavaScript |
| `mapPublicIcons.test.mjs` | Teste de regressão: mapPublicIcons.test |
| `mapPublicOverlay.js` | Utilitário ou configuração JavaScript |
| `mapRecovery.mjs` | Módulo JavaScript/Node ou testes |
| `mapRecovery.test.mjs` | Teste de regressão: mapRecovery.test |
| `mapRendererRecovery.test.mjs` | Teste de regressão: mapRendererRecovery.test |
| `mapSpeed.js` | Utilitário ou configuração JavaScript |
| `mapTopSpacing.test.mjs` | Teste de regressão: mapTopSpacing.test |
| `mapVisibilityRecovery.test.mjs` | Teste de regressão: mapVisibilityRecovery.test |
| `maviAssistant.mjs` | Módulo JavaScript/Node ou testes |
| `maviAssistant.test.mjs` | Teste de regressão: maviAssistant.test |
| `maviAudioFocus.mjs` | Módulo JavaScript/Node ou testes |
| `maviAudioFocus.test.mjs` | Teste de regressão: maviAudioFocus.test |
| `maviCameraLock.test.mjs` | Teste de regressão: maviCameraLock.test |
| `maviElevenPlayback.mjs` | Módulo JavaScript/Node ou testes |
| `maviFlexible.mjs` | Módulo JavaScript/Node ou testes |
| `maviFlexible.test.mjs` | Teste de regressão: maviFlexible.test |
| `maviHandsfree.test.mjs` | Teste de regressão: maviHandsfree.test |
| `maviIncidentFollowup.mjs` | Módulo JavaScript/Node ou testes |
| `maviIncidentFollowup.test.mjs` | Teste de regressão: maviIncidentFollowup.test |
| `maviIncidentIntegration.test.mjs` | Teste de regressão: maviIncidentIntegration.test |
| `maviLatency.test.mjs` | Teste de regressão: maviLatency.test |
| `maviMapCommands.test.mjs` | Teste de regressão: maviMapCommands.test |
| `maviMicDesign.test.mjs` | Teste de regressão: maviMicDesign.test |
| `maviOfferUnderstanding.test.mjs` | Teste de regressão: maviOfferUnderstanding.test |
| `maviPersonaVoice.test.mjs` | Teste de regressão: maviPersonaVoice.test |
| `maviPreview.mjs` | Módulo JavaScript/Node ou testes |
| `maviPreview.test.mjs` | Teste de regressão: maviPreview.test |
| `maviRecognitionRecovery.mjs` | Módulo JavaScript/Node ou testes |
| `maviRecognitionRecovery.test.mjs` | Teste de regressão: maviRecognitionRecovery.test |
| `maviRouteDispatch.mjs` | Módulo JavaScript/Node ou testes |
| `maviRouteDispatch.test.mjs` | Teste de regressão: maviRouteDispatch.test |
| `maviTalk.mjs` | Módulo JavaScript/Node ou testes |
| `maviTalk.test.mjs` | Teste de regressão: maviTalk.test |
| `maviTrafficReport.mjs` | Módulo JavaScript/Node ou testes |
| `maviTrafficReport.test.mjs` | Teste de regressão: maviTrafficReport.test |
| `maviVoiceController.mjs` | Módulo JavaScript/Node ou testes |
| `maviVoiceController.test.mjs` | Teste de regressão: maviVoiceController.test |
| `maviVoiceLogic.mjs` | Módulo JavaScript/Node ou testes |
| `maviVoiceLogic.test.mjs` | Teste de regressão: maviVoiceLogic.test |
| `motorcycleCamera.js` | Utilitário ou configuração JavaScript |
| `motorcycleCamera.test.mjs` | Teste de regressão: motorcycleCamera.test |
| `nativeAndroidAudio.test.mjs` | Teste de regressão: nativeAndroidAudio.test |
| `nativeShell.js` | Utilitário ou configuração JavaScript |
| `navigationArrivalDock.test.mjs` | Teste de regressão: navigationArrivalDock.test |
| `navigationArrow3d.js` | Utilitário ou configuração JavaScript |
| `navigationArrow3d.test.mjs` | Teste de regressão: navigationArrow3d.test |
| `navigationCameraDefault.test.mjs` | Teste de regressão: navigationCameraDefault.test |
| `navigationCameraPlanner.js` | Utilitário ou configuração JavaScript |
| `navigationCameraPlanner.test.mjs` | Teste de regressão: navigationCameraPlanner.test |
| `navigationMotion.js` | Utilitário ou configuração JavaScript |
| `navigationMotion.test.mjs` | Teste de regressão: navigationMotion.test |
| `navigationReliability.test.mjs` | Teste de regressão: navigationReliability.test |
| `navigationStartContract.test.mjs` | Teste de regressão: navigationStartContract.test |
| `navigationStreetCard.test.mjs` | Teste de regressão: navigationStreetCard.test |
| `navigationSummary.js` | Utilitário ou configuração JavaScript |
| `navigationSummary.test.mjs` | Teste de regressão: navigationSummary.test |
| `navigationVoice.js` | Utilitário ou configuração JavaScript |
| `navigationVoice.test.mjs` | Teste de regressão: navigationVoice.test |
| `navigationWakeLock.mjs` | Módulo JavaScript/Node ou testes |
| `navigationWakeLock.test.mjs` | Teste de regressão: navigationWakeLock.test |
| `night3DBuildings.js` | Utilitário ou configuração JavaScript |
| `night3DBuildings.test.mjs` | Teste de regressão: night3DBuildings.test |
| `night3DScene.js` | Utilitário ou configuração JavaScript |
| `night3DScene.test.mjs` | Teste de regressão: night3DScene.test |
| `nightModeCompletion.test.mjs` | Teste de regressão: nightModeCompletion.test |
| `offline.test.mjs` | Teste de regressão: offline.test |
| `offlineCorridor.js` | Utilitário ou configuração JavaScript |
| `offlineGuidance.js` | Utilitário ou configuração JavaScript |
| `offlineStore.js` | Utilitário ou configuração JavaScript |
| `pcProviderCredits.test.mjs` | Teste de regressão: pcProviderCredits.test |
| `polishSafety.test.mjs` | Teste de regressão: polishSafety.test |
| `premiumMaviOnboarding.test.mjs` | Teste de regressão: premiumMaviOnboarding.test |
| `privateRoadSigns.js` | Utilitário ou configuração JavaScript |
| `privateRoadSigns.test.mjs` | Teste de regressão: privateRoadSigns.test |
| `publicRouteStroke.test.mjs` | Teste de regressão: publicRouteStroke.test |
| `publicSourceStability.js` | Utilitário ou configuração JavaScript |
| `quickReport.js` | Utilitário ou configuração JavaScript |
| `quickReport.test.mjs` | Teste de regressão: quickReport.test |
| `radarPolicy.js` | Utilitário ou configuração JavaScript |
| `radarPolicy.test.mjs` | Teste de regressão: radarPolicy.test |
| `roadAuditCsv.mjs` | Módulo JavaScript/Node ou testes |
| `roadAuditCsv.test.mjs` | Teste de regressão: roadAuditCsv.test |
| `routeAnimation.js` | Utilitário ou configuração JavaScript |
| `routeAnimation.test.mjs` | Teste de regressão: routeAnimation.test |
| `routeDeviation.js` | Utilitário ou configuração JavaScript |
| `routeFlow.js` | Utilitário ou configuração JavaScript |
| `routeFlow.test.mjs` | Teste de regressão: routeFlow.test |
| `routeModeDetails.mjs` | Módulo JavaScript/Node ou testes |
| `routeModeDetails.test.mjs` | Teste de regressão: routeModeDetails.test |
| `routePoints.js` | Utilitário ou configuração JavaScript |
| `routePoints.test.mjs` | Teste de regressão: routePoints.test |
| `routeSpeedLimit.js` | Utilitário ou configuração JavaScript |
| `routeSpeedLimit.test.mjs` | Teste de regressão: routeSpeedLimit.test |
| `routeTraffic.mjs` | Módulo JavaScript/Node ou testes |
| `routeTraffic.test.mjs` | Teste de regressão: routeTraffic.test |
| `routeTrafficMarkers.jsx` | Componente ou página React |
| `safeViewport.js` | Utilitário ou configuração JavaScript |
| `safeViewport.test.mjs` | Teste de regressão: safeViewport.test |
| `searchGeoBias.js` | Utilitário ou configuração JavaScript |
| `searchGeoBias.test.mjs` | Teste de regressão: searchGeoBias.test |
| `speedAndArrival.test.mjs` | Teste de regressão: speedAndArrival.test |
| `speedometerPlacement.test.mjs` | Teste de regressão: speedometerPlacement.test |
| `standardPlayPointer.mjs` | Módulo JavaScript/Node ou testes |
| `standardPlayPointer.test.mjs` | Teste de regressão: standardPlayPointer.test |
| `standardSimulationCamera.mjs` | Módulo JavaScript/Node ou testes |
| `standardSimulationCamera.test.mjs` | Teste de regressão: standardSimulationCamera.test |
| `themePreflight.test.mjs` | Teste de regressão: themePreflight.test |
| `trafficLayers.js` | Utilitário ou configuração JavaScript |
| `trafficLayers.test.mjs` | Teste de regressão: trafficLayers.test |
| `trafficMunicipal.js` | Utilitário ou configuração JavaScript |
| `transitExternalFallback.mjs` | Módulo JavaScript/Node ou testes |
| `transitExternalFallback.test.mjs` | Teste de regressão: transitExternalFallback.test |
| `transitGeometry.mjs` | Módulo JavaScript/Node ou testes |
| `transitGeometry.test.mjs` | Teste de regressão: transitGeometry.test |
| `transitPreviewUX.test.mjs` | Teste de regressão: transitPreviewUX.test |
| `travelDistance.js` | Utilitário ou configuração JavaScript |
| `travelDistance.test.mjs` | Teste de regressão: travelDistance.test |
| `upcomingCorridor.js` | Utilitário ou configuração JavaScript |
| `upcomingCorridor.test.mjs` | Teste de regressão: upcomingCorridor.test |
| `useRouteTraffic.js` | Utilitário ou configuração JavaScript |
| `v2BuildingVisibility.mjs` | Módulo JavaScript/Node ou testes |
| `v2BuildingVisibility.test.mjs` | Teste de regressão: v2BuildingVisibility.test |
| `v2CleanSignalsAndCamera.test.mjs` | Teste de regressão: v2CleanSignalsAndCamera.test |
| `v2DroneCamera.mjs` | Módulo JavaScript/Node ou testes |
| `v2DroneCamera.test.mjs` | Teste de regressão: v2DroneCamera.test |
| `v2OriginRoutePanel.test.mjs` | Teste de regressão: v2OriginRoutePanel.test |
| `v2RouteDetailsVisibility.test.mjs` | Teste de regressão: v2RouteDetailsVisibility.test |
| `v2RouteFlow.mjs` | Módulo JavaScript/Node ou testes |
| `v2RouteFlow.test.mjs` | Teste de regressão: v2RouteFlow.test |
| `v2RouteStroke.mjs` | Módulo JavaScript/Node ou testes |
| `v2RouteStroke.test.mjs` | Teste de regressão: v2RouteStroke.test |
| `v2SimulationChase.mjs` | Módulo JavaScript/Node ou testes |
| `v2SimulationChase.test.mjs` | Teste de regressão: v2SimulationChase.test |
| `vanoMapboxThemes.test.mjs` | Teste de regressão: vanoMapboxThemes.test |
| `vehicleRouteSelection.test.mjs` | Teste de regressão: vehicleRouteSelection.test |
| `visibleStreetCards.mjs` | Módulo JavaScript/Node ou testes |
| `visibleStreetCards.test.mjs` | Teste de regressão: visibleStreetCards.test |

## `v2/src/pages/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `AdminPage.jsx` | Componente ou página React |
| `AuthPage.jsx` | Componente ou página React |
| `BenchmarkPage.jsx` | Componente ou página React |
| `EntryPage.jsx` | Componente ou página React |
| `InfoPages.jsx` | Componente ou página React |
| `IntelligencePage.jsx` | Componente ou página React |
| `LegalPages.jsx` | Componente ou página React |
| `MapPage.jsx` | Componente ou página React |
| `PlacesPage.jsx` | Componente ou página React |
| `ProfilePage.jsx` | Componente ou página React |
| `ReportsPage.jsx` | Componente ou página React |
| `SettingsPage.jsx` | Componente ou página React |
| `TransitPage.jsx` | Componente ou página React |

## `vano/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `__init__.py` | Módulo Python |
| `bootstrap.py` | Módulo Python |
| `config.py` | Módulo Python |

## `vano/infrastructure/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `__init__.py` | Módulo Python |
| `access_logging.py` | Módulo Python |
| `database.py` | Módulo Python |
| `observability.py` | Módulo Python |

## `vano/routes/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `__init__.py` | Módulo Python |
| `admin.py` | Módulo Python |
| `api.py` | Módulo Python |
| `auth.py` | Módulo Python |
| `community.py` | Módulo Python |
| `core.py` | Módulo Python |
| `public.py` | Módulo Python |
| `routing.py` | Módulo Python |

## `vano/security/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `__init__.py` | Módulo Python |
| `auth.py` | Módulo Python |
| `headers.py` | Módulo Python |
| `redaction.py` | Módulo Python |
| `route_integrity.py` | Módulo Python |
| `sessions.py` | Módulo Python |

## `vano/services/`

| Arquivo | Responsabilidade aproximada |
|---|---|
| `__init__.py` | Módulo Python |
| `admin_analytics.py` | Módulo Python |
| `context.py` | Módulo Python |
| `indexnow.py` | Módulo Python |
| `nodes.py` | Módulo Python |
| `route_cache.py` | Módulo Python |
| `routing.py` | Módulo Python |
| `safety.py` | Módulo Python |
| `search.py` | Módulo Python |
| `voice_assistant.py` | Módulo Python |
