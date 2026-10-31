"""Admin-only Gemini Live experiment for the VANO V2 map.

The long-lived Gemini API key never reaches the browser. A single-use,
short-lived token is issued by Google's official provisioning endpoint.
This module is disabled unless VANO_GEMINI_LIVE_V2_ENABLED=1.
"""
import os
from datetime import datetime, timedelta, timezone

import requests
from flask import jsonify, request, session

TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
MODELS = (
    "gemini-3.8-live",
    "gemini-3.8-live-extended-thinking",
    "gemini-3.1-flash-live-preview",
)


def _enabled():
    return os.getenv("VANO_GEMINI_LIVE_V2_ENABLED", "").lower().strip() in {"1", "true", "yes", "on"}


def register_gemini_live_v2(app, *, rate_limit, validate_csrf, current_user):
    """Registration is standalone: the existing voice endpoints stay unchanged."""

    def _admin():
        user = current_user()
        return user is not None and user["role"] == "admin" and session.get("user_id")

    @app.get("/api/admin/gemini-live/capabilities")
    def gemini_live_capabilities():
        if not _admin():
            return jsonify({"ok": False, "code": "forbidden"}), 403
        ready = _enabled() and bool(os.getenv("GEMINI_API_KEY", "").strip())
        response = jsonify({
            "ok": True,
            "enabled": ready,
            "models": list(MODELS) if ready else [],
            "default_model": MODELS[0],
            "audio_only": True,
            "preview": True,
        })
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/admin/gemini-live/session")
    def gemini_live_token():
        if not _admin():
            return jsonify({"ok": False, "code": "forbidden"}), 403
        if not validate_csrf():
            return jsonify({"ok": False, "code": "invalid_csrf"}), 403
        # An opt-in prevents requests to the upstream service on ordinary V2 pages.
        if not _enabled() or not os.getenv("GEMINI_API_KEY", "").strip():
            return jsonify({"ok": False, "code": "disabled"}), 503
        if not rate_limit("gemini-live-v2", 4, 60, identity=session["user_id"], shared=True):
            return jsonify({"ok": False, "code": "rate_limited"}), 429

        payload = request.get_json(silent=True) or {}
        model = payload.get("model", MODELS[0])
        if model not in MODELS:
            return jsonify({"ok": False, "code": "unsupported_model"}), 400

        now = datetime.now(timezone.utc)
        expire = (now + timedelta(minutes=15)).isoformat(timespec="seconds").replace("+00:00", "Z")
        start_expire = (now + timedelta(minutes=1)).isoformat(timespec="seconds").replace("+00:00", "Z")
        body = {
            "uses": 1,
            "newSessionExpireTime": start_expire,
            "expireTime": expire,
            "liveConnectConstraints": {
                "model": "models/" + model,
                "config": {"responseModalities": ["AUDIO"]},
            },
        }
        try:
            upstream = requests.post(
                TOKEN_URL,
                headers={
                    "x-goog-api-key": os.environ["GEMINI_API_KEY"],
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=(4, 12),
            )
            upstream.raise_for_status()
            token = str((upstream.json() or {}).get("name") or "")
            if not token:
                raise ValueError("missing ephemeral token")
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            # No response bodies, keys or token values are logged.
            app.logger.warning("Gemini Live V2 token provisioning unavailable: %s", type(exc).__name__)
            return jsonify({"ok": False, "code": "provider_unavailable"}), 502

        response = jsonify({"ok": True, "token": token, "model": model, "expires_in_seconds": 900})
        response.headers["Cache-Control"] = "no-store, no-cache, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response
