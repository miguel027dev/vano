from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone
from functools import wraps
from typing import Any

import requests
from cryptography.fernet import Fernet, InvalidToken
from flask import jsonify, request


class VanoOsintBridge:
    """Private server-to-server bridge from VANO to OSINT of VANO.

    Browser/native clients authenticate only against VANO. The OSINT service
    token and OSINT device token never reach JavaScript or the Android WebView.
    """

    def __init__(self, app, core: dict[str, Any]):
        self.app = app
        self.get_db = core["get_db"]
        self.current_user = core["current_user"]
        self.validate_csrf = core["validate_csrf"]
        self.rate_limit = core["rate_limit"]
        self.utcnow_iso = core["utcnow_iso"]
        self.secret_key = str(core["SECRET_KEY"] or "")

        self.base_url = str(os.environ.get("VANO_OSINT_URL", "")).strip().rstrip("/")
        self.service_token = str(os.environ.get("VANO_OSINT_SERVICE_TOKEN", "")).strip()
        self.test_group = str(os.environ.get("VANO_OSINT_TEST_GROUP", "closed-beta")).strip()[:80] or "closed-beta"
        self.consent_version = str(os.environ.get("VANO_OSINT_CONSENT_VERSION", "beta-location-v1")).strip()[:40] or "beta-location-v1"
        self.timeout = max(2.0, min(20.0, float(os.environ.get("VANO_OSINT_TIMEOUT", "8") or 8)))
        self.prompt_enabled = str(os.environ.get("VANO_OSINT_TRACKING_PROMPT", "1")).strip().lower() not in {"0", "false", "no", "off"}
        self.web_min_interval = max(1.0, min(30.0, float(os.environ.get("VANO_OSINT_WEB_MIN_INTERVAL", "2") or 2)))

        key_material = str(os.environ.get("VANO_OSINT_BRIDGE_KEY", "")).strip()
        if not key_material:
            key_material = self.secret_key
            if self.configured:
                app.logger.warning(
                    "VANO_OSINT_BRIDGE_KEY ausente; usando SECRET_KEY como fallback. "
                    "Configure uma chave estável em produção para preservar tokens após restart."
                )
        digest = hashlib.sha256((key_material or "vano-osint-disabled").encode("utf-8")).digest()
        self.fernet = Fernet(base64.urlsafe_b64encode(digest))
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": "VANO-MAPS/OSINT-Bridge-1.0", "Accept": "application/json"})

    @property
    def configured(self) -> bool:
        return bool(self.base_url.startswith(("https://", "http://")) and self.service_token)

    def _json_error(self, message: str, status: int = 400, code: str | None = None, **extra):
        payload = {"ok": False, "error": str(message)}
        if code:
            payload["code"] = code
        payload.update(extra)
        return jsonify(payload), status

    def _local_row(self, user_id: int):
        return self.get_db().execute(
            """SELECT id,user_id,remote_user_id,remote_device_id,device_token_enc,device_name,
                      app_version,consent_active,consent_version,consent_at,consent_revoked_at,
                      last_sync_at,last_error,created_at,updated_at
               FROM vano_osint_devices WHERE user_id=? LIMIT 1""",
            (int(user_id),),
        ).fetchone()

    def _encrypt_token(self, token: str) -> str:
        return self.fernet.encrypt(str(token).encode("utf-8")).decode("ascii")

    def _decrypt_token(self, encrypted: str) -> str:
        try:
            return self.fernet.decrypt(str(encrypted).encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError):
            return ""

    def _save_error(self, user_id: int, message: str):
        try:
            db = self.get_db()
            db.execute(
                "UPDATE vano_osint_devices SET last_error=?,updated_at=? WHERE user_id=?",
                (str(message or "")[:500], self.utcnow_iso(), int(user_id)),
            )
            db.commit()
        except Exception:
            pass

    def _clear_error(self, user_id: int):
        try:
            db = self.get_db()
            now = self.utcnow_iso()
            db.execute(
                "UPDATE vano_osint_devices SET last_error='',last_sync_at=?,updated_at=? WHERE user_id=?",
                (now, now, int(user_id)),
            )
            db.commit()
        except Exception:
            pass

    def _request(self, method: str, path: str, *, token: str | None = None, payload: dict | None = None):
        if not self.configured:
            raise RuntimeError("OSINT of VANO não configurado no backend da VANO.")
        headers = {"Content-Type": "application/json"}
        bearer = token if token is not None else self.service_token
        headers["Authorization"] = f"Bearer {bearer}"
        url = self.base_url + (path if path.startswith("/") else "/" + path)
        try:
            response = self.http.request(
                method.upper(), url, headers=headers, json=payload, timeout=(3.0, self.timeout), allow_redirects=False
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"Falha ao conectar no OSINT of VANO: {type(exc).__name__}") from exc
        try:
            body = response.json()
        except Exception:
            body = {"ok": False, "error": f"Resposta inválida do OSINT ({response.status_code})."}
        if response.status_code >= 400 or body.get("ok") is False:
            message = str(body.get("error") or body.get("message") or f"OSINT HTTP {response.status_code}")
            err = RuntimeError(message[:300])
            err.status_code = response.status_code
            err.remote_body = body
            raise err
        return body

    def _user_payload(self, user, *, consent_active=True):
        return {
            "vano_account_id": str(user["id"]),
            "name": str(user["name"] or "Usuário VANO")[:120],
            "email": str(user["email"] or "")[:255],
            "test_group": self.test_group,
            "consent_active": bool(consent_active),
            "consent_version": self.consent_version,
        }

    def _ensure_remote_device(self, user, device_name: str = "VANO Web/App", app_version: str = ""):
        if not self.configured:
            raise RuntimeError("OSINT of VANO não configurado.")
        uid = int(user["id"])
        row = self._local_row(uid)
        token = self._decrypt_token(row["device_token_enc"]) if row and row["device_token_enc"] else ""
        remote_user_id = str(row["remote_user_id"] or "") if row else ""
        remote_device_id = str(row["remote_device_id"] or "") if row else ""

        # Upsert the account on every explicit enrollment. This also restores
        # consent remotely after the user has explicitly opted in again.
        remote_user = self._request("POST", "/api/vano/v1/admin/users", payload=self._user_payload(user, consent_active=True))
        data = remote_user.get("data") or {}
        remote_user_id = str(data.get("user_id") or remote_user_id).strip()
        if not remote_user_id:
            raise RuntimeError("OSINT não retornou user_id do testador.")

        if not token:
            created = self._request(
                "POST",
                f"/api/vano/v1/admin/users/{remote_user_id}/devices",
                payload={
                    "name": str(device_name or "VANO Web/App")[:120],
                    "platform": "android-webview" if "android" in str(request.headers.get("User-Agent", "")).lower() else "web",
                    "app_version": str(app_version or "")[:80],
                },
            )
            d = created.get("data") or {}
            token = str(d.get("device_token") or "").strip()
            remote_device_id = str(d.get("device_id") or "").strip()
            if not token:
                raise RuntimeError("OSINT não retornou token do dispositivo.")

        now = self.utcnow_iso()
        db = self.get_db()
        encrypted = self._encrypt_token(token)
        if row:
            db.execute(
                """UPDATE vano_osint_devices
                   SET remote_user_id=?,remote_device_id=?,device_token_enc=?,device_name=?,app_version=?,
                       consent_active=1,consent_version=?,consent_at=?,consent_revoked_at=NULL,
                       last_error='',updated_at=? WHERE user_id=?""",
                (
                    remote_user_id, remote_device_id, encrypted, str(device_name or "VANO Web/App")[:120],
                    str(app_version or "")[:80], self.consent_version, now, now, uid,
                ),
            )
        else:
            db.execute(
                """INSERT INTO vano_osint_devices(
                       user_id,remote_user_id,remote_device_id,device_token_enc,device_name,app_version,
                       consent_active,consent_version,consent_at,consent_revoked_at,last_sync_at,last_error,created_at,updated_at
                   ) VALUES(?,?,?,?,?,?,1,?,?,NULL,NULL,'',?,?)""",
                (
                    uid, remote_user_id, remote_device_id, encrypted, str(device_name or "VANO Web/App")[:120],
                    str(app_version or "")[:80], self.consent_version, now, now, now,
                ),
            )
        db.commit()
        return self._local_row(uid), token

    def _device_token_for_user(self, user, *, auto_repair=True):
        uid = int(user["id"])
        row = self._local_row(uid)
        if not row or not bool(row["consent_active"]):
            raise PermissionError("Compartilhamento de localização do teste não está ativo.")
        token = self._decrypt_token(row["device_token_enc"] or "")
        if token:
            return row, token
        if auto_repair:
            return self._ensure_remote_device(user, row["device_name"] or "VANO Web/App", row["app_version"] or "")
        raise RuntimeError("Token do dispositivo OSINT indisponível.")

    def _forward_device(self, user, method: str, path: str, payload: dict | None = None):
        row, token = self._device_token_for_user(user)
        try:
            body = self._request(method, path, token=token, payload=payload)
            self._clear_error(int(user["id"]))
            return body
        except RuntimeError as exc:
            # A device token can be revoked remotely. One repair attempt is safe
            # only while the local consent is still explicitly active.
            status_code = getattr(exc, "status_code", None)
            if status_code in {401, 403} and row and bool(row["consent_active"]):
                db = self.get_db()
                db.execute(
                    "UPDATE vano_osint_devices SET device_token_enc='',remote_device_id='',updated_at=? WHERE user_id=?",
                    (self.utcnow_iso(), int(user["id"])),
                )
                db.commit()
                _, token = self._ensure_remote_device(user, row["device_name"] or "VANO Web/App", row["app_version"] or "")
                body = self._request(method, path, token=token, payload=payload)
                self._clear_error(int(user["id"]))
                return body
            self._save_error(int(user["id"]), str(exc))
            raise

    @staticmethod
    def _num(data: dict, key: str, lo: float | None = None, hi: float | None = None, required=False):
        value = data.get(key)
        if value is None or value == "":
            if required:
                raise ValueError(f"{key} é obrigatório")
            return None
        value = float(value)
        if not (value == value and abs(value) != float("inf")):
            raise ValueError(f"{key} inválido")
        if lo is not None and value < lo:
            raise ValueError(f"{key} abaixo do mínimo")
        if hi is not None and value > hi:
            raise ValueError(f"{key} acima do máximo")
        return value

    def _sanitize_location(self, data: dict):
        return {
            "lat": self._num(data, "lat", -90, 90, True),
            "lon": self._num(data, "lon", -180, 180, True),
            "accuracy_m": self._num(data, "accuracy_m", 0, 100000),
            "altitude_m": self._num(data, "altitude_m", -1000, 100000),
            "speed_mps": self._num(data, "speed_mps", 0, 250),
            "heading_deg": self._num(data, "heading_deg", 0, 360),
            "battery_pct": self._num(data, "battery_pct", 0, 100),
            "is_charging": bool(data["is_charging"]) if data.get("is_charging") is not None else None,
            "timestamp": str(data.get("timestamp") or datetime.now(timezone.utc).isoformat()).replace("+00:00", "Z")[:64],
        }

    def _sanitize_route_start(self, data: dict):
        destination = str(data.get("destination_name") or "").strip()
        if not destination:
            raise ValueError("destination_name é obrigatório")
        return {
            "vano_route_id": str(data.get("vano_route_id") or "")[:120] or None,
            "route_mode": str(data.get("route_mode") or "")[:40] or None,
            "origin_name": str(data.get("origin_name") or "")[:255] or None,
            "origin_lat": self._num(data, "origin_lat", -90, 90),
            "origin_lon": self._num(data, "origin_lon", -180, 180),
            "destination_name": destination[:255],
            "destination_lat": self._num(data, "destination_lat", -90, 90),
            "destination_lon": self._num(data, "destination_lon", -180, 180),
            "distance_m": self._num(data, "distance_m", 0, 10000000),
            "remaining_m": self._num(data, "remaining_m", 0, 10000000),
            "eta_seconds": int(self._num(data, "eta_seconds", 0, 7 * 86400) or 0) or None,
        }

    def _sanitize_route_update(self, data: dict):
        payload: dict[str, Any] = {}
        if "remaining_m" in data:
            payload["remaining_m"] = self._num(data, "remaining_m", 0, 10000000)
        if "eta_seconds" in data:
            payload["eta_seconds"] = int(self._num(data, "eta_seconds", 0, 7 * 86400) or 0) or None
        if data.get("destination_name"):
            payload["destination_name"] = str(data["destination_name"])[:255]
        return payload

    def _mobile_user(self):
        auth = str(request.headers.get("Authorization") or "")
        if not auth.startswith("Bearer "):
            return None
        raw = auth[7:].strip()
        if not raw:
            return None
        token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        now = self.utcnow_iso()
        row = self.get_db().execute(
            """SELECT u.id,u.name,u.email,u.role,u.is_active
               FROM auth_sessions a JOIN users u ON u.id=a.user_id
               WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>? AND u.is_active=1
               LIMIT 1""",
            (token_hash, now),
        ).fetchone()
        return row

    def _mobile_required(self, fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            user = self._mobile_user()
            if not user:
                return self._json_error("Autenticação mobile inválida ou expirada.", 401, "mobile_auth_required")
            return fn(user, *args, **kwargs)
        return wrapped

    def register(self):
        app = self.app

        @app.get("/api/vano-osint/status")
        def vano_osint_status():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            row = self._local_row(int(user["id"]))
            return jsonify({
                "ok": True,
                "configured": self.configured,
                "prompt_enabled": self.prompt_enabled,
                "consent_active": bool(row and row["consent_active"]),
                "consent_version": (row["consent_version"] if row else self.consent_version),
                "consent_at": row["consent_at"] if row else None,
                "last_sync_at": row["last_sync_at"] if row else None,
                "last_error": row["last_error"] if row else "",
                "device_registered": bool(row and row["remote_device_id"] and row["device_token_enc"]),
                "web_min_interval_s": self.web_min_interval,
            })

        @app.post("/api/vano-osint/consent")
        def vano_osint_consent():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            if not self.validate_csrf():
                return self._json_error("CSRF inválido.", 400, "csrf")
            if not self.rate_limit(f"vano-osint-consent:{user['id']}", 12, 3600):
                return self._json_error("Muitas tentativas.", 429, "rate_limited")
            data = request.get_json(silent=True) or {}
            active = bool(data.get("active"))
            uid = int(user["id"])
            if active:
                if not self.configured:
                    return self._json_error("Integração OSINT ainda não configurada no servidor.", 503, "not_configured")
                try:
                    row, _ = self._ensure_remote_device(
                        user,
                        str(data.get("device_name") or "VANO Web/App")[:120],
                        str(data.get("app_version") or "")[:80],
                    )
                    return jsonify({"ok": True, "consent_active": True, "consent_at": row["consent_at"]})
                except Exception as exc:
                    self._save_error(uid, str(exc))
                    return self._json_error(str(exc), 502, "osint_unavailable")

            row = self._local_row(uid)
            remote_ok = True
            if row and row["device_token_enc"]:
                token = self._decrypt_token(row["device_token_enc"])
                if token:
                    try:
                        self._request("POST", "/api/vano/v1/device/consent/revoke", token=token, payload={})
                    except Exception as exc:
                        remote_ok = False
                        self._save_error(uid, str(exc))
            now = self.utcnow_iso()
            db = self.get_db()
            if row:
                db.execute(
                    "UPDATE vano_osint_devices SET consent_active=0,consent_revoked_at=?,updated_at=? WHERE user_id=?",
                    (now, now, uid),
                )
                db.commit()
            return jsonify({"ok": True, "consent_active": False, "remote_confirmed": remote_ok})

        @app.post("/api/vano-osint/location")
        def vano_osint_location():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            if not self.validate_csrf():
                return self._json_error("CSRF inválido.", 400, "csrf")
            if not self.rate_limit(f"vano-osint-location:{user['id']}", 120, 60):
                return self._json_error("Telemetria temporariamente limitada.", 429, "rate_limited")
            try:
                payload = self._sanitize_location(request.get_json(silent=True) or {})
                body = self._forward_device(user, "POST", "/api/vano/v1/device/location", payload)
                return jsonify(body)
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_location")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.post("/api/vano-osint/route/start")
        def vano_osint_route_start():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            if not self.validate_csrf():
                return self._json_error("CSRF inválido.", 400, "csrf")
            try:
                payload = self._sanitize_route_start(request.get_json(silent=True) or {})
                return jsonify(self._forward_device(user, "POST", "/api/vano/v1/device/routes/start", payload))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_route")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.patch("/api/vano-osint/route/current")
        def vano_osint_route_update():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            if not self.validate_csrf():
                return self._json_error("CSRF inválido.", 400, "csrf")
            try:
                payload = self._sanitize_route_update(request.get_json(silent=True) or {})
                return jsonify(self._forward_device(user, "PATCH", "/api/vano/v1/device/routes/current", payload))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_route")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.post("/api/vano-osint/route/finish")
        def vano_osint_route_finish():
            user = self.current_user()
            if not user or not user["is_active"]:
                return self._json_error("Autenticação necessária.", 401, "login_required")
            if not self.validate_csrf():
                return self._json_error("CSRF inválido.", 400, "csrf")
            data = request.get_json(silent=True) or {}
            status = str(data.get("status") or "completed")[:24]
            try:
                return jsonify(self._forward_device(user, "POST", "/api/vano/v1/device/routes/current/finish", {"status": status}))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except Exception as exc:
                # Finishing is best-effort: a stale/no-active-route response
                # should not block the driver's navigation UI.
                return self._json_error(str(exc), 502, "osint_unavailable")

        # Native Android endpoints. The APK already receives a revocable
        # remember-token from /mobile/auth/exchange. These routes allow a
        # Foreground Location Service to keep sending data without a WebView.
        @app.get("/mobile/osint/status")
        @self._mobile_required
        def mobile_osint_status(user):
            row = self._local_row(int(user["id"]))
            return jsonify({
                "ok": True,
                "configured": self.configured,
                "consent_active": bool(row and row["consent_active"]),
                "device_registered": bool(row and row["remote_device_id"] and row["device_token_enc"]),
                "last_sync_at": row["last_sync_at"] if row else None,
            })

        @app.post("/mobile/osint/consent")
        @self._mobile_required
        def mobile_osint_consent(user):
            if not self.rate_limit(f"mobile-osint-consent:{user['id']}", 12, 3600):
                return self._json_error("Muitas tentativas.", 429, "rate_limited")
            data = request.get_json(silent=True) or {}
            if bool(data.get("active")):
                try:
                    row, _ = self._ensure_remote_device(
                        user,
                        str(data.get("device_name") or "VANO Android")[:120],
                        str(data.get("app_version") or "")[:80],
                    )
                    return jsonify({"ok": True, "consent_active": True, "consent_at": row["consent_at"]})
                except Exception as exc:
                    return self._json_error(str(exc), 502, "osint_unavailable")
            row = self._local_row(int(user["id"]))
            if row and row["device_token_enc"]:
                token = self._decrypt_token(row["device_token_enc"])
                if token:
                    try:
                        self._request("POST", "/api/vano/v1/device/consent/revoke", token=token, payload={})
                    except Exception:
                        pass
            now = self.utcnow_iso()
            db = self.get_db()
            if row:
                db.execute("UPDATE vano_osint_devices SET consent_active=0,consent_revoked_at=?,updated_at=? WHERE user_id=?", (now, now, int(user["id"])))
                db.commit()
            return jsonify({"ok": True, "consent_active": False})

        @app.post("/mobile/osint/location")
        @self._mobile_required
        def mobile_osint_location(user):
            if not self.rate_limit(f"mobile-osint-location:{user['id']}", 180, 60):
                return self._json_error("Telemetria temporariamente limitada.", 429, "rate_limited")
            try:
                return jsonify(self._forward_device(user, "POST", "/api/vano/v1/device/location", self._sanitize_location(request.get_json(silent=True) or {})))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_location")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.post("/mobile/osint/route/start")
        @self._mobile_required
        def mobile_osint_route_start(user):
            try:
                return jsonify(self._forward_device(user, "POST", "/api/vano/v1/device/routes/start", self._sanitize_route_start(request.get_json(silent=True) or {})))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_route")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.patch("/mobile/osint/route/current")
        @self._mobile_required
        def mobile_osint_route_update(user):
            try:
                return jsonify(self._forward_device(user, "PATCH", "/api/vano/v1/device/routes/current", self._sanitize_route_update(request.get_json(silent=True) or {})))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except ValueError as exc:
                return self._json_error(str(exc), 400, "invalid_route")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.post("/mobile/osint/route/finish")
        @self._mobile_required
        def mobile_osint_route_finish(user):
            try:
                status = str((request.get_json(silent=True) or {}).get("status") or "completed")[:24]
                return jsonify(self._forward_device(user, "POST", "/api/vano/v1/device/routes/current/finish", {"status": status}))
            except PermissionError as exc:
                return self._json_error(str(exc), 403, "consent_inactive")
            except Exception as exc:
                return self._json_error(str(exc), 502, "osint_unavailable")

        @app.get("/mobile/osint/health")
        def mobile_osint_health():
            return jsonify({"ok": True, "bridge": True, "configured": self.configured})


def register_vano_osint_bridge(app, core: dict[str, Any]):
    bridge = VanoOsintBridge(app, core)
    bridge.register()
    return bridge
