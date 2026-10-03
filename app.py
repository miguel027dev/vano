import os
import re
import math
import time
import json
import secrets
import hashlib
import hmac
import difflib
import threading
import copy
import heapq
import unicodedata
import ipaddress
import csv
import io
import queue
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from urllib.parse import urlparse, urlencode

import requests
from requests.adapters import HTTPAdapter
from vano_ai_routing import rerank_routes_with_ai
from vano_radars import discover_radars, persist_osm_awareness, query_radars, source_catalog
try:
    from flask_compress import Compress
except Exception:
    class Compress:
        def __init__(self, app=None):
            self.app = app
from db_backend import connect_db, table_columns, IntegrityError
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import (
    Flask, render_template, request, redirect, url_for, session,
    flash, jsonify, g, abort, has_request_context, has_app_context
)
from vano.bootstrap import install as _vano_install

_vano_install(globals(), "vano.config")
_vano_install(globals(), "vano.services.nodes")
_vano_install(globals(), "vano.services.route_cache")
def _safe_header_env(name, fallback):
    value = str(os.environ.get(name, fallback) or fallback).strip()
    return fallback if "\r" in value or "\n" in value else value

FRAME_ANCESTORS = _safe_header_env("VANO_FRAME_ANCESTORS", "*")
VANO_PERMISSIONS_POLICY = _safe_header_env("VANO_PERMISSIONS_POLICY", "geolocation=(self), fullscreen=(self), clipboard-read=(self), clipboard-write=(self), camera=(), microphone=(), payment=(), usb=()")
VANO_TRUSTED_HOSTS = [x.strip() for x in os.environ.get("VANO_TRUSTED_HOSTS", "").split(",") if x.strip()]
SECURE_COOKIE = True

app = Flask(__name__, template_folder="templates")
app.config.update(
    COMPRESS_MIMETYPES=["text/html", "text/css", "text/javascript", "application/javascript", "application/json", "image/svg+xml"],
    COMPRESS_LEVEL=3,
    COMPRESS_MIN_SIZE=512,
    SEND_FILE_MAX_AGE_DEFAULT=timedelta(days=30),
)
Compress(app)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=VANO_PROXY_HOPS, x_proto=VANO_PROXY_HOPS, x_host=VANO_PROXY_HOPS)
app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    # Cross-site iframes need SameSite=None + Secure. Flask 3.1 also supports
    # partitioned cookies, which improves embedded-session compatibility in
    # browsers that restrict normal third-party cookies.
    SESSION_COOKIE_SAMESITE="None" if EMBED_MODE else "Lax",
    SESSION_COOKIE_SECURE=SECURE_COOKIE,
    SESSION_COOKIE_PARTITIONED=EMBED_MODE,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
    PERMANENT_SESSION_LIFETIME=timedelta(days=REMEMBER_LOGIN_DAYS),
    TRUSTED_HOSTS=VANO_TRUSTED_HOSTS or None,
)

_vano_install(globals(), "vano.security.headers")
_vano_install(globals(), "vano.infrastructure.database")
_vano_install(globals(), "vano.infrastructure.observability")
_vano_install(globals(), "vano.security.auth")
_vano_install(globals(), "vano.services.safety")
_vano_install(globals(), "vano.services.search")
_vano_install(globals(), "vano.services.routing")
_vano_install(globals(), "vano.services.context")
_vano_install(globals(), "vano.routes.core")
_vano_install(globals(), "vano.routes.auth")
_vano_install(globals(), "vano.routes.community")
_vano_install(globals(), "vano.routes.public")
_vano_install(globals(), "vano.routes.admin")
_vano_install(globals(), "vano.routes.api")
_vano_install(globals(), "vano.routes.routing")
from vano.services.indexnow import start_indexnow_submitter as _start_indexnow_submitter

def _error_response(code, title, message, error_code):
    if request.path.startswith(("/api/", "/mobile/")):
        response = jsonify({"ok": False, "error": error_code, "message": message, "status": code})
        response.status_code = code
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response
    return render_template("error.html", code=code, title=title, message=message), code


@app.errorhandler(400)
def bad_request(_e):
    return _error_response(400, "Solicitação inválida", "Não foi possível processar essa solicitação. Confira os dados e tente novamente.", "bad_request")


@app.errorhandler(401)
def unauthorized(_e):
    return _error_response(401, "Entre para continuar", "Sua sessão não está disponível ou expirou.", "unauthorized")


@app.errorhandler(403)
def forbidden(_e):
    return _error_response(403, "Acesso negado", "Você não tem permissão para acessar esta área.", "forbidden")


@app.errorhandler(404)
def not_found(_e):
    return _error_response(404, "Página não encontrada", "O endereço solicitado não existe ou foi movido.", "not_found")


@app.errorhandler(429)
def too_many_requests(_e):
    payload = _error_response(429, "Muitas tentativas", "Você fez muitas solicitações em pouco tempo. Aguarde e tente novamente.", "rate_limited")
    response = app.make_response(payload)
    response.headers.setdefault("Retry-After", "60")
    return response


@app.errorhandler(500)
def server_error(_e):
    return _error_response(500, "Erro interno", "Algo inesperado aconteceu. Tente novamente em instantes.", "internal_error")


@app.errorhandler(502)
def bad_gateway(_e):
    return _error_response(502, "Serviço temporariamente indisponível", "Um serviço necessário não respondeu corretamente. Tente novamente.", "bad_gateway")


@app.errorhandler(503)
def service_unavailable(_e):
    return _error_response(503, "Serviço temporariamente indisponível", "O VANO MAPS está indisponível por alguns instantes. Tente novamente.", "service_unavailable")


@app.errorhandler(504)
def gateway_timeout(_e):
    return _error_response(504, "Tempo limite excedido", "Um serviço de rota demorou mais do que o esperado. Tente novamente.", "gateway_timeout")


@app.cli.command("init-db")
def init_db_command():
    init_db()
    print("Banco PostgreSQL inicializado/atualizado com sucesso.")


def _acquire_keepalive_leader():
    """Keep a single scheduler even if Gunicorn is later configured with >1 worker."""
    global _KEEPALIVE_LEADER_FD
    try:
        import fcntl
        fd = open("/tmp/vano-keepalive.lock", "a+")
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fd.close()
            return False
        _KEEPALIVE_LEADER_FD = fd
        return True
    except ImportError:
        # Current Render config uses one Gunicorn worker. On a non-POSIX host,
        # the in-process guard still prevents duplicate threads in that worker.
        return True


def _keepalive_cycle(session_client):
    headers = {
        "User-Agent": "VANO MAPS-KeepAlive/1.0",
        "Cache-Control": "no-cache",
        "Accept": "application/json",
    }
    get_url = f"{VANO_KEEPALIVE_URL}/api/keepalive"
    post_url = f"{VANO_KEEPALIVE_URL}/api/keepalive"
    results = []
    try:
        response = session_client.get(get_url, headers=headers, timeout=VANO_KEEPALIVE_TIMEOUT, allow_redirects=True)
        results.append(("GET", response.status_code))
    except requests.RequestException as exc:
        results.append(("GET", type(exc).__name__))
    try:
        response = session_client.post(
            post_url,
            headers={**headers, "Content-Type": "application/json"},
            json={"source": "vano-backend", "ts": int(time.time())},
            timeout=VANO_KEEPALIVE_TIMEOUT,
            allow_redirects=True,
        )
        results.append(("POST", response.status_code))
    except requests.RequestException as exc:
        results.append(("POST", type(exc).__name__))
    return results


def _keepalive_worker():
    time.sleep(VANO_KEEPALIVE_START_DELAY)
    client = requests.Session()
    while True:
        started = time.monotonic()
        results = _keepalive_cycle(client)
        failures = [f"{method}={status}" for method, status in results if not isinstance(status, int) or not (200 <= status < 400)]
        if failures:
            app.logger.warning("VANO MAPS keep-alive: %s", ", ".join(failures))
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, VANO_KEEPALIVE_INTERVAL - elapsed))


def start_keepalive_worker():
    global _KEEPALIVE_THREAD_STARTED
    if not VANO_KEEPALIVE_ENABLED or not VANO_KEEPALIVE_URL.startswith(("http://", "https://")):
        return False
    with _KEEPALIVE_THREAD_LOCK:
        if _KEEPALIVE_THREAD_STARTED:
            return True
        if not _acquire_keepalive_leader():
            return False
        thread = threading.Thread(target=_keepalive_worker, name="vano-keepalive", daemon=True)
        thread.start()
        _KEEPALIVE_THREAD_STARTED = True
        return True



# VANO_OSINT_ADMIN_BRIDGE_V1
from vano_osint_bridge import register_vano_osint_bridge as _register_vano_osint_bridge
_VANO_OSINT_BRIDGE = _register_vano_osint_bridge(app, globals())
# /VANO_OSINT_ADMIN_BRIDGE_V1

# VANO_ANDROID_MOBILE_BRIDGE_V2
from mobile_routes import register_mobile_routes as _register_vano_mobile_routes
_register_vano_mobile_routes(app, globals())
# /VANO_ANDROID_MOBILE_BRIDGE_V2

if os.environ.get("VANO_DB_INIT_ONLY", "0").strip().lower() not in {"1", "true", "yes", "on"}:
    start_keepalive_worker()
    _start_indexnow_submitter(app, base_dir=BASE_DIR, public_site_url=PUBLIC_SITE_URL)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
