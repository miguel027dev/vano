from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
from urllib.parse import urlencode

from flask import jsonify, redirect, request, url_for, render_template
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


_STATE_RE = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
_CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{40,100}$")
_VERIFIER_RE = re.compile(r"^[A-Za-z0-9._~-]{20,200}$")


def _b64url_sha256(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def register_mobile_routes(app, core: dict) -> None:
    """Registra a ponte de autenticação entre o site VIENNA e o APK Android.

    O fluxo usa o OAuth Google já existente no app.py. O APK gera state/verifier,
    envia apenas state + challenge ao servidor, abre o Google no navegador e,
    depois do callback web, o servidor devolve um código curto para o deep link
    rairo://auth/callback. O APK troca esse código usando o verifier original.
    """

    google_ready = core["google_ready"]
    current_user = core["current_user"]
    onboarding_needed = core["onboarding_needed"]
    issue_persistent_login = core["issue_persistent_login"]
    get_db = core["get_db"]
    rate_limit = core["rate_limit"]
    remember_cookie_name = core["REMEMBER_COOKIE_NAME"]
    remember_login_days = int(core["REMEMBER_LOGIN_DAYS"])
    server_build = str(core.get("VANO_BUILD_ID") or "275.0.0")
    record_activity = core.get("record_activity")
    csrf_token_fn = core.get("csrf_token")

    # V275 — native navigation workload contract. The Android app can do the
    # high-frequency, deterministic work locally while the server keeps route
    # generation, traffic intelligence, safety scoring and reroute calculation.
    nav_contract_version = 3

    def mobile_mapbox_config():
        token = str(core.get("MAPBOX_ACCESS_TOKEN") or "").strip()
        style_day = str(core.get("MAPBOX_STYLE") or core.get("MAPBOX_STYLE_DAY") or "").strip()
        style_afternoon = str(core.get("MAPBOX_STYLE_AFTERNOON") or style_day).strip()
        style_night = str(core.get("MAPBOX_STYLE_NIGHT") or style_day).strip()
        return {
            "enabled": bool(token and style_day),
            "engine": "mapbox-maps-android",
            "sdk_target": "11.29.1",
            "access_token": token,
            "styles": {
                "day": style_day,
                "afternoon": style_afternoon or style_day,
                "night": style_night or style_day,
            },
        }

    def mobile_navigation_policy():
        return {
            "contract_version": nav_contract_version,
            "architecture": "native-map-screen-v1",
            "processing": {
                "map_rendering": "device",
                "hud_rendering": "device",
                "camera": "device",
                "gps_smoothing": "device",
                "speed_filter": "device",
                "bearing_filter": "device",
                "route_progress": "device",
                "route_trim": "device",
                "maneuver_tracking": "device",
                "voice_timing": "device",
                "alert_visibility": "device",
                "off_route_detection": "device",
                "ui_state": "device",
                "route_generation": "server",
                "route_selection": "server",
                "traffic_global": "server",
                "safety_scoring": "server",
                "micro_routing": "server",
                "reroute_calculation": "server",
                "event_disruption": "server",
            },
            "navigation": {
                "off_route_threshold_m": 500,
                "off_route_confirm_ms": 2200,
                "gps_moving_interval_ms": 500,
                "gps_fastest_interval_ms": 250,
                "gps_stationary_interval_ms": 2500,
                "gps_min_distance_m": 1,
                "progress_tick_ms": 100,
                "camera_target_tick_ms": 100,
                "voice_tick_ms": 200,
                "server_progress_sync_ms": 15000,
                "traffic_refresh_ms": 30000,
                "alerts_refresh_ms": 20000,
                "telemetry_flush_ms": 30000,
                "telemetry_batch_max": 24,
                "route_cache_ttl_s": 120,
                "route_cache_keep": 3,
            },
            "render": {
                "engine": "mapbox-maps-android",
                "native_map_only_during_map_screen": True,
                "webview_map_engine": False,
                "target_fps": 60,
                "fps_low": 30,
                "fps_normal": 60,
                "fps_high": 60,
                "prefer_native_location": True,
                "coalesce_camera_updates": True,
                "avoid_overlapping_camera_animations": True,
                "pause_nonessential_when_backgrounded": True,
            },
            "route_payload": {
                "geometry": "geojson",
                "steps": True,
                "road_controls": True,
                "speed_limits": True,
                "voice_prompts": True,
                "traffic_live_via_endpoint": True,
                "events_live_via_endpoint": True,
                "compact_payload_contract_version": 1,
                "mobile_compact_query": "mobile_compact=1",
                "mobile_compact_header": "X-VANO-Mobile-Compact: 1",
                "max_delivered_routes": 3,
            },
        }

    def native_map_endpoints():
        return {
            "search": "/api/search-suggestions",
            "geocode": "/api/geocode",
            "route": "/api/route",
            "alerts": "/api/alerts",
            "alerts_quick": "/api/alerts/quick",
            "road_awareness": "/api/road-awareness",
            "traffic_recommendation": "/api/traffic-recommendation",
            "event_route_check": "/api/event-route-check",
            "nearby_drivers": "/api/nearby-drivers",
            "presence": "/api/presence",
            "saved_places": "/api/saved-places",
            "parking_nearby": "/api/parking-nearby",
            "weather_now": "/api/weather-now",
            "share_route": "/api/share-route",
            "live_trip": "/api/live-trip",
            "telemetry_batch": "/api/mobile/navigation/batch",
        }

    def native_map_ui_contract():
        return {
            "screen": "android-native",
            "webview_required": False,
            "design_source": "vano-map-v277",
            "portrait": True,
            "landscape": True,
            "dark_mode": True,
            "hud": {
                "maneuver_card": True,
                "street_chip": True,
                "speedometer": True,
                "arrival_card": True,
                "route_picker": True,
                "side_controls": True,
                "traffic_radar": True,
                "alerts": True,
            },
            "handoff": {
                "availability_method": "nativeMapScreenAvailable",
                "open_method": "openNativeMapScreen",
                "web_fallback": True,
                "debug_web_query": "web_map=1",
            },
        }

    # One canonical setting for the APK bridge. Keep legacy aliases only as
    # compatibility fallbacks so old deployments do not break silently.
    allowed_return_uri = (
        os.environ.get("VANO_MOBILE_RETURN_URI", "").strip()
        or os.environ.get("VIENNA_MOBILE_RETURN_URI", "").strip()
        or os.environ.get("RAIRO_MOBILE_RETURN_URI", "").strip()
        or "vienna://auth/callback"
    )
    allowed_return_uris = {allowed_return_uri, "vienna://auth/callback", "vano://auth/callback"}

    start_serializer = URLSafeTimedSerializer(
        app.config["SECRET_KEY"], salt="rairo-mobile-start-v1"
    )
    code_serializer = URLSafeTimedSerializer(
        app.config["SECRET_KEY"], salt="vano-mobile-code-v2"
    )

    def mobile_error(code: int, title: str, message: str, error: str):
        # Browser/deep-link failures must never expose a raw JSON blob to a user.
        accepts_html = request.accept_mimetypes.best_match(["text/html", "application/json"]) == "text/html"
        if accepts_html and request.method == "GET":
            return render_template("error.html", code=code, title=title, message=message), code
        return jsonify({"ok": False, "error": error, "message": message}), code

    @app.get("/mobile/entry")
    def mobile_entry():
        """Entrada estável do APK: login se anônimo, app normal se autenticado."""
        user = current_user()
        if not user or not user["is_active"]:
            return redirect(url_for("login"))
        if onboarding_needed(user):
            return redirect(url_for("onboarding", next=url_for("index")))
        return redirect(url_for("index"))

    @app.get("/mobile/auth/google/start")
    def mobile_auth_google_start():
        """Abre o OAuth web existente e preserva o state/challenge do APK."""
        if not google_ready():
            return mobile_error(503, "Login indisponível", "O login com Google não está configurado neste servidor.", "google_not_configured")

        if not rate_limit("mobile-google-start", 20, 60):
            return mobile_error(429, "Muitas tentativas", "Aguarde um instante e tente entrar novamente.", "rate_limited")

        state = (request.args.get("state") or "").strip()
        challenge = (request.args.get("challenge") or "").strip()
        return_uri = (request.args.get("return_uri") or "").strip()

        if (
            not _STATE_RE.fullmatch(state)
            or not _CHALLENGE_RE.fullmatch(challenge)
            or return_uri not in allowed_return_uris
        ):
            return mobile_error(400, "Não foi possível iniciar o login", "O aplicativo enviou uma solicitação de autenticação inválida ou desatualizada. Atualize o VANO MAPS e tente novamente.", "invalid_mobile_auth_request")

        ticket = start_serializer.dumps({
            "state": state,
            "challenge": challenge,
            "return_uri": return_uri,
            "nonce": secrets.token_urlsafe(16),
        })

        finish_path = url_for("mobile_auth_google_finish", ticket=ticket)
        return redirect(url_for("google_login", next=finish_path))

    @app.get("/mobile/auth/google/finish")
    def mobile_auth_google_finish():
        """Chamado pelo callback web depois que o Google autenticou o usuário."""
        user = current_user()
        if not user or not user["is_active"]:
            return redirect(url_for("login"))

        ticket = (request.args.get("ticket") or "").strip()
        try:
            payload = start_serializer.loads(ticket, max_age=15 * 60)
        except SignatureExpired:
            return redirect(url_for("login"))
        except BadSignature:
            return mobile_error(400, "Login expirado", "Esse retorno de autenticação não é mais válido. Volte ao aplicativo e tente novamente.", "invalid_mobile_ticket")

        state = str(payload.get("state") or "")
        challenge = str(payload.get("challenge") or "")
        return_uri = str(payload.get("return_uri") or "")

        if (
            not _STATE_RE.fullmatch(state)
            or not _CHALLENGE_RE.fullmatch(challenge)
            or return_uri not in allowed_return_uris
        ):
            return mobile_error(400, "Login expirado", "Esse retorno de autenticação não é mais válido. Volte ao aplicativo e tente novamente.", "invalid_mobile_ticket")

        code = code_serializer.dumps({
            "uid": int(user["id"]),
            "state": state,
            "challenge": challenge,
            "nonce": secrets.token_urlsafe(24),
        })

        callback_url = f"{return_uri}?{urlencode({'code': code, 'state': state})}"
        response = redirect(callback_url)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.post("/mobile/auth/exchange")
    def mobile_auth_exchange():
        """Troca código + verifier PKCE por um remember-token do site."""
        if not rate_limit("mobile-auth-exchange", 30, 60):
            return jsonify({"ok": False, "error": "rate_limited"}), 429

        data = request.get_json(silent=True) or {}
        code = str(data.get("code") or "").strip()
        state = str(data.get("state") or "").strip()
        verifier = str(data.get("verifier") or "").strip()

        if (
            not code
            or not _STATE_RE.fullmatch(state)
            or not _VERIFIER_RE.fullmatch(verifier)
        ):
            return jsonify({"ok": False, "error": "invalid_exchange_request"}), 400

        try:
            payload = code_serializer.loads(code, max_age=5 * 60)
        except SignatureExpired:
            return jsonify({"ok": False, "error": "mobile_code_expired"}), 400
        except BadSignature:
            return jsonify({"ok": False, "error": "invalid_mobile_code"}), 400

        expected_state = str(payload.get("state") or "")
        challenge = str(payload.get("challenge") or "")
        uid = payload.get("uid")

        if not hmac.compare_digest(state, expected_state):
            return jsonify({"ok": False, "error": "state_mismatch"}), 400

        calculated_challenge = _b64url_sha256(verifier)
        if not challenge or not hmac.compare_digest(calculated_challenge, challenge):
            return jsonify({"ok": False, "error": "pkce_mismatch"}), 400

        try:
            uid = int(uid)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "invalid_user"}), 400

        user = get_db().execute(
            "SELECT id,is_active FROM users WHERE id=? LIMIT 1", (uid,)
        ).fetchone()
        if not user or not user["is_active"]:
            return jsonify({"ok": False, "error": "user_unavailable"}), 403

        remember_token = issue_persistent_login(uid)
        max_age = remember_login_days * 24 * 60 * 60

        response = jsonify({
            "ok": True,
            "cookie_name": remember_cookie_name,
            "remember_token": remember_token,
            "max_age": max_age,
            "entry": "/mobile/entry",
        })
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.get("/api/mobile/bootstrap")
    def mobile_bootstrap():
        # Tiny, cacheable response used by Android during process startup.
        response = jsonify({
            "ok": True,
            "server_build": server_build,
            "mobile_bridge": True,
            "entry": "/mobile/entry",
            "route_endpoint": "/api/route",
            "navigation_config_endpoint": "/api/mobile/navigation/config",
            "native_map_config_endpoint": "/api/mobile/native-map/config",
            "native_map_session_endpoint": "/api/mobile/native-map/session",
            "telemetry_batch_endpoint": "/api/mobile/navigation/batch",
            "native_map_screen": True,
            "navigation": mobile_navigation_policy(),
            "native_map": native_map_ui_contract(),
            "mapbox": mobile_mapbox_config(),
        })
        response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
        response.headers["X-VANO-Mobile-Contract"] = str(nav_contract_version)
        return response

    @app.get("/api/mobile/navigation/config")
    def mobile_navigation_config():
        response = jsonify({
            "ok": True,
            "server_build": server_build,
            "navigation": mobile_navigation_policy(),
            "native_map": native_map_ui_contract(),
            "mapbox": mobile_mapbox_config(),
        })
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=900"
        response.headers["X-VANO-Mobile-Contract"] = str(nav_contract_version)
        return response

    @app.get("/api/mobile/native-map/config")
    def mobile_native_map_config():
        response = jsonify({
            "ok": True,
            "server_build": server_build,
            "contract_version": nav_contract_version,
            "mapbox": mobile_mapbox_config(),
            "native_map": native_map_ui_contract(),
            "navigation": mobile_navigation_policy(),
            "endpoints": native_map_endpoints(),
            "route_request": {
                "query": {"mobile_compact": 1, "adaptive": 1},
                "headers": {"X-VANO-Mobile-Compact": "1"},
            },
        })
        response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"
        response.headers["X-VANO-Mobile-Contract"] = str(nav_contract_version)
        return response

    @app.get("/api/mobile/native-map/session")
    def mobile_native_map_session():
        user = current_user()
        logged_in = bool(user and user["is_active"])
        csrf_value = ""
        if callable(csrf_token_fn):
            try:
                csrf_value = str(csrf_token_fn() or "")
            except Exception:
                csrf_value = ""
        response = jsonify({
            "ok": True,
            "server_build": server_build,
            "contract_version": nav_contract_version,
            "logged_in": logged_in,
            "csrf": csrf_value,
            "entry": "/mobile/entry",
            "endpoints": native_map_endpoints(),
            "route_request": {
                "query": {"mobile_compact": 1, "adaptive": 1},
                "headers": {"X-VANO-Mobile-Compact": "1"},
            },
        })
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-VANO-Mobile-Contract"] = str(nav_contract_version)
        return response

    @app.post("/api/mobile/navigation/batch")
    def mobile_navigation_batch():
        # The next Android build batches lightweight telemetry instead of doing
        # one HTTP request per navigation tick. Raw location is intentionally not
        # persisted here. This endpoint is cheap even when the audit trail is off.
        if not rate_limit("mobile-navigation-batch", 90, 60):
            return jsonify({"ok": False, "error": "rate_limited"}), 429
        data = request.get_json(silent=True) or {}
        events = data.get("events") or []
        if not isinstance(events, list):
            return jsonify({"ok": False, "error": "invalid_events"}), 400
        events = events[:32]
        counters = {}
        for item in events:
            if not isinstance(item, dict):
                continue
            kind = re.sub(r"[^a-z0-9_-]", "", str(item.get("type") or "event").lower())[:32] or "event"
            counters[kind] = counters.get(kind, 0) + 1
        if callable(record_activity) and os.environ.get("VANO_MOBILE_BATCH_AUDIT", "0").strip().lower() in {"1", "true", "yes", "on"}:
            try:
                record_activity("performance", {
                    "target": "mobile_navigation_batch",
                    "label": f"{sum(counters.values())} events",
                    "types": counters,
                }, status_code=202, method="BATCH", path="/api/mobile/navigation/batch", endpoint="mobile_navigation_batch")
            except Exception:
                pass
        response = jsonify({
            "ok": True,
            "accepted": sum(counters.values()),
            "next_flush_ms": int(mobile_navigation_policy()["navigation"]["telemetry_flush_ms"]),
        })
        response.status_code = 202
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.get("/mobile/health")
    def mobile_health():
        response = jsonify({
            "ok": True,
            "mobile_bridge": True,
            "google_configured": bool(google_ready()),
            "entry": "/mobile/entry",
            "server_build": server_build,
            "navigation_contract": nav_contract_version,
            "native_map_screen": True,
        })
        response.headers["X-VANO-Mobile-Contract"] = str(nav_contract_version)
        return response
