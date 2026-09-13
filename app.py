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

APP_NAME = "VANO MAPS"
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
VANO_BUILD_ID = os.environ.get("VANO_BUILD_ID", "313.0.0").strip() or "313.0.0"

def load_local_env():
    """Carrega .env simples sem dependência extra. Variáveis já exportadas têm prioridade."""
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        pass

load_local_env()

# V133 — canonical public origin used by SEO files and metadata. Keep this
# stable even when Render serves the same app through an onrender.com hostname.
PUBLIC_SITE_URL = os.environ.get("PUBLIC_SITE_URL", "").strip().rstrip("/")
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER or "noreply@localhost").strip()
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "1").strip().lower() not in {"0","false","no","off"}
SEO_INDEXABLE_ENDPOINTS = {
    "index", "about", "sobre", "help_page", "privacy_policy", "terms_of_use",
    "what_is_vano", "seo_avoid_traffic", "seo_waze_alternative", "route_benchmark_page",
    "account_delete_page",
}
SEO_CANONICAL_PATHS = {
    "index": "/",
    "about": "/about",
    "sobre": "/sobre",
    "help_page": "/help",
    "privacy_policy": "/politica-de-privacidade",
    "terms_of_use": "/termos-de-uso",
    "what_is_vano": "/o-que-e-vano-maps",
    "seo_avoid_traffic": "/rotas-para-evitar-transito",
    "seo_waze_alternative": "/alternativa-ao-waze",
    "route_benchmark_page": "/benchmark-de-rotas",
    "account_delete_page": "/excluir-conta",
}

def _load_session_secret():
    configured = (os.environ.get("VANO_SECRET_KEY", "").strip() or os.environ.get("RAIRO_SECRET_KEY", "").strip())
    if configured:
        return configured
    # Never fall back to a known public development secret. A shared temporary
    # file keeps all Gunicorn workers on the same key for this instance. Render
    # restarts rotate it, so production should still configure RAIRO_SECRET_KEY.
    path = (os.environ.get("VANO_EPHEMERAL_SECRET_FILE", "").strip() or os.environ.get("RAIRO_EPHEMERAL_SECRET_FILE", "").strip() or "/tmp/vano-session-secret")
    try:
        import fcntl
        with open(path, "a+", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            fh.seek(0); value = fh.read().strip()
            if not value:
                value = secrets.token_urlsafe(64)
                fh.seek(0); fh.truncate(); fh.write(value); fh.flush()
                try: os.fchmod(fh.fileno(), 0o600)
                except OSError: pass
            return value
    except Exception:
        # Last-resort secure randomness is preferable to a published constant.
        # In this branch multi-worker sessions may not persist; configure the env.
        return secrets.token_urlsafe(64)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SECRET_KEY = _load_session_secret()
MAPBOX_ACCESS_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN", "").strip()
# X17 — environmental map styles. MAPBOX_STYLE remains as a backwards-compatible
# fallback, but each mood can be configured independently in Render/.env.
MAPBOX_STYLE = os.environ.get("MAPBOX_STYLE", "mapbox://styles/mapbox/standard").strip()
MAPBOX_STYLE_DAY = os.environ.get("MAPBOX_STYLE_DAY", MAPBOX_STYLE or "mapbox://styles/mapbox/standard").strip()
MAPBOX_STYLE_AFTERNOON = os.environ.get("MAPBOX_STYLE_AFTERNOON", "mapbox://styles/miguwl0287/cmixney1h001501s111340npb").strip()
MAPBOX_STYLE_NIGHT = os.environ.get("MAPBOX_STYLE_NIGHT", "mapbox://styles/miguwl0287/cmiwm8kse007v01s023vnadqb").strip()
MAPBOX_STYLE_BLACK = os.environ.get("MAPBOX_STYLE_BLACK", "mapbox://styles/miguwl0287/cmtce1pyo005901qognhbf5wo").strip()
MAPBOX_STYLE_RAIN = os.environ.get("MAPBOX_STYLE_RAIN", "mapbox://styles/miguwl0287/cmszu604f001x01rw8gcyh06b").strip()

def _map_color_env(name, fallback):
    value = os.environ.get(name, fallback).strip()
    return value if re.fullmatch(r"#[0-9A-Fa-f]{6}", value or "") else fallback

MAPBOX_ACCENT_PRESETS = {
    "violet": {
        "primary": _map_color_env("MAPBOX_ACCENT_VIOLET", "#F59A62"),
        "light": _map_color_env("MAPBOX_ACCENT_VIOLET_LIGHT", "#FFC39B"),
        "alt": _map_color_env("MAPBOX_ACCENT_VIOLET_ALT", "#D9703F"),
    },
    "orange": {
        "primary": _map_color_env("MAPBOX_ACCENT_ORANGE", "#FFC39B"),
        "light": _map_color_env("MAPBOX_ACCENT_ORANGE_LIGHT", "#FFE0CA"),
        "alt": _map_color_env("MAPBOX_ACCENT_ORANGE_ALT", "#F59A62"),
    },
    "blue": {
        "primary": _map_color_env("MAPBOX_ACCENT_BLUE", "#D9703F"),
        "light": _map_color_env("MAPBOX_ACCENT_BLUE_LIGHT", "#F59A62"),
        "alt": _map_color_env("MAPBOX_ACCENT_BLUE_ALT", "#FFC39B"),
    },
    "green": {
        "primary": _map_color_env("MAPBOX_ACCENT_GREEN", "#E8D8C9"),
        "light": _map_color_env("MAPBOX_ACCENT_GREEN_LIGHT", "#FFFBF2"),
        "alt": _map_color_env("MAPBOX_ACCENT_GREEN_ALT", "#C9B7A8"),
    },
    "rose": {
        "primary": _map_color_env("MAPBOX_ACCENT_ROSE", "#27231F"),
        "light": _map_color_env("MAPBOX_ACCENT_ROSE_LIGHT", "#706861"),
        "alt": _map_color_env("MAPBOX_ACCENT_ROSE_ALT", "#F59A62"),
    },
}
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6"
MAPBOX_SEARCHBOX_URL = "https://api.mapbox.com/search/searchbox/v1"
BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2"
VIACEP_URL = "https://viacep.com.br/ws"
MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox"
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter").strip()
OPEN_METEO_URL = os.environ.get("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast").strip()
OPENROUTESERVICE_API_KEY = os.environ.get("OPENROUTESERVICE_API_KEY", "").strip()
OPENROUTESERVICE_URL = os.environ.get("OPENROUTESERVICE_URL", "https://api.heigit.org/openrouteservice/v2/directions").strip().rstrip("/")
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "").strip().rstrip("/")
# V164 — event-aware routing. Optional structured feeds can be added later via
# env without changing code; OSM venue discovery + live traffic works by default.
RAIGO_EVENT_INTELLIGENCE_ENABLED = os.environ.get("RAIGO_EVENT_INTELLIGENCE_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
RAIGO_EVENT_FEED_URLS = [x.strip() for x in os.environ.get("RAIGO_EVENT_FEED_URLS", "").split(",") if x.strip()][:3]
RAIGO_EVENT_SCAN_MAX_KM = max(8.0, min(180.0, float(os.environ.get("RAIGO_EVENT_SCAN_MAX_KM", "90") or 90)))
RAIGO_ESPN_MATCH_FEED_ENABLED = os.environ.get("RAIGO_ESPN_MATCH_FEED_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
RAIGO_ESPN_SOCCER_LEAGUES = [x.strip() for x in os.environ.get("RAIGO_ESPN_SOCCER_LEAGUES", "bra.1,bra.2,bra.copa_do_brazil,conmebol.libertadores,conmebol.sudamericana").split(",") if x.strip()][:8]

# V48 — Mapbox-only routing/search. HERE is intentionally disabled/removed for now.

# V42 — lightweight self keep-alive. One GET + one POST every 120 seconds.
# The URL and switch are environment-configurable so staging/local environments
# can disable it without changing source code.
RAIRO_KEEPALIVE_URL = (os.environ.get("VANO_KEEPALIVE_URL", "").strip() or os.environ.get("RAIRO_KEEPALIVE_URL", "").strip() or "https://vanomaps.online").rstrip("/")
RAIRO_KEEPALIVE_ENABLED = os.environ.get("RAIRO_KEEPALIVE_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
RAIRO_KEEPALIVE_INTERVAL = max(120, int(os.environ.get("RAIRO_KEEPALIVE_INTERVAL", "120") or 120))
RAIRO_KEEPALIVE_TIMEOUT = max(2, min(15, int(os.environ.get("RAIRO_KEEPALIVE_TIMEOUT", "7") or 7)))
RAIRO_KEEPALIVE_START_DELAY = max(3, min(60, int(os.environ.get("RAIRO_KEEPALIVE_START_DELAY", "12") or 12)))
_KEEPALIVE_THREAD_LOCK = threading.Lock()
_KEEPALIVE_THREAD_STARTED = False
_KEEPALIVE_LEADER_FD = None

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

# Number of reverse-proxy hops whose forwarding headers are trusted. Render's
# normal setup is one hop; deployments behind an additional CDN/proxy can set 2.
RAIRO_PROXY_HOPS = max(0, min(5, int(os.environ.get("RAIRO_PROXY_HOPS", "1") or 1)))

# V46 — designated owner account + explicit motorized profiles.
# Administrative identity must come from deployment configuration, never from
# a source-code allowlist. Existing users whose DB role is already "admin" keep
# that role; configured addresses only permit VERIFIED Google identities to be
# promoted/provisioned as administrators.
RAIRO_OWNER_EMAIL = os.environ.get("RAIRO_OWNER_EMAIL", "").strip().lower()
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.environ.get("RAIRO_ADMIN_EMAILS", "").split(",")
    if email.strip()
}
if RAIRO_OWNER_EMAIL:
    ADMIN_EMAILS.add(RAIRO_OWNER_EMAIL)
MOTORIZED_PROFILES = {"driving", "motorcycle"}


# V85 — distributed infrastructure dashboard. The public URLs/regions are safe
# configuration metadata only; secrets/tokens are intentionally never exposed.
RAIRO_NODE_COUNT = max(1, min(5000, int(os.environ.get("RAIRO_NODE_COUNT", "15") or 15)))
RAIRO_NODE_CAPACITY = max(1, min(100, int(os.environ.get("RAIRO_NODE_CAPACITY", "4") or 4)))
RAIRO_NODE_HEALTH_PATH = os.environ.get("RAIRO_NODE_HEALTH_PATH", "/healthz").strip() or "/healthz"
RAIRO_NODE_CHECK_TIMEOUT = max(0.7, min(8.0, float(os.environ.get("RAIRO_NODE_CHECK_TIMEOUT", "2.8") or 2.8)))
RAIRO_NODE_STATUS_TTL = max(4, min(120, int(os.environ.get("RAIRO_NODE_STATUS_TTL", "20") or 20)))
RAIRO_NODE_STATUS_CACHE = {}
RAIRO_NODE_STATUS_LOCK = threading.Lock()
RAIRO_DISTRIBUTED_ROUTING_ENABLED = os.environ.get("RAIRO_DISTRIBUTED_ROUTING_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
RAIRO_NODE_ROUTE_TIMEOUT = max(4.0, min(30.0, float(os.environ.get("RAIRO_NODE_ROUTE_TIMEOUT", "10") or 10)))
RAIRO_NODE_ROUTE_ATTEMPTS = max(1, min(6, int(os.environ.get("RAIRO_NODE_ROUTE_ATTEMPTS", "2") or 2)))
# V123.3 — heavy-route orchestration. Routes from 8 km up to 3,000 km can use
# hedged requests across multiple healthy Route Nodes. A hedge is launched only
# when the previous worker is slow/failing, avoiding a naive N-way duplicate on
# every trip (important because Mapbox limits are per access token, not server).
RAIRO_HEAVY_ROUTE_MIN_KM = max(0.0, min(5000.0, float(os.environ.get("RAIRO_HEAVY_ROUTE_MIN_KM", "8") or 8)))
RAIRO_HEAVY_ROUTE_MAX_KM = max(RAIRO_HEAVY_ROUTE_MIN_KM, min(10000.0, float(os.environ.get("RAIRO_HEAVY_ROUTE_MAX_KM", "3000") or 3000)))
RAIRO_HEAVY_ROUTE_MAX_FANOUT = max(2, min(8, int(os.environ.get("RAIRO_HEAVY_ROUTE_MAX_FANOUT", "5") or 5)))
RAIRO_HEAVY_ROUTE_TOTAL_ATTEMPTS = max(2, min(16, int(os.environ.get("RAIRO_HEAVY_ROUTE_TOTAL_ATTEMPTS", "8") or 8)))
RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS = max(80, min(1500, int(os.environ.get("RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS", "650") or 650)))
RAIRO_HEAVY_ROUTE_TIMEOUT_MAX = max(20.0, min(90.0, float(os.environ.get("RAIRO_HEAVY_ROUTE_TIMEOUT_MAX", "55") or 55)))
RAIRO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT = max(0.50, min(0.98, float(os.environ.get("RAIRO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT", "0.86") or 0.86)))
CENTRAL_API_SECRET = os.environ.get("CENTRAL_API_SECRET", "").strip()
RAIRO_ALLOW_HTTP_NODES = os.environ.get("RAIRO_ALLOW_HTTP_NODES", "0").strip().lower() in {"1", "true", "yes", "on"}
_NODE_CONFIG_TABLE_LOCK = threading.Lock()
_NODE_CONFIG_TABLE_READY = False
_NODE_CONFIG_CACHE = {}
_NODE_CONFIG_CACHE_LOCK = threading.Lock()
_NODE_CONFIG_CACHE_TTL = max(3, min(60, int(os.environ.get("RAIRO_NODE_CONFIG_CACHE_TTL", "12") or 12)))
_NODE_REGISTRY_CACHE = {"ts": 0.0, "configs": []}
_NODE_REGISTRY_LOCK = threading.Lock()
_NODE_REGISTRY_TTL = max(2, min(60, int(os.environ.get("RAIRO_NODE_REGISTRY_TTL", "15") or 15)))
_NODE_REGISTRY_LIMIT = min(5000, max(32, int(os.environ.get("RAIRO_NODE_REGISTRY_LIMIT", str(max(RAIRO_NODE_COUNT, 128))) or max(RAIRO_NODE_COUNT, 128))))
_NODE_DISPATCH_LOCK = threading.Lock()
_NODE_DISPATCH_CURSOR = 0
_NODE_COOLDOWN_UNTIL = {}
_NODE_COOLDOWN_LOCK = threading.Lock()
# Local reservations close the gap between health probes. Without them, several
# simultaneous Central requests can all see the same stale "free slots" value
# and stampede one worker before /healthz catches up.
_NODE_INFLIGHT = {}
_NODE_INFLIGHT_LOCK = threading.Lock()
_NODE_LOG_TABLE_LOCK = threading.Lock()
_NODE_LOG_TABLE_READY = False
_NODE_LOG_QUEUE = queue.Queue(maxsize=5000)
_NODE_LOG_WORKER_LOCK = threading.Lock()
_NODE_LOG_WORKER_STARTED = False

# V91 — persistent connection pools. Reusing DNS/TLS connections removes a
# noticeable amount of latency on repeated Mapbox and worker requests.
def _make_http_session(pool=32):
    s = requests.Session()
    adapter = HTTPAdapter(pool_connections=pool, pool_maxsize=pool, max_retries=0, pool_block=False)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

_NODE_HTTP = _make_http_session(max(64, min(512, int(os.environ.get("RAIRO_NODE_HTTP_POOL", "192") or 192))))
_MAPBOX_HTTP = _make_http_session(48)


def _env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() not in {"0", "false", "off", "no", "disabled"}


def _ensure_node_config_table():
    global _NODE_CONFIG_TABLE_READY
    if _NODE_CONFIG_TABLE_READY:
        return True
    if not has_app_context():
        return False
    with _NODE_CONFIG_TABLE_LOCK:
        if _NODE_CONFIG_TABLE_READY:
            return True
        db = get_db()
        db.execute("""
            CREATE TABLE IF NOT EXISTS rairo_node_configs (
                node_index INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                region TEXT NOT NULL DEFAULT 'Render',
                provider TEXT NOT NULL DEFAULT 'Render',
                environment TEXT NOT NULL DEFAULT 'production',
                capacity INTEGER NOT NULL DEFAULT 4,
                enabled INTEGER NOT NULL DEFAULT 1,
                drain_mode INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 100,
                health_path TEXT NOT NULL DEFAULT '/healthz',
                route_path TEXT NOT NULL DEFAULT '/v1/route/calculate',
                precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate',
                connect_timeout_s REAL NOT NULL DEFAULT 2.2,
                route_timeout_s REAL NOT NULL DEFAULT 10.0,
                cooldown_s INTEGER NOT NULL DEFAULT 20,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        columns = table_columns(db, "rairo_node_configs")
        migrations = {
            "provider": "ALTER TABLE rairo_node_configs ADD COLUMN provider TEXT NOT NULL DEFAULT 'Render'",
            "environment": "ALTER TABLE rairo_node_configs ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'",
            "drain_mode": "ALTER TABLE rairo_node_configs ADD COLUMN drain_mode INTEGER NOT NULL DEFAULT 0",
            "route_path": "ALTER TABLE rairo_node_configs ADD COLUMN route_path TEXT NOT NULL DEFAULT '/v1/route/calculate'",
            "precalc_path": "ALTER TABLE rairo_node_configs ADD COLUMN precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate'",
            "connect_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN connect_timeout_s REAL NOT NULL DEFAULT 2.2",
            "route_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN route_timeout_s REAL NOT NULL DEFAULT 10.0",
            "cooldown_s": "ALTER TABLE rairo_node_configs ADD COLUMN cooldown_s INTEGER NOT NULL DEFAULT 20",
            "notes": "ALTER TABLE rairo_node_configs ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        }
        for column, sql in migrations.items():
            if column not in columns:
                db.execute(sql)
        db.execute("CREATE INDEX IF NOT EXISTS idx_rairo_node_configs_enabled ON rairo_node_configs(enabled, priority, node_index)")
        db.commit()
        _NODE_CONFIG_TABLE_READY = True
        return True


def _ensure_node_dispatch_log_table():
    global _NODE_LOG_TABLE_READY
    if _NODE_LOG_TABLE_READY:
        return True
    if not has_app_context():
        return False
    with _NODE_LOG_TABLE_LOCK:
        if _NODE_LOG_TABLE_READY:
            return True
        db = get_db()
        db.execute("""
            CREATE TABLE IF NOT EXISTS rairo_node_dispatch_logs (
                id SERIAL PRIMARY KEY,
                node_index INTEGER NOT NULL DEFAULT 0,
                node_name TEXT NOT NULL DEFAULT '',
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                request_id TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL DEFAULT '',
                profile TEXT NOT NULL DEFAULT '',
                prefetch INTEGER NOT NULL DEFAULT 0,
                http_status INTEGER,
                success INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_node_dispatch_node_time ON rairo_node_dispatch_logs(node_index, created_at DESC)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_node_dispatch_user_time ON rairo_node_dispatch_logs(user_id, created_at DESC)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_node_dispatch_success_time ON rairo_node_dispatch_logs(success, created_at DESC)")
        db.commit()
        _NODE_LOG_TABLE_READY = True
        return True


def _node_log_worker():
    db = None
    while True:
        item = _NODE_LOG_QUEUE.get()
        try:
            if db is None:
                db = connect_db()
            db.execute(
                """INSERT INTO rairo_node_dispatch_logs(
                       node_index,node_name,user_id,request_id,mode,profile,prefetch,http_status,success,latency_ms,error,created_at
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                item,
            )
            db.commit()
        except Exception:
            try:
                if db is not None:
                    db.rollback(); db.close()
            except Exception:
                pass
            db = None
        finally:
            _NODE_LOG_QUEUE.task_done()


def _ensure_node_log_worker():
    global _NODE_LOG_WORKER_STARTED
    if _NODE_LOG_WORKER_STARTED:
        return
    with _NODE_LOG_WORKER_LOCK:
        if _NODE_LOG_WORKER_STARTED:
            return
        threading.Thread(target=_node_log_worker, name="rairo-node-telemetry", daemon=True).start()
        _NODE_LOG_WORKER_STARTED = True


def _record_node_dispatch_log(config, job_payload, prefetch, attempt, success=False):
    """Queue routing observability without adding DB latency to the user's route response."""
    try:
        user_id = session.get("user_id") if has_request_context() else None
        node_index = int((config or {}).get("index") or 0)
        item = (
            node_index,
            str((config or {}).get("name") or ("Central fallback" if node_index == 0 else ""))[:80],
            user_id,
            str((job_payload or {}).get("request_id") or "")[:100],
            str((job_payload or {}).get("mode") or "")[:24],
            str((job_payload or {}).get("profile") or "")[:24],
            1 if prefetch else 0,
            attempt.get("status") if isinstance(attempt, dict) else None,
            1 if success else 0,
            max(0, int((attempt or {}).get("latency_ms") or 0)),
            str((attempt or {}).get("error") or "")[:180],
            utcnow_iso(),
        )
        _ensure_node_log_worker()
        try:
            _NODE_LOG_QUEUE.put_nowait(item)
        except queue.Full:
            # Under extreme admin-telemetry pressure, drop oldest telemetry
            # rather than delaying navigation requests.
            try:
                _NODE_LOG_QUEUE.get_nowait(); _NODE_LOG_QUEUE.task_done()
                _NODE_LOG_QUEUE.put_nowait(item)
            except Exception:
                pass
    except Exception:
        pass


def _node_config_row(index):
    if not has_app_context():
        return None
    index = int(index)
    now = time.time()
    with _NODE_CONFIG_CACHE_LOCK:
        cached = _NODE_CONFIG_CACHE.get(index)
        if cached and now - float(cached[0]) < _NODE_CONFIG_CACHE_TTL:
            return copy.deepcopy(cached[1]) if cached[1] is not None else None
    try:
        _ensure_node_config_table()
        row = get_db().execute(
            """SELECT node_index,name,url,region,provider,environment,capacity,enabled,drain_mode,priority,
                      health_path,route_path,precalc_path,connect_timeout_s,route_timeout_s,cooldown_s,notes,created_at,updated_at
               FROM rairo_node_configs WHERE node_index=?""",
            (index,),
        ).fetchone()
        payload = dict(row) if row else None
        with _NODE_CONFIG_CACHE_LOCK:
            _NODE_CONFIG_CACHE[index] = (now, copy.deepcopy(payload))
        return payload
    except Exception:
        app.logger.exception("Could not load node %s configuration", index)
        return None


def _normalize_node_url(value):
    value = str(value or "").strip().rstrip("/")
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in ({"https", "http"} if RAIRO_ALLOW_HTTP_NODES else {"https"}):
        raise ValueError("A URL do node precisa usar HTTPS.")
    if not parsed.hostname:
        raise ValueError("URL do node inválida.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Use somente a URL base HTTPS do node, sem credenciais, query ou fragmento.")
    if parsed.path not in {"", "/"}:
        raise ValueError("Use somente a URL base do node, sem caminho adicional.")
    host = parsed.hostname.lower()
    if host in {"localhost", "127.0.0.1", "::1"} and not RAIRO_ALLOW_HTTP_NODES:
        raise ValueError("Endereço local não pode ser usado em produção.")
    try:
        ip = ipaddress.ip_address(host)
        if (ip.is_private or ip.is_loopback or ip.is_link_local) and not RAIRO_ALLOW_HTTP_NODES:
            raise ValueError("IP privado não pode ser usado como node em produção.")
    except ValueError as exc:
        # A hostname normal raises ValueError in ip_address(). Validation errors
        # raised above have a user-facing Portuguese message and must propagate.
        if str(exc).startswith(("IP privado", "Endereço local")):
            raise
    return value


def _normalize_node_path(value, fallback):
    value = str(value or fallback or "").strip()[:120]
    if not value.startswith("/") or "?" in value or "#" in value or "\\" in value:
        raise ValueError("Caminho do node inválido.")
    return value


def rairo_node_config(index):
    index = int(index)
    key = f"{index:02d}"
    url = os.environ.get(f"RAIRO_NODE_{key}_URL", "").strip().rstrip("/")
    region = os.environ.get(f"RAIRO_NODE_{key}_REGION", "Render · a configurar").strip() or "Render · a configurar"
    provider = os.environ.get(f"RAIRO_NODE_{key}_PROVIDER", "Render").strip() or "Render"
    environment = os.environ.get(f"RAIRO_NODE_{key}_ENVIRONMENT", "production").strip() or "production"
    name = os.environ.get(f"RAIRO_NODE_{key}_NAME", f"VANO MAPS Node {key}").strip() or f"VANO MAPS Node {key}"
    capacity = max(1, min(100, int(os.environ.get(f"RAIRO_NODE_{key}_CAPACITY", str(RAIRO_NODE_CAPACITY)) or RAIRO_NODE_CAPACITY)))
    enabled = _env_bool(f"RAIRO_NODE_{key}_ENABLED", True)
    drain_mode = _env_bool(f"RAIRO_NODE_{key}_DRAIN", False)
    priority = max(1, min(999, int(os.environ.get(f"RAIRO_NODE_{key}_PRIORITY", "100") or 100)))
    health_path = os.environ.get(f"RAIRO_NODE_{key}_HEALTH_PATH", RAIRO_NODE_HEALTH_PATH).strip() or RAIRO_NODE_HEALTH_PATH
    route_path = os.environ.get(f"RAIRO_NODE_{key}_ROUTE_PATH", "/v1/route/calculate").strip() or "/v1/route/calculate"
    precalc_path = os.environ.get(f"RAIRO_NODE_{key}_PRECALC_PATH", "/v1/route/precalculate").strip() or "/v1/route/precalculate"
    connect_timeout_s = max(0.5, min(8.0, float(os.environ.get(f"RAIRO_NODE_{key}_CONNECT_TIMEOUT", "2.2") or 2.2)))
    route_timeout_s = max(3.0, min(45.0, float(os.environ.get(f"RAIRO_NODE_{key}_ROUTE_TIMEOUT", str(RAIRO_NODE_ROUTE_TIMEOUT)) or RAIRO_NODE_ROUTE_TIMEOUT)))
    cooldown_s = max(0, min(300, int(os.environ.get(f"RAIRO_NODE_{key}_COOLDOWN", "20") or 20)))
    notes = ""
    source = "environment" if url else "default"
    row = _node_config_row(index)
    if row:
        url = str(row.get("url") or "").strip().rstrip("/")
        region = str(row.get("region") or region).strip() or region
        provider = str(row.get("provider") or provider).strip() or provider
        environment = str(row.get("environment") or environment).strip() or environment
        name = str(row.get("name") or name).strip() or name
        capacity = max(1, min(100, int(row.get("capacity") or capacity)))
        enabled = bool(int(row.get("enabled") or 0))
        drain_mode = bool(int(row.get("drain_mode") or 0))
        priority = max(1, min(999, int(row.get("priority") or priority)))
        health_path = str(row.get("health_path") or health_path).strip() or RAIRO_NODE_HEALTH_PATH
        route_path = str(row.get("route_path") or route_path).strip() or "/v1/route/calculate"
        precalc_path = str(row.get("precalc_path") or precalc_path).strip() or "/v1/route/precalculate"
        connect_timeout_s = max(0.5, min(8.0, float(row.get("connect_timeout_s") or connect_timeout_s)))
        route_timeout_s = max(3.0, min(45.0, float(row.get("route_timeout_s") or route_timeout_s)))
        cooldown_s = max(0, min(300, int(row.get("cooldown_s") or cooldown_s)))
        notes = str(row.get("notes") or "").strip()[:500]
        source = "admin"
    for key_name, value, fallback in (
        ("health_path", health_path, "/healthz"),
        ("route_path", route_path, "/v1/route/calculate"),
        ("precalc_path", precalc_path, "/v1/route/precalculate"),
    ):
        if not str(value).startswith("/"):
            if key_name == "health_path": health_path = "/" + str(value)
            elif key_name == "route_path": route_path = "/" + str(value)
            else: precalc_path = "/" + str(value)
    with _NODE_COOLDOWN_LOCK:
        cooldown_until = float(_NODE_COOLDOWN_UNTIL.get(index, 0) or 0)
    return {
        "id": f"{index:02d}",
        "index": index,
        "name": name,
        "url": url,
        "region": region,
        "provider": provider,
        "environment": environment,
        "capacity": capacity,
        "enabled": enabled,
        "drain_mode": drain_mode,
        "priority": priority,
        "health_path": health_path,
        "route_path": route_path,
        "precalc_path": precalc_path,
        "connect_timeout_s": round(connect_timeout_s, 2),
        "route_timeout_s": round(route_timeout_s, 2),
        "cooldown_s": cooldown_s,
        "cooldown_until": cooldown_until,
        "cooldown_active": cooldown_until > time.time(),
        "notes": notes,
        "configured": bool(url),
        "config_source": source,
    }


def save_rairo_node_config(index, payload):
    index = max(1, min(RAIRO_NODE_COUNT, int(index)))
    current = rairo_node_config(index)
    name = str(payload.get("name", current["name"]) or current["name"]).strip()[:80] or current["name"]
    region = str(payload.get("region", current["region"]) or current["region"]).strip()[:80] or "Render"
    provider = str(payload.get("provider", current.get("provider", "Render")) or "Render").strip()[:40] or "Render"
    environment = str(payload.get("environment", current.get("environment", "production")) or "production").strip()[:32] or "production"
    notes = str(payload.get("notes", current.get("notes", "")) or "").strip()[:500]
    url = _normalize_node_url(payload.get("url", current["url"]))
    try:
        capacity = max(1, min(32, int(payload.get("capacity", current["capacity"]) or current["capacity"])))
        priority = max(1, min(999, int(payload.get("priority", current.get("priority", 100)) or 100)))
        connect_timeout_s = max(0.5, min(8.0, float(payload.get("connect_timeout_s", current.get("connect_timeout_s", 2.2)) or 2.2)))
        route_timeout_s = max(3.0, min(45.0, float(payload.get("route_timeout_s", current.get("route_timeout_s", 10.0)) or 10.0)))
        cooldown_s = max(0, min(300, int(payload.get("cooldown_s", current.get("cooldown_s", 20)) or 0)))
    except (TypeError, ValueError):
        raise ValueError("Capacidade, prioridade ou timeout inválido.")
    enabled_raw = payload.get("enabled", current["enabled"])
    enabled = enabled_raw if isinstance(enabled_raw, bool) else str(enabled_raw).strip().lower() in {"1", "true", "yes", "on"}
    drain_raw = payload.get("drain_mode", current.get("drain_mode", False))
    drain_mode = drain_raw if isinstance(drain_raw, bool) else str(drain_raw).strip().lower() in {"1", "true", "yes", "on"}
    health_path = _normalize_node_path(payload.get("health_path", current["health_path"]), "/healthz")
    route_path = _normalize_node_path(payload.get("route_path", current.get("route_path")), "/v1/route/calculate")
    precalc_path = _normalize_node_path(payload.get("precalc_path", current.get("precalc_path")), "/v1/route/precalculate")
    _ensure_node_config_table()
    db = get_db()
    now = utcnow_iso()
    existing = db.execute("SELECT node_index,created_at FROM rairo_node_configs WHERE node_index=?", (index,)).fetchone()
    values = (name, url, region, provider, environment, capacity, 1 if enabled else 0, 1 if drain_mode else 0, priority,
              health_path, route_path, precalc_path, connect_timeout_s, route_timeout_s, cooldown_s, notes, now)
    if existing:
        db.execute(
            """UPDATE rairo_node_configs SET name=?,url=?,region=?,provider=?,environment=?,capacity=?,enabled=?,drain_mode=?,priority=?,
                     health_path=?,route_path=?,precalc_path=?,connect_timeout_s=?,route_timeout_s=?,cooldown_s=?,notes=?,updated_at=?
               WHERE node_index=?""",
            values + (index,),
        )
    else:
        db.execute(
            """INSERT INTO rairo_node_configs(node_index,name,url,region,provider,environment,capacity,enabled,drain_mode,priority,
                     health_path,route_path,precalc_path,connect_timeout_s,route_timeout_s,cooldown_s,notes,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (index,) + values[:-1] + (now, now),
        )
    db.commit()
    with _NODE_CONFIG_CACHE_LOCK:
        _NODE_CONFIG_CACHE.pop(index, None)
    with _NODE_REGISTRY_LOCK:
        _NODE_REGISTRY_CACHE["ts"] = 0.0
        _NODE_REGISTRY_CACHE["configs"] = []
    with RAIRO_NODE_STATUS_LOCK:
        RAIRO_NODE_STATUS_CACHE.pop(f"{index:02d}", None)
    with _NODE_COOLDOWN_LOCK:
        if not enabled or drain_mode:
            _NODE_COOLDOWN_UNTIL.pop(index, None)
    return rairo_node_config(index)


def _test_node_metrics(config, active_users=0):
    """Stable test-mode telemetry until each Render node URL is configured."""
    idx = int(config["index"])
    bucket = int(time.time() // 12)
    seed = int(hashlib.sha256(f"rairo-v85:{idx}:{bucket}".encode()).hexdigest()[:8], 16)
    latency = 54 + (seed % 78)
    jitter = 4 + ((seed >> 7) % 17)
    cpu = 12 + ((seed >> 11) % 44)
    memory = 21 + ((seed >> 17) % 42)
    rpm = max(0, int(active_users) * (4 + ((seed >> 21) % 5)) + (seed % 6))
    errors = 0 if seed % 17 else 1
    return {
        **config,
        "mode": "test",
        "status": "disabled" if not config["enabled"] else ("draining" if config.get("drain_mode") else "test"),
        "healthy": None if config["enabled"] else False,
        "latency_ms": int(latency),
        "response_avg_ms": int(latency + jitter),
        "response_p95_ms": int(latency + jitter * 3),
        "cpu_pct": int(cpu),
        "memory_pct": int(memory),
        "requests_min": int(rpm),
        "error_rate_pct": round((errors / max(1, rpm)) * 100, 2),
        "uptime_pct": 99.9 if config["enabled"] else 0.0,
        "active_users": min(int(active_users), int(config["capacity"])),
        "available_slots": max(0, int(config["capacity"]) - min(int(active_users), int(config["capacity"]))),
        "last_check": utcnow_iso(),
        "http_status": 200 if config["enabled"] else None,
        "note": "Telemetria simulada até configurar a URL do node.",
    }


def _probe_configured_node(config, active_users=0):
    if not config["enabled"]:
        base = _test_node_metrics(config, active_users)
        base.update({"mode": "real", "status": "disabled", "healthy": False, "note": "Node desativado por configuração."})
        return base
    if not config["configured"]:
        return _test_node_metrics(config, active_users)
    started = time.perf_counter()
    status = None
    healthy = False
    error = ""
    body = {}
    try:
        target = config["url"] + (config["health_path"] if str(config["health_path"]).startswith("/") else "/" + str(config["health_path"]))
        resp = _NODE_HTTP.get(target, timeout=(1.8, RAIRO_NODE_CHECK_TIMEOUT), headers={"User-Agent": "VANO MAPS-Central-Health/91", "Accept": "application/json"})
        status = int(resp.status_code)
        http_ok = 200 <= status < 400
        healthy = http_ok
        try:
            body = resp.json() if resp.content else {}
            if not isinstance(body, dict): body = {}
        except Exception:
            body = {}
        # Route Node /healthz intentionally returns HTTP 200 even when the
        # process is alive but the routing engine is not ready (for example,
        # MAPBOX_ACCESS_TOKEN is missing). Treat that as DEGRADED, not as an
        # HTTP health-check failure.
        if body.get("healthy") is False:
            healthy = False
    except Exception as exc:
        error = type(exc).__name__
    latency = max(1, int((time.perf_counter() - started) * 1000))
    previous = None
    with RAIRO_NODE_STATUS_LOCK:
        previous = RAIRO_NODE_STATUS_CACHE.get(config["id"], {}).get("payload")
    reported_avg = body.get("response_avg_ms")
    reported_p95 = body.get("response_p95_ms")
    avg = int(float(reported_avg)) if reported_avg is not None else (latency if not previous else int((float(previous.get("response_avg_ms") or latency) * 0.65) + latency * 0.35))
    p95 = int(float(reported_p95)) if reported_p95 is not None else max(latency, int(avg * 1.35))
    capacity = max(1, min(100, int(body.get("capacity") or config["capacity"])))
    active_jobs = max(0, min(capacity, int(body.get("active_jobs") or 0))) if body else 0
    available_slots = max(0, int(body.get("available_slots") if body.get("available_slots") is not None else capacity - active_jobs))
    rpm = int(float(body.get("requests_min") or 0)) if body else (int(previous.get("requests_min") or 0) if previous else 0)
    cpu = body.get("cpu_pct")
    memory = body.get("memory_pct")
    error_rate = body.get("error_rate_pct")
    uptime_s = body.get("uptime_s")
    mapbox_ready = body.get("mapbox_ready") if isinstance(body, dict) else None
    process_alive = bool(status is not None and 200 <= status < 400)
    if healthy and config.get("drain_mode"):
        node_status = "draining"
    elif healthy:
        node_status = "online"
    elif process_alive:
        node_status = "degraded"
    else:
        node_status = "offline"

    if healthy and config.get("drain_mode"):
        health_note = "Node saudável em drain mode: health-check ativo, sem receber novas rotas."
    elif healthy:
        health_note = "Health-check real do Route Node."
    elif process_alive and mapbox_ready is False:
        reason = str(body.get("ready_reason") or "infraestrutura de mapas ausente ou não pronta")
        health_note = f"Node online, mas degradado: {reason}."
    elif process_alive:
        health_note = "Node respondeu HTTP 200, mas informou que ainda não está pronto para calcular rotas."
    else:
        health_note = f"Falha no health-check: {error or ('HTTP '+str(status) if status else 'sem resposta')}."

    return {
        **config,
        "capacity": capacity,
        "mode": "real",
        "status": node_status,
        "healthy": healthy,
        "process_alive": process_alive,
        "mapbox_ready": mapbox_ready,
        "latency_ms": latency,
        "response_avg_ms": max(0, avg),
        "response_p95_ms": max(0, p95),
        "cpu_pct": None if cpu is None else round(float(cpu), 1),
        "memory_pct": None if memory is None else round(float(memory), 1),
        "process_memory_mb": body.get("process_memory_mb"),
        "requests_min": max(0, rpm),
        "error_rate_pct": round(float(error_rate or 0), 2),
        "uptime_pct": 100.0 if healthy else 0.0,
        "uptime_s": int(float(uptime_s or 0)),
        "active_users": active_jobs,
        "active_jobs": active_jobs,
        "available_slots": available_slots,
        "occupancy_pct": round(100 * active_jobs / max(1, capacity), 1),
        "cache_hit_pct": round(float(body.get("cache_hit_pct") or 0), 1) if body else 0.0,
        "cache_mode": str(body.get("cache_mode") or "—") if body else "—",
        "node_version": str(body.get("version") or "") if body else "",
        "last_check": utcnow_iso(),
        "http_status": status,
        "note": health_note,
    }


def _active_user_count(minutes=15):
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max(1, int(minutes)))).isoformat()
    try:
        row = get_db().execute("SELECT COUNT(DISTINCT user_id) AS n FROM user_access_log WHERE last_seen_at>=?", (cutoff,)).fetchone()
        return int(row["n"] or 0) if row else 0
    except Exception:
        return 0


def _active_user_windows():
    return {
        "active_now_5m": _active_user_count(5),
        "active_15m": _active_user_count(15),
        "active_60m": _active_user_count(60),
    }


def admin_node_snapshot(refresh=False):
    # Rendering/probing thousands of cards on one request would itself become a
    # control-plane outage. Show configured nodes first and cap the visual slice;
    # any node remains directly manageable by /admin/servers/<index>.
    view_limit = max(15, min(500, int(os.environ.get("RAIRO_ADMIN_NODE_VIEW_LIMIT", "160") or 160)))
    registry = _configured_node_registry()
    configs = list(registry[:view_limit])
    existing = {int(c["index"]) for c in configs}
    if len(configs) < min(view_limit, RAIRO_NODE_COUNT):
        for i in range(1, RAIRO_NODE_COUNT + 1):
            if i in existing:
                continue
            configs.append(rairo_node_config(i))
            if len(configs) >= min(view_limit, RAIRO_NODE_COUNT):
                break
    windows = _active_user_windows()
    active_total = windows["active_now_5m"]
    allocations = []
    remaining = active_total
    for cfg in configs:
        assigned = min(cfg["capacity"], remaining) if cfg["enabled"] else 0
        allocations.append(assigned)
        remaining = max(0, remaining - assigned)

    now = time.time()
    nodes = [None] * len(configs)
    to_probe = []
    for pos, cfg in enumerate(configs):
        with RAIRO_NODE_STATUS_LOCK:
            cached = RAIRO_NODE_STATUS_CACHE.get(cfg["id"])
        if cfg["configured"] and refresh and (not cached or now - float(cached.get("ts", 0)) >= 1.0):
            to_probe.append((pos, cfg, allocations[pos]))
        elif cfg["configured"] and cached and now - float(cached.get("ts", 0)) < RAIRO_NODE_STATUS_TTL:
            nodes[pos] = dict(cached["payload"])
        else:
            nodes[pos] = _test_node_metrics(cfg, allocations[pos]) if not cfg["configured"] else {
                **_test_node_metrics(cfg, allocations[pos]), "mode": "real", "status": "pending", "healthy": None,
                "note": "URL configurada. Execute Testar todos para medir o node real."
            }

    if to_probe:
        workers = min(24, len(to_probe))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_probe_configured_node, cfg, users): (pos, cfg) for pos, cfg, users in to_probe}
            for future, (pos, cfg) in list(futures.items()):
                try:
                    payload = future.result(timeout=RAIRO_NODE_CHECK_TIMEOUT + 1.0)
                except Exception:
                    payload = {**_test_node_metrics(cfg, allocations[pos]), "mode": "real", "status": "offline", "healthy": False, "note": "Falha ao testar o node."}
                nodes[pos] = payload
                with RAIRO_NODE_STATUS_LOCK:
                    RAIRO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": dict(payload)}

    # Capacity summary uses the full configured registry, not only visible cards.
    total_capacity = sum(int(c.get("capacity") or 0) for c in registry if c.get("enabled") and not c.get("drain_mode"))
    configured = len(registry)
    healthy = sum(1 for c in registry if (RAIRO_NODE_STATUS_CACHE.get(c["id"]) or {}).get("payload",{}).get("healthy") is True)
    real_latencies = [int(n["latency_ms"]) for n in nodes if n.get("latency_ms") is not None and n.get("healthy") is not False]
    avg_latency = round(sum(real_latencies) / len(real_latencies)) if real_latencies else 0
    used_slots = 0
    for c in registry:
        with RAIRO_NODE_STATUS_LOCK:
            cached=(RAIRO_NODE_STATUS_CACHE.get(c["id"]) or {}).get("payload") or {}
        used_slots += max(0,int(cached.get("active_jobs") if cached.get("active_jobs") is not None else cached.get("active_users") or 0))
    used_slots = min(used_slots, total_capacity)
    occupancy_pct = round((100 * used_slots / max(1, total_capacity)), 1) if total_capacity else 0
    for n in nodes:
        active = max(0, int(n.get("active_jobs") if n.get("active_jobs") is not None else n.get("active_users") or 0))
        n["active_users"] = active; n["active_jobs"] = active
        n["available_slots"] = max(0, int(n.get("capacity") or 0) - active)
        n["occupancy_pct"] = round((100 * active / max(1, int(n.get("capacity") or 1))), 1)
    return {
        "nodes": nodes,
        "summary": {
            "total_nodes": RAIRO_NODE_COUNT,
            "rendered_nodes": len(nodes),
            "configured_nodes": configured,
            "healthy_nodes": healthy,
            "test_nodes": sum(1 for n in nodes if n.get("mode") == "test"),
            "active_users": active_total,
            "active_users_15m": windows["active_15m"], "active_users_60m": windows["active_60m"],
            "user_available_slots": max(0, total_capacity - min(active_total, total_capacity)),
            "user_occupancy_pct": round(100 * min(active_total, total_capacity) / max(1, total_capacity), 1) if total_capacity else 0,
            "used_slots": used_slots, "capacity": total_capacity, "available_slots": max(0, total_capacity - used_slots),
            "overflow_users": max(0, active_total - total_capacity), "active_jobs": used_slots,
            "occupancy_pct": occupancy_pct, "avg_latency_ms": avg_latency, "max_users_per_node": RAIRO_NODE_CAPACITY,
        },
        "generated_at": utcnow_iso(),
    }



def _configured_node_registry():
    """Load all configured workers with one PostgreSQL query, then cache it.

    The old dispatcher called rairo_node_config() once per slot. That works for
    15 workers but becomes thousands of DB/cache lookups at global scale. V93
    builds a compact registry in one query and reuses it for a few seconds.
    """
    now = time.time()
    with _NODE_REGISTRY_LOCK:
        if now - float(_NODE_REGISTRY_CACHE.get("ts") or 0) < _NODE_REGISTRY_TTL:
            return list(_NODE_REGISTRY_CACHE.get("configs") or [])
    configs = []
    seen = set()
    try:
        _ensure_node_config_table()
        rows = get_db().execute(
            """SELECT node_index,name,url,region,provider,environment,capacity,enabled,drain_mode,priority,
                      health_path,route_path,precalc_path,connect_timeout_s,route_timeout_s,cooldown_s,notes,created_at,updated_at
               FROM rairo_node_configs
               WHERE enabled=1 AND drain_mode=0 AND url<>''
               ORDER BY priority ASC,node_index ASC LIMIT ?""",
            (_NODE_REGISTRY_LIMIT,),
        ).fetchall()
        with _NODE_CONFIG_CACHE_LOCK:
            for row in rows:
                payload = dict(row)
                idx = int(payload.get("node_index") or 0)
                if idx < 1 or idx > 5000:
                    continue
                _NODE_CONFIG_CACHE[idx] = (now, copy.deepcopy(payload))
                seen.add(idx)
        for idx in sorted(seen):
            cfg = rairo_node_config(idx)
            if cfg.get("configured") and cfg.get("enabled") and not cfg.get("drain_mode"):
                configs.append(cfg)
    except Exception:
        app.logger.exception("Could not refresh VANO MAPS node registry")

    # Environment-only nodes are still supported without turning the registry
    # refresh into N database reads. Also discover explicit indexes above the old
    # RAIRO_NODE_COUNT slot ceiling so scaling from 15 -> 30 workers is automatic.
    env_indexes = set(range(1, RAIRO_NODE_COUNT + 1))
    for env_key in os.environ:
        match = re.fullmatch(r"RAIRO_NODE_(\d+)_URL", str(env_key))
        if match:
            try:
                idx = int(match.group(1))
                if 1 <= idx <= 5000:
                    env_indexes.add(idx)
            except ValueError:
                pass
    for idx in sorted(env_indexes):
        if idx in seen or len(configs) >= _NODE_REGISTRY_LIMIT:
            continue
        key = f"{idx:02d}"
        if not str(os.environ.get(f"RAIRO_NODE_{key}_URL", "")).strip():
            continue
        cfg = rairo_node_config(idx)
        if cfg.get("configured") and cfg.get("enabled") and not cfg.get("drain_mode"):
            configs.append(cfg)

    with _NODE_REGISTRY_LOCK:
        _NODE_REGISTRY_CACHE["ts"] = now
        _NODE_REGISTRY_CACHE["configs"] = copy.deepcopy(configs)
    return configs


def _route_region_hints(job_payload):
    """Return coarse deployment-region hints from route coordinates.

    Region names remain operator-controlled (for example ``sa-east``, ``eu-west``
    or ``us-east``). The matcher only adds a locality preference; it never makes
    a worker in another region unavailable, so global failover remains intact.
    """
    job_payload = job_payload or {}
    start = job_payload.get("start") or {}
    try:
        lat = float(start.get("lat"))
        lon = float(start.get("lon"))
    except Exception:
        return ()
    if -50 <= lat <= 0 and 110 <= lon <= 180:
        return ("oceania", "australia", "sydney", "ap-southeast")
    if -60 <= lat <= 15 and -90 <= lon <= -30:
        return ("sa-", "south america", "brazil", "brasil", "sao paulo", "são paulo")
    if 15 < lat <= 75 and -170 <= lon <= -30:
        return ("us-", "north america", "canada", "virginia", "oregon", "ohio")
    if 30 <= lat <= 72 and -25 <= lon <= 45:
        return ("eu-", "europe", "frankfurt", "london", "ireland", "paris")
    if -40 <= lat <= 38 and -20 <= lon <= 55:
        return ("africa", "johannesburg", "cape town")
    if 0 <= lat <= 80 and 45 < lon <= 180:
        return ("ap-", "asia", "singapore", "tokyo", "mumbai", "seoul")
    return ()


def _dispatch_node_candidates(job_payload=None):
    """Rank a bounded failover set across a registry that may contain 5k nodes."""
    configs = _configured_node_registry()
    ranked = []
    now = time.time()
    region_hints = _route_region_hints(job_payload)
    seed_raw = str((job_payload or {}).get("request_id") or json.dumps((job_payload or {}).get("start") or {}, sort_keys=True))
    seed = int(hashlib.sha256(seed_raw.encode("utf-8")).hexdigest()[:8], 16)
    for cfg in configs:
        # Registry entries are cached, but cooldowns change immediately after a
        # failed request. Read the live cooldown table here so a dead worker is
        # not selected again during the registry TTL window.
        with _NODE_COOLDOWN_LOCK:
            if float(_NODE_COOLDOWN_UNTIL.get(int(cfg.get("index") or 0), 0) or 0) > now:
                continue
        with RAIRO_NODE_STATUS_LOCK:
            cached = RAIRO_NODE_STATUS_CACHE.get(cfg["id"])
        status = dict(cached.get("payload") or {}) if cached and now - float(cached.get("ts", 0)) < max(90, RAIRO_NODE_STATUS_TTL * 3) else {}
        healthy = status.get("healthy")
        capacity = max(1, int(status.get("capacity") or cfg.get("capacity") or RAIRO_NODE_CAPACITY))
        active = max(0, int(status.get("active_jobs") if status.get("active_jobs") is not None else status.get("active_users") or 0))
        with _NODE_INFLIGHT_LOCK:
            reserved = max(0, int(_NODE_INFLIGHT.get(int(cfg.get("index") or 0), 0) or 0))
        active += reserved
        free = max(0, capacity - active)
        if status.get("available_slots") is not None:
            free = min(free, max(0, int(status.get("available_slots") or 0) - reserved))
        latency = float(status.get("response_avg_ms") or status.get("latency_ms") or 9999)
        priority = int(cfg.get("priority") or 100)
        health_rank = 0 if healthy is True else (1 if healthy is None else 3)
        full_rank = 1 if free <= 0 else 0
        region_text = f"{cfg.get('region','')} {cfg.get('provider','')}".lower()
        region_rank = 0 if region_hints and any(h in region_text for h in region_hints) else (1 if region_hints else 0)
        # Stable per-request jitter distributes equal workers instead of always
        # selecting low node indexes. Latency is bucketed so tiny network noise
        # does not pin all traffic to a single worker.
        index = int(cfg["index"])
        tiebreak = ((index * 2654435761) ^ seed) & 0xFFFFFFFF
        latency_bucket = int(max(0.0, latency) // 35)
        ranked.append(((health_rank, full_rank, region_rank, priority, -free, latency_bucket, tiebreak, index), cfg, status))
    if not ranked:
        return []
    # A route only needs a small failover set. Avoid O(N log N) sorting across
    # thousands of global workers on every request; select only the best slice.
    candidate_limit = min(len(ranked), max(32, RAIRO_NODE_ROUTE_ATTEMPTS * 12))
    ranked = heapq.nsmallest(candidate_limit, ranked, key=lambda item: item[0])
    global _NODE_DISPATCH_CURSOR
    with _NODE_DISPATCH_LOCK:
        cursor = _NODE_DISPATCH_CURSOR % len(ranked)
        _NODE_DISPATCH_CURSOR += 1
    best_health = ranked[0][0][:4]
    head = [x for x in ranked if x[0][:4] == best_health]
    tail = [x for x in ranked if x[0][:4] != best_health]
    if head:
        shift = cursor % len(head)
        head = head[shift:] + head[:shift]
    return [(cfg, status) for _, cfg, status in head + tail]

def _mark_node_cooldown(index, seconds):
    index = int(index or 0)
    seconds = max(0, min(300, int(seconds or 0)))
    with _NODE_COOLDOWN_LOCK:
        if seconds <= 0:
            _NODE_COOLDOWN_UNTIL.pop(index, None)
        else:
            _NODE_COOLDOWN_UNTIL[index] = time.time() + seconds


def _reserve_node(index):
    index = int(index or 0)
    if index <= 0:
        return
    with _NODE_INFLIGHT_LOCK:
        _NODE_INFLIGHT[index] = max(0, int(_NODE_INFLIGHT.get(index, 0) or 0)) + 1


def _release_node(index):
    index = int(index or 0)
    if index <= 0:
        return
    with _NODE_INFLIGHT_LOCK:
        left = max(0, int(_NODE_INFLIGHT.get(index, 0) or 0) - 1)
        if left:
            _NODE_INFLIGHT[index] = left
        else:
            _NODE_INFLIGHT.pop(index, None)


def _job_direct_distance_km(job_payload):
    try:
        start = (job_payload or {}).get("start") or {}
        end = (job_payload or {}).get("end") or {}
        return max(0.0, haversine_m(float(start["lat"]), float(start["lon"]), float(end["lat"]), float(end["lon"])) / 1000.0)
    except Exception:
        return 0.0


def _heavy_route_dispatch_policy(job_payload, candidates, prefetch=False):
    """Choose redundancy/timeout without flooding the worker cluster.

    Fan-out grows with distance, but high cluster occupancy reduces replication.
    Prefetch is intentionally capped at two parallel workers because a prefetch
    request can already calculate several modes inside one Route Node.
    """
    distance_km = _job_direct_distance_km(job_payload)
    active = bool(
        str((job_payload or {}).get("profile") or "").lower() in MOTORIZED_PROFILES
        and RAIRO_HEAVY_ROUTE_MIN_KM <= distance_km <= RAIRO_HEAVY_ROUTE_MAX_KM
    )
    if not active:
        return {"active": False, "distance_km": round(distance_km, 2), "fanout": 1, "attempts": RAIRO_NODE_ROUTE_ATTEMPTS}

    if distance_km < 120:
        fanout, timeout_s, hedge_ms = 2, 18.0, max(900, RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS)
    elif distance_km < 600:
        fanout, timeout_s, hedge_ms = 3, 28.0, max(600, int(RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS * .85))
    elif distance_km < 1500:
        fanout, timeout_s, hedge_ms = 4, 40.0, max(380, int(RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS * .65))
    else:
        fanout, timeout_s, hedge_ms = 5, 52.0, max(220, int(RAIRO_HEAVY_ROUTE_HEDGE_DELAY_MS * .45))

    total_capacity = 0
    total_active = 0
    for cfg, status in (candidates or []):
        cap = max(1, int((status or {}).get("capacity") or cfg.get("capacity") or RAIRO_NODE_CAPACITY))
        busy = max(0, int((status or {}).get("active_jobs") if (status or {}).get("active_jobs") is not None else (status or {}).get("active_users") or 0))
        with _NODE_INFLIGHT_LOCK:
            busy += max(0, int(_NODE_INFLIGHT.get(int(cfg.get("index") or 0), 0) or 0))
        total_capacity += cap
        total_active += min(cap, busy)
    cluster_load = (float(total_active) / float(total_capacity)) if total_capacity else 0.0
    if cluster_load >= RAIRO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT:
        fanout = min(fanout, 2)
    elif cluster_load >= max(.68, RAIRO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT - .12):
        fanout = min(fanout, 3)
    if prefetch:
        fanout = min(fanout, 2)

    fanout = max(1, min(fanout, RAIRO_HEAVY_ROUTE_MAX_FANOUT, len(candidates or []) or 1))
    attempts = max(fanout, min(RAIRO_HEAVY_ROUTE_TOTAL_ATTEMPTS, len(candidates or []) or fanout))
    timeout_s = min(RAIRO_HEAVY_ROUTE_TIMEOUT_MAX, max(RAIRO_NODE_ROUTE_TIMEOUT, timeout_s))
    overall_timeout_s = min(RAIRO_HEAVY_ROUTE_TIMEOUT_MAX + 5.0, timeout_s + ((attempts - 1) * hedge_ms / 1000.0))
    return {
        "active": True,
        "distance_km": round(distance_km, 2),
        "fanout": fanout,
        "attempts": attempts,
        "hedge_delay_ms": int(hedge_ms),
        "node_timeout_s": round(timeout_s, 2),
        "overall_timeout_s": round(overall_timeout_s, 2),
        "cluster_load_pct": round(cluster_load * 100.0, 1),
    }


def _node_route_headers():
    headers = {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "VANO MAPS-Central/90"}
    if CENTRAL_API_SECRET:
        headers["Authorization"] = f"Bearer {CENTRAL_API_SECRET}"
    return headers


def _node_job_payload(slat, slon, elat, elon, travel_profile, mode, depart_at, start_bearing, start_speed,
                      reroute_request, adaptive_requested, avoid_ferries, avoid_tolls, avoid_unpaved,
                      local_hour, user_nav, safety_bias=68, traffic_bias=62, request_id=""):
    return {
        "request_id": str(request_id or secrets.token_urlsafe(10))[:80],
        "start": {"lat": float(slat), "lon": float(slon)},
        "end": {"lat": float(elat), "lon": float(elon)},
        "profile": travel_profile,
        "mode": mode,
        "depart_at": depart_at,
        "heading": start_bearing,
        "speed": start_speed,
        "reroute": bool(reroute_request),
        "adaptive": bool(adaptive_requested),
        "preferences": {
            "avoid_ferries": bool(avoid_ferries),
            "avoid_tolls": bool(avoid_tolls),
            "avoid_unpaved": bool(avoid_unpaved),
        },
        "professional_driver": bool(user_nav.get("professional_driver")),
        "local_hour": local_hour,
        "night_active": bool(user_nav.get("night_active")),
        "safety_bias": float(safety_bias),
        "traffic_bias": float(traffic_bias),
    }


def _node_inline_context(slat, slon, elat, elon, mode):
    """Build a bounded context payload at the Central, close to PostgreSQL.

    Global workers should not open a cross-region DB connection on the route hot
    path. Admin block zones are always included; reports are added for non-fast
    modes. Mapbox traffic remains the source for live ETA in the worker.
    """
    if not _env_bool("RAIRO_NODE_INLINE_CONTEXT", True):
        return None
    span = max(abs(float(slat)-float(elat)), abs(float(slon)-float(elon)))
    pad = min(.18, max(.035, span * .10 + .02))
    bounds = (min(float(slat),float(elat))-pad, min(float(slon),float(elon))-pad,
              max(float(slat),float(elat))+pad, max(float(slon),float(elon))+pad)
    try:
        zones = [dict(x) for x in get_risk_zones_for_bounds(*bounds)][:320]
        reports = [] if str(mode) == "fastest" else [dict(x) for x in get_active_reports_for_bounds(*bounds)][:420]
        return {"reports": reports, "risk_zones": zones, "flow_samples": [], "source": "central-inline-v93"}
    except Exception:
        return None


def _call_route_node(cfg, job_payload, prefetch, headers, timeout_override=None, replica_rank=1):
    """Execute one worker call and return (result, attempt, success)."""
    started = time.perf_counter()
    attempt = {
        "node_id": cfg["id"], "name": cfg["name"], "url": cfg["url"], "status": None,
        "replica_rank": int(replica_rank or 1),
    }
    _reserve_node(cfg.get("index"))
    try:
        if prefetch and job_payload.get("mode") in {"fastest", "safest", "smart"}:
            target = cfg["url"] + str(cfg.get("precalc_path") or "/v1/route/precalculate")
            body = dict(job_payload)
            body["modes"] = ["safest", "fastest", "smart"]
        else:
            target = cfg["url"] + str(cfg.get("route_path") or "/v1/route/calculate")
            body = dict(job_payload)
        connect_timeout = max(0.5, min(8.0, float(cfg.get("connect_timeout_s") or 2.2)))
        configured_timeout = max(3.0, float(cfg.get("route_timeout_s") or RAIRO_NODE_ROUTE_TIMEOUT))
        route_timeout = max(configured_timeout, float(timeout_override or 0))
        route_timeout = min(RAIRO_HEAVY_ROUTE_TIMEOUT_MAX if timeout_override else 45.0, route_timeout)
        resp = _NODE_HTTP.post(target, json=body, headers=headers, timeout=(connect_timeout, route_timeout))
        attempt["status"] = int(resp.status_code)
        attempt["latency_ms"] = int((time.perf_counter() - started) * 1000)
        try:
            data = resp.json() if resp.content else {}
            if not isinstance(data, dict):
                data = {}
        except Exception:
            data = {}
        if resp.status_code == 200:
            if prefetch and "results" in data:
                result = (data.get("results") or {}).get(job_payload.get("mode"))
            else:
                result = data
            if isinstance(result, dict) and result.get("routes"):
                _record_node_dispatch_log(cfg, job_payload, prefetch, attempt, True)
                _mark_node_cooldown(cfg["index"], 0)
                node_meta = result.get("node") or data.get("node") or {}
                if isinstance(node_meta, dict):
                    payload = {
                        **_test_node_metrics(cfg, 0), **cfg, **node_meta,
                        "mode": "real", "status": "draining" if cfg.get("drain_mode") else "online",
                        "healthy": True, "latency_ms": attempt["latency_ms"],
                        "active_users": int(node_meta.get("active_jobs") or 0),
                        "active_jobs": int(node_meta.get("active_jobs") or 0),
                        "last_check": utcnow_iso(), "http_status": 200,
                        "note": "Node respondeu a um cálculo de rota.",
                    }
                    with RAIRO_NODE_STATUS_LOCK:
                        RAIRO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": payload}
                return copy.deepcopy(result), attempt, True
        attempt["error"] = str(data.get("error") or f"http_{resp.status_code}")[:100]
        if resp.status_code == 429:
            _mark_node_cooldown(cfg["index"], min(5, int(cfg.get("cooldown_s") or 2)))
        elif resp.status_code >= 500:
            _mark_node_cooldown(cfg["index"], cfg.get("cooldown_s") or 20)
    except requests.Timeout:
        attempt["error"] = "timeout"
        attempt["latency_ms"] = int((time.perf_counter() - started) * 1000)
        _mark_node_cooldown(cfg["index"], cfg.get("cooldown_s") or 20)
    except Exception as exc:
        attempt["error"] = type(exc).__name__
        attempt["latency_ms"] = int((time.perf_counter() - started) * 1000)
        _mark_node_cooldown(cfg["index"], cfg.get("cooldown_s") or 20)
    finally:
        _release_node(cfg.get("index"))
    _record_node_dispatch_log(cfg, job_payload, prefetch, attempt, False)
    return None, attempt, False


def _dispatch_heavy_route(job_payload, candidates, prefetch, meta, headers, policy):
    """Hedged worker race: first valid route wins; extra workers start only as needed."""
    selected = list(candidates[:int(policy.get("attempts") or 1)])
    if not selected:
        return None, meta
    max_parallel = max(1, min(int(policy.get("fanout") or 1), len(selected)))
    hedge_delay = max(.08, float(policy.get("hedge_delay_ms") or 320) / 1000.0)
    deadline = time.monotonic() + max(5.0, float(policy.get("overall_timeout_s") or 30))
    pool = ThreadPoolExecutor(max_workers=max_parallel, thread_name_prefix="rairo-heavy-route")
    pending = {}
    next_index = 0
    next_hedge_at = time.monotonic()

    def launch_one():
        nonlocal next_index, next_hedge_at
        if next_index >= len(selected) or len(pending) >= max_parallel:
            return False
        cfg, _status = selected[next_index]
        rank = next_index + 1
        next_index += 1
        fut = pool.submit(
            _call_route_node, cfg, job_payload, prefetch, headers,
            float(policy.get("node_timeout_s") or RAIRO_NODE_ROUTE_TIMEOUT), rank,
        )
        pending[fut] = cfg
        next_hedge_at = time.monotonic() + hedge_delay
        return True

    launch_one()
    try:
        while pending or next_index < len(selected):
            now = time.monotonic()
            if now >= deadline:
                break
            # If capacity is available, launch the next hedge when the delay
            # expires. A failure also causes immediate replacement below.
            if next_index < len(selected) and len(pending) < max_parallel and now >= next_hedge_at:
                launch_one()
                continue
            wait_for = min(.25, max(.01, deadline - now))
            if next_index < len(selected) and len(pending) < max_parallel:
                wait_for = min(wait_for, max(.01, next_hedge_at - now))
            done, _ = wait(tuple(pending.keys()), timeout=wait_for, return_when=FIRST_COMPLETED)
            if not done:
                continue
            immediate_replacement = False
            for fut in done:
                cfg = pending.pop(fut, None)
                try:
                    result, attempt, success = fut.result()
                except Exception as exc:
                    attempt = {"node_id": (cfg or {}).get("id"), "name": (cfg or {}).get("name"), "error": type(exc).__name__, "status": None}
                    result, success = None, False
                meta["attempted"].append(attempt)
                if success and result is not None:
                    result["distributed_routing"] = {
                        "used": True,
                        "strategy": "hedged-heavy-route",
                        "node_id": attempt.get("node_id"),
                        "node_name": attempt.get("name"),
                        "node_latency_ms": attempt.get("latency_ms"),
                        "attempts": len(meta["attempted"]),
                        "distance_km": policy.get("distance_km"),
                        "fanout": policy.get("fanout"),
                        "cluster_load_pct": policy.get("cluster_load_pct"),
                    }
                    meta["strategy"] = "hedged-heavy-route"
                    meta["policy"] = dict(policy)
                    # Running HTTP calls cannot be force-killed safely, but queued
                    # replicas are cancelled. Running replicas finish in background
                    # and release their reservation/cooldown state themselves.
                    for other in list(pending):
                        other.cancel()
                    pool.shutdown(wait=False, cancel_futures=True)
                    return result, meta
                immediate_replacement = True
            if immediate_replacement and next_index < len(selected) and len(pending) < max_parallel:
                launch_one()
    finally:
        # Do not block the request waiting for already-running hedges.
        pool.shutdown(wait=False, cancel_futures=True)

    meta["fallback"] = True
    meta["reason"] = "heavy_nodes_unavailable"
    meta["strategy"] = "hedged-heavy-route"
    meta["policy"] = dict(policy)
    return None, meta


def dispatch_route_to_nodes(job_payload, prefetch=False):
    """Route work to healthy nodes, using hedged fan-out for heavy trips."""
    meta = {"enabled": bool(RAIRO_DISTRIBUTED_ROUTING_ENABLED), "attempted": [], "fallback": False}

    def log_central_fallback(reason):
        attempt = {"status": None, "latency_ms": 0, "error": reason}
        _record_node_dispatch_log({"index": 0, "name": "Central fallback"}, job_payload, prefetch, attempt, False)

    if not RAIRO_DISTRIBUTED_ROUTING_ENABLED:
        meta["reason"] = "disabled"
        return None, meta
    if not CENTRAL_API_SECRET:
        meta["reason"] = "central_secret_missing"
        log_central_fallback(meta["reason"])
        return None, meta
    candidates = _dispatch_node_candidates(job_payload)
    if not candidates:
        meta["reason"] = "no_available_nodes"
        log_central_fallback(meta["reason"])
        return None, meta

    healthy_candidates = [(cfg, st) for cfg, st in candidates if st.get("healthy") is True]
    unknown_candidates = [(cfg, st) for cfg, st in candidates if st.get("healthy") is None]
    if healthy_candidates:
        candidates = healthy_candidates
    elif unknown_candidates:
        candidates = unknown_candidates
    else:
        meta["fallback"] = True
        meta["reason"] = "nodes_known_unavailable"
        log_central_fallback(meta["reason"])
        return None, meta

    headers = _node_route_headers()
    heavy_policy = _heavy_route_dispatch_policy(job_payload, candidates, prefetch=prefetch)
    meta["distance_km"] = heavy_policy.get("distance_km")
    if heavy_policy.get("active"):
        result, meta = _dispatch_heavy_route(job_payload, candidates, prefetch, meta, headers, heavy_policy)
        if result is not None:
            return result, meta
        log_central_fallback(meta.get("reason") or "heavy_nodes_unavailable")
        return None, meta

    for rank, (cfg, _cached_status) in enumerate(candidates[:RAIRO_NODE_ROUTE_ATTEMPTS], start=1):
        result, attempt, success = _call_route_node(cfg, job_payload, prefetch, headers, None, rank)
        meta["attempted"].append(attempt)
        if success and result is not None:
            result["distributed_routing"] = {
                "used": True,
                "strategy": "single-node-failover",
                "node_id": attempt.get("node_id"),
                "node_name": attempt.get("name"),
                "node_latency_ms": attempt.get("latency_ms"),
                "attempts": len(meta["attempted"]),
            }
            return result, meta

    meta["fallback"] = True
    meta["reason"] = "nodes_unavailable"
    log_central_fallback(meta["reason"])
    return None, meta

# V49 — frictionless guest trial. Anonymous visitors can calculate ten routes
# before authentication is required. The counter lives in the signed Flask
# session so refreshes do not reset the allowance.
GUEST_ROUTE_LIMIT = max(1, min(50, int(os.environ.get("RAIRO_GUEST_ROUTE_LIMIT", "10") or 10)))

def guest_trial_ids():
    if session.get("user_id"):
        return []
    raw = session.get("guest_trial_ids", [])
    if not isinstance(raw, list):
        return []
    return [str(x)[:64] for x in raw if str(x).strip()][:GUEST_ROUTE_LIMIT]

def guest_routes_used():
    return len(guest_trial_ids()) if not session.get("user_id") else 0

def guest_routes_remaining():
    if session.get("user_id"):
        return GUEST_ROUTE_LIMIT
    return max(0, GUEST_ROUTE_LIMIT - guest_routes_used())

def consume_guest_route(payload, trial_id=None):
    """Consume one successful anonymous trip, not every internal reroute.

    The browser sends a stable trial_id for one destination/trip. Recalculations,
    mode switches and GPS reroutes with the same id do not burn extra credits.
    """
    if session.get("user_id"):
        payload["guest_trial"] = {"active": False, "limit": GUEST_ROUTE_LIMIT, "remaining": GUEST_ROUTE_LIMIT}
        return jsonify(payload)
    ids = guest_trial_ids()
    token = str(trial_id or "").strip()[:64]
    if not token:
        token = secrets.token_urlsafe(12)
    if token not in ids and len(ids) < GUEST_ROUTE_LIMIT:
        ids.append(token)
        session["guest_trial_ids"] = ids
        session.modified = True
    used = len(ids)
    payload["guest_trial"] = {"active": True, "limit": GUEST_ROUTE_LIMIT, "used": used, "remaining": max(0, GUEST_ROUTE_LIMIT-used), "trial_id": token}
    return jsonify(payload)

def is_admin_email(email):
    return str(email or "").strip().lower() in ADMIN_EMAILS

def role_for_email(email):
    return "admin" if is_admin_email(email) else "user"

def is_motorized_profile(profile):
    return str(profile or "").strip().lower() in MOTORIZED_PROFILES

MAX_REPORT_AGE_DAYS = 30
REMEMBER_COOKIE_NAME = "rairo_remember"
REMEMBER_EMBED_COOKIE_NAME = "rairo_remember_embed"
REMEMBER_LOGIN_DAYS = max(30, min(3650, int(os.environ.get("RAIRO_REMEMBER_DAYS", "365"))))

# X10 — short-lived provider cache: repeated mode switches reuse the same fresh
# Mapbox candidate set instead of repeating an identical network request.
_ROUTE_PROVIDER_CACHE = {}
_ROUTE_PROVIDER_CACHE_LOCK = threading.Lock()
_ROUTE_PROVIDER_CACHE_TTL = max(10, min(90, int(os.environ.get("RAIRO_ROUTE_CACHE_TTL", "35"))))
# X18: live driving traffic gets only a tiny dedupe window so switching UI modes
# does not repeat identical requests, while a fresh navigation calculation never
# relies on meaningfully stale traffic. Non-live profiles can safely cache longer.
_ROUTE_PROVIDER_CACHE_TTL_LIVE = max(0, min(15, int(os.environ.get("RAIRO_ROUTE_CACHE_TTL_LIVE", "8"))))
_ROUTE_PROVIDER_CACHE_TTL_STATIC = max(20, min(180, int(os.environ.get("RAIRO_ROUTE_CACHE_TTL_STATIC", "55"))))

# V84 — single-flight for identical Directions requests. Safe and Fast route
# prefetches intentionally start together; when both need the exact same base
# Mapbox graph, only one outbound request is allowed to run and the other
# thread reuses its result. A tiny completed-job window also closes the race
# between the provider response and the provider-cache write.
_ROUTE_FETCH_INFLIGHT = {}
_ROUTE_FETCH_INFLIGHT_LOCK = threading.Lock()
_ROUTE_FETCH_INFLIGHT_KEEP_S = 2.5

def _route_mapbox_get(url, params, timeout=12):
    key = (str(url), tuple(sorted((str(k), str(v)) for k, v in (params or {}).items())))
    now = time.time()
    leader = False
    with _ROUTE_FETCH_INFLIGHT_LOCK:
        # Opportunistic cleanup keeps this bounded without another worker/thread.
        if len(_ROUTE_FETCH_INFLIGHT) > 72:
            stale = [k for k, j in _ROUTE_FETCH_INFLIGHT.items()
                     if j["event"].is_set() and now - float(j.get("done_at") or now) > _ROUTE_FETCH_INFLIGHT_KEEP_S]
            for stale_key in stale[:36]:
                _ROUTE_FETCH_INFLIGHT.pop(stale_key, None)
        job = _ROUTE_FETCH_INFLIGHT.get(key)
        if job and job["event"].is_set() and now - float(job.get("done_at") or now) > _ROUTE_FETCH_INFLIGHT_KEEP_S:
            _ROUTE_FETCH_INFLIGHT.pop(key, None)
            job = None
        if job is None:
            job = {"event": threading.Event(), "result": None, "error": None, "done_at": 0.0}
            _ROUTE_FETCH_INFLIGHT[key] = job
            leader = True

    if leader:
        try:
            job["result"] = copy.deepcopy(mapbox_get(url, params, timeout=timeout))
        except Exception as exc:
            job["error"] = exc
        finally:
            job["done_at"] = time.time()
            job["event"].set()
    else:
        # The leader has the same HTTP timeout. Give it a small scheduling margin.
        job["event"].wait(timeout=max(2.0, float(timeout) + 3.0))

    if not job["event"].is_set():
        # Extremely rare stalled-worker fallback: do not hold the user hostage.
        return mapbox_get(url, params, timeout=timeout)
    if job.get("error") is not None:
        raise job["error"]
    return copy.deepcopy(job.get("result") or {})

# V83 — full route-result cache. Provider caching avoids duplicate Mapbox calls,
# but the safety/traffic enrichment after those calls is also substantial. A
# destination click can now precompute the complete response and the confirmation
# reuses it for a short window. Prefetches never consume guest credits or write
# route history; those side effects happen only on the confirmed request.
_ROUTE_RESULT_CACHE = {}
_ROUTE_RESULT_CACHE_LOCK = threading.Lock()
_ROUTE_RESULT_CACHE_TTL = max(8, min(45, int(os.environ.get("RAIRO_ROUTE_RESULT_CACHE_TTL", "22"))))

def _route_result_cache_get(key):
    now = time.time()
    with _ROUTE_RESULT_CACHE_LOCK:
        item = _ROUTE_RESULT_CACHE.get(key)
        if not item:
            return None
        created, payload = item
        if now - created > _ROUTE_RESULT_CACHE_TTL:
            _ROUTE_RESULT_CACHE.pop(key, None)
            return None
        return copy.deepcopy(payload)

def _route_result_cache_put(key, payload):
    now = time.time()
    with _ROUTE_RESULT_CACHE_LOCK:
        if len(_ROUTE_RESULT_CACHE) > 140:
            for k, _ in sorted(_ROUTE_RESULT_CACHE.items(), key=lambda kv: kv[1][0])[:45]:
                _ROUTE_RESULT_CACHE.pop(k, None)
        _ROUTE_RESULT_CACHE[key] = (now, copy.deepcopy(payload))

def _route_result_cache_key(user_id=None):
    # Labels, the trial token and the speculative flag do not affect geometry or
    # scoring. Everything else is kept in the key so preferences, heading and
    # navigation exclusions cannot accidentally share an incompatible result.
    ignored = {"trial_id", "prefetch", "origin_label", "destination_label"}
    args = tuple(sorted((str(k), str(v)) for k, v in request.args.items() if k not in ignored))
    return (str(user_id or "guest"),) + args

def _record_route_history_from_payload(payload, slat, slon, elat, elon, mode):
    try:
        selected_id = payload.get("selected_id")
        rows = payload.get("routes") or []
        selected = next((r for r in rows if str(r.get("id")) == str(selected_id)), rows[0] if rows else None)
        if not selected:
            return
        origin_label = request.args.get("origin_label", "")[:180]
        dest_label = request.args.get("destination_label", "")[:180]
        db = get_db()
        db.execute("""
            INSERT INTO route_history(user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,mode,distance_m,duration_s,safety_score,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (session.get("user_id"), origin_label, dest_label, slat, slon, elat, elon, mode,
              float(selected.get("distance") or 0), float(selected.get("duration") or 0),
              float(selected.get("safety_score") or 0), utcnow_iso()))
        db.commit()
    except Exception:
        pass

_MOBILE_ROUTE_KEEP_FIELDS = {
    "id", "distance", "duration", "duration_min", "geometry", "steps", "profile", "badges",
    "routing_provider", "routing_profile_used", "route_signature",
    "micro_route", "micro_strategy", "micro_streets", "micro_traffic_relief",
    "eta_gain_s", "eta_gain_min", "adaptive_variant", "safety_variant",
    "safety_score", "safety_conservative_score", "safety_level", "safety_level_label",
    "data_confidence", "decision_confidence", "risk_exposure_pct", "hotspot_risk",
    "traffic_score", "traffic_level", "congested_distance_km", "severe_segments",
    "live_flow_score", "live_flow_confidence",
    "road_controls", "road_controls_count", "known_speed_limits", "speed_limit_points",
    "incidents_count", "closures_count", "eta_delta_vs_fastest_min", "safety_gain_vs_fastest",
}

def _mobile_compact_route_payload(payload):
    """Trim route delivery for the native client without changing route selection.

    The full payload remains cached/server-side. Android receives the selected
    route plus at most two useful alternatives and only fields needed for local
    navigation. This reduces JSON serialization, transfer and WebView/native
    parsing while preserving the current web response by default.
    """
    result = copy.deepcopy(payload)
    routes = list(result.get("routes") or [])
    selected_id = result.get("selected_id")
    selected = next((r for r in routes if str(r.get("id")) == str(selected_id)), routes[0] if routes else None)
    ranked = []
    if selected is not None:
        ranked.append(selected)
    # Prefer semantically useful alternatives (fastest/safest/smart) before ETA order.
    for badge in ("fastest", "safest", "smart"):
        for route in routes:
            if route in ranked:
                continue
            if badge in (route.get("badges") or []):
                ranked.append(route)
                break
    for route in sorted(routes, key=lambda r: float(r.get("duration") or 10**12)):
        if route not in ranked:
            ranked.append(route)
        if len(ranked) >= 3:
            break
    ranked = ranked[:3]
    compact = []
    for route in ranked:
        compact.append({k: copy.deepcopy(v) for k, v in route.items() if k in _MOBILE_ROUTE_KEEP_FIELDS})
    result["routes"] = compact
    result["mobile_delivery"] = {
        "compact": True,
        "contract_version": 1,
        "route_count": len(compact),
        "full_payload_cached_server_side": True,
        "processing_hint": "device-navigation-v1",
    }
    return result

def _finish_route_payload(payload, cache_key, prefetch_requested, trial_id, slat, slon, elat, elon, mode, cache_hit=False):
    _route_result_cache_put(cache_key, payload)
    result = copy.deepcopy(payload)
    mobile_compact = (
        str(request.args.get("mobile_compact", "0")).strip().lower() in {"1", "true", "yes", "on"}
        or str(request.headers.get("X-VANO-Mobile-Compact", "0")).strip().lower() in {"1", "true", "yes", "on"}
    )
    if mobile_compact:
        result = _mobile_compact_route_payload(result)
    if prefetch_requested:
        # Explicit marker lets the browser know this response is safe to display
        # only after confirmation. No guest credit/history is touched here.
        result["prefetch"] = {"ready": True, "cache_hit": bool(cache_hit), "ttl_s": _ROUTE_RESULT_CACHE_TTL}
        return jsonify(result)
    _record_route_history_from_payload(result, slat, slon, elat, elon, mode)
    return consume_guest_route(result, trial_id=trial_id)

# V88 — shared candidate-pool cache across route modes. Segura/Smart/Rápida
# often use the same Mapbox base + micro-routes; keeping this raw pool for a
# few seconds prevents the second prefetch from rebuilding the expensive part.
_ROUTE_CANDIDATE_POOL_CACHE = {}
_ROUTE_CANDIDATE_POOL_LOCK = threading.Lock()
_ROUTE_CANDIDATE_POOL_INFLIGHT = {}
_ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK = threading.Lock()
_ROUTE_CANDIDATE_POOL_TTL = max(6, min(30, int(os.environ.get("RAIRO_CANDIDATE_POOL_TTL", "16"))))

def _candidate_pool_cache_get(key):
    now=time.time()
    with _ROUTE_CANDIDATE_POOL_LOCK:
        item=_ROUTE_CANDIDATE_POOL_CACHE.get(key)
        if not item:return None
        ts,payload=item
        if now-ts>_ROUTE_CANDIDATE_POOL_TTL:
            _ROUTE_CANDIDATE_POOL_CACHE.pop(key,None);return None
        return copy.deepcopy(payload)

def _candidate_pool_cache_put(key,payload):
    with _ROUTE_CANDIDATE_POOL_LOCK:
        if len(_ROUTE_CANDIDATE_POOL_CACHE)>120:
            for k,_ in sorted(_ROUTE_CANDIDATE_POOL_CACHE.items(),key=lambda kv:kv[1][0])[:36]:_ROUTE_CANDIDATE_POOL_CACHE.pop(k,None)
        _ROUTE_CANDIDATE_POOL_CACHE[key]=(time.time(),copy.deepcopy(payload))

def _candidate_pool_get_or_build(key,builder,wait_timeout=32):
    cached=_candidate_pool_cache_get(key)
    if cached is not None:return cached,"cache"
    leader=False
    with _ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK:
        job=_ROUTE_CANDIDATE_POOL_INFLIGHT.get(key)
        if job is None:
            job={"event":threading.Event(),"result":None,"error":None}
            _ROUTE_CANDIDATE_POOL_INFLIGHT[key]=job
            leader=True
    if leader:
        try:
            result=builder()
            job["result"]=copy.deepcopy(result)
            _candidate_pool_cache_put(key,result)
        except Exception as exc:
            job["error"]=exc
        finally:
            job["event"].set()
            with _ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK:_ROUTE_CANDIDATE_POOL_INFLIGHT.pop(key,None)
    else:
        job["event"].wait(timeout=max(2,float(wait_timeout)))
    if job.get("error") is not None:raise job["error"]
    if job.get("result") is None:
        # A stalled leader must not block routing indefinitely. Build once as a
        # fallback; provider-level in-flight dedup still protects Mapbox calls.
        result=builder();_candidate_pool_cache_put(key,result);return result,"fallback"
    return copy.deepcopy(job["result"]),"built" if leader else "shared-inflight"

def _candidate_pool_cache_key(slat,slon,elat,elon,profile,depart_at,adaptive,variant_budget,base_exclusions,extra_excludes,start_bearing,start_speed,reroute):
    return (
        round(float(slat),5),round(float(slon),5),round(float(elat),5),round(float(elon),5),str(profile),str(depart_at),bool(adaptive),int(variant_budget),
        None if start_bearing is None else round(float(start_bearing),-1),None if start_speed is None else round(float(start_speed),0),bool(reroute),
        tuple(sorted(str(x) for x in (extra_excludes or []))),
        tuple((round(float(x[0]),5),round(float(x[1]),5)) for x in (base_exclusions or [])[:18]),
    )

def _route_cache_get(key, ttl_seconds=None):
    now = time.time()
    ttl = _ROUTE_PROVIDER_CACHE_TTL if ttl_seconds is None else max(0, float(ttl_seconds))
    with _ROUTE_PROVIDER_CACHE_LOCK:
        item = _ROUTE_PROVIDER_CACHE.get(key)
        if not item:
            return None
        created, value = item
        if now - created > ttl:
            _ROUTE_PROVIDER_CACHE.pop(key, None)
            return None
        return copy.deepcopy(value)

def _route_cache_put(key, value):
    now = time.time()
    with _ROUTE_PROVIDER_CACHE_LOCK:
        if len(_ROUTE_PROVIDER_CACHE) > 220:
            for k, _ in sorted(_ROUTE_PROVIDER_CACHE.items(), key=lambda kv: kv[1][0])[:70]:
                _ROUTE_PROVIDER_CACHE.pop(k, None)
        _ROUTE_PROVIDER_CACHE[key] = (now, copy.deepcopy(value))

# Embedded mode is intentionally hard-enabled for the Vértice integration.
# This no longer depends on an environment variable, so an old Render value
# cannot silently re-enable X-Frame-Options: DENY.
EMBED_MODE = True
def _safe_header_env(name, fallback):
    value = str(os.environ.get(name, fallback) or fallback).strip()
    return fallback if "\r" in value or "\n" in value else value

FRAME_ANCESTORS = _safe_header_env("RAIRO_FRAME_ANCESTORS", "*")
RAIRO_PERMISSIONS_POLICY = _safe_header_env("RAIRO_PERMISSIONS_POLICY", "geolocation=*, fullscreen=*, clipboard-read=*, clipboard-write=*")
RAIRO_TRUSTED_HOSTS = [x.strip() for x in os.environ.get("RAIRO_TRUSTED_HOSTS", "").split(",") if x.strip()]
SECURE_COOKIE = True

app = Flask(__name__, template_folder="templates")
app.config.update(
    COMPRESS_MIMETYPES=["text/html", "text/css", "text/javascript", "application/javascript", "application/json", "image/svg+xml"],
    COMPRESS_LEVEL=3,
    COMPRESS_MIN_SIZE=512,
    SEND_FILE_MAX_AGE_DEFAULT=timedelta(days=30),
)
Compress(app)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=RAIRO_PROXY_HOPS, x_proto=RAIRO_PROXY_HOPS, x_host=RAIRO_PROXY_HOPS)
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
    TRUSTED_HOSTS=RAIRO_TRUSTED_HOSTS or None,
)

@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")

    # Force permissive framing on every Flask response. Do not emit
    # X-Frame-Options at all: there is no standards-compliant ALLOW-ALL value.
    response.headers.pop("X-Frame-Options", None)
    response.headers["Content-Security-Policy"] = f"frame-ancestors {FRAME_ANCESTORS}"
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=()")
    response.headers["Permissions-Policy"] = RAIRO_PERMISSIONS_POLICY

    # Explicitly avoid cross-origin isolation policies that can interfere with
    # an embedded app or its popup/window relationships.
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"

    # The parent page uses /healthz as a preflight before attaching the iframe.
    if request.path.startswith("/admin") or request.path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    if request.path == "/healthz":
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cache-Control"] = "no-store, max-age=0"
    elif request.path.startswith("/static/"):
        # Critical map/runtime bundles must be revalidated. Keeping them
        # immutable for 30 days caused some regions/devices to retain a broken
        # map core after a hotfix. Other fingerprinted/static assets stay cheap.
        static_name = request.path.rsplit("/", 1)[-1].lower()
        if static_name.startswith(("vano-map-", "vano-runtime-", "vano-telemetry-", "vano-theme-", "vano-benchmark-", "vano-app-")):
            response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
        else:
            response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    elif request.path in {"/embed", "/frame-test"}:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if app.config.get("SESSION_COOKIE_SECURE"):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("X-VANO-Build", VANO_BUILD_ID)
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    return response

# -----------------------------
# Database
# -----------------------------

def get_db():
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def utcnow_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def validate_password_strength(password):
    password = str(password or "")
    if len(password) < 10:
        return False, "A senha precisa ter pelo menos 10 caracteres."
    if len(password) > 256:
        return False, "A senha é longa demais."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return False, "A senha precisa ter pelo menos uma letra e um número."
    return True, ""


def hash_password(password):
    iterations = 600_000
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(stored, password):
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        ).hex()
        return secrets.compare_digest(candidate, digest_hex)
    except Exception:
        return False


def init_db():
    """Create/upgrade the PostgreSQL schema without destructive migrations."""
    db = connect_db()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
                locale TEXT NOT NULL DEFAULT 'pt-BR',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                google_sub TEXT,
                avatar_url TEXT NOT NULL DEFAULT '',
                auth_provider TEXT NOT NULL DEFAULT 'password',
                age INTEGER,
                sex TEXT NOT NULL DEFAULT '',
                is_app_driver INTEGER,
                night_safety_mode INTEGER NOT NULL DEFAULT 1,
                route_preference TEXT NOT NULL DEFAULT 'balanced',
                onboarding_completed_at TEXT,
                distance_unit TEXT NOT NULL DEFAULT 'km',
                vehicle_make TEXT NOT NULL DEFAULT '',
                vehicle_model TEXT NOT NULL DEFAULT '',
                vehicle_plate TEXT NOT NULL DEFAULT '',
                vehicle_year TEXT NOT NULL DEFAULT '',
                preferred_fuel_networks TEXT NOT NULL DEFAULT '[]',
                home_label TEXT NOT NULL DEFAULT '',
                work_label TEXT NOT NULL DEFAULT '',
                presence_visible INTEGER NOT NULL DEFAULT 0,
                presence_terms_accepted_at TEXT,
                emergency_name TEXT NOT NULL DEFAULT '',
                emergency_phone TEXT NOT NULL DEFAULT '',
                map_style TEXT NOT NULL DEFAULT 'auto',
                map_accent TEXT NOT NULL DEFAULT 'violet',
                avoid_ferries INTEGER NOT NULL DEFAULT 0,
                avoid_tolls INTEGER NOT NULL DEFAULT 0,
                avoid_unpaved INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id SERIAL PRIMARY KEY,
                token_hash TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );

            CREATE TABLE IF NOT EXISTS user_access_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address TEXT NOT NULL,
                user_agent TEXT NOT NULL DEFAULT '',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 1,
                UNIQUE(user_id, ip_address)
            );

            CREATE TABLE IF NOT EXISTS request_activity_logs (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                event_type TEXT NOT NULL DEFAULT 'request',
                method TEXT NOT NULL DEFAULT '',
                path TEXT NOT NULL DEFAULT '',
                endpoint TEXT NOT NULL DEFAULT '',
                status_code INTEGER,
                ip_address TEXT NOT NULL DEFAULT 'unknown',
                user_agent TEXT NOT NULL DEFAULT '',
                referrer TEXT NOT NULL DEFAULT '',
                metadata TEXT NOT NULL DEFAULT '{}',
                duration_ms INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                severity INTEGER NOT NULL DEFAULT 3 CHECK(severity BETWEEN 1 AND 5),
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','rejected')),
                created_at TEXT NOT NULL,
                expires_at TEXT,
                confirmations INTEGER NOT NULL DEFAULT 0,
                road_snapped INTEGER NOT NULL DEFAULT 0,
                snap_distance_m REAL,
                road_name TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS report_confirmations (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(report_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS report_absence_votes (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(report_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS saved_places (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id, updated_at);

            CREATE TABLE IF NOT EXISTS weekly_routines (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
                label TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                departure_time TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, weekday)
            );
            CREATE INDEX IF NOT EXISTS idx_weekly_routines_user ON weekly_routines(user_id, weekday);

            CREATE TABLE IF NOT EXISTS privacy_requests (
                id SERIAL PRIMARY KEY,
                protocol TEXT NOT NULL UNIQUE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                email TEXT NOT NULL DEFAULT '',
                request_type TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','rejected')),
                admin_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS route_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                origin_label TEXT NOT NULL DEFAULT '',
                destination_label TEXT NOT NULL DEFAULT '',
                origin_lat REAL NOT NULL,
                origin_lon REAL NOT NULL,
                destination_lat REAL NOT NULL,
                destination_lon REAL NOT NULL,
                mode TEXT NOT NULL,
                distance_m REAL NOT NULL,
                duration_s REAL NOT NULL,
                safety_score REAL NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS route_feedback (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                route_signature TEXT NOT NULL DEFAULT '',
                rating TEXT NOT NULL CHECK(rating IN ('good','improve')),
                mode TEXT NOT NULL DEFAULT 'safest',
                profile TEXT NOT NULL DEFAULT 'walking',
                progress REAL NOT NULL DEFAULT 0,
                duration_s REAL NOT NULL DEFAULT 0,
                distance_m REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS vano_osint_devices (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                remote_user_id TEXT NOT NULL DEFAULT '',
                remote_device_id TEXT NOT NULL DEFAULT '',
                device_token_enc TEXT NOT NULL DEFAULT '',
                device_name TEXT NOT NULL DEFAULT '',
                app_version TEXT NOT NULL DEFAULT '',
                consent_active INTEGER NOT NULL DEFAULT 0,
                consent_version TEXT NOT NULL DEFAULT '',
                consent_at TEXT,
                consent_revoked_at TEXT,
                last_sync_at TEXT,
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vano_osint_devices_consent ON vano_osint_devices(consent_active, updated_at);

            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS risk_zones (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                risk_type TEXT NOT NULL DEFAULT 'verified_incident_area',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_m REAL NOT NULL DEFAULT 350,
                level_cap INTEGER NOT NULL DEFAULT 3 CHECK(level_cap BETWEEN 0 AND 5),
                confidence REAL NOT NULL DEFAULT 0.75 CHECK(confidence BETWEEN 0 AND 1),
                source TEXT NOT NULL DEFAULT 'admin',
                source_url TEXT NOT NULL DEFAULT '',
                start_hour INTEGER,
                end_hour INTEGER,
                neighborhood TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                danger_level INTEGER NOT NULL DEFAULT 2 CHECK(danger_level BETWEEN 1 AND 5),
                block_routes INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shared_routes (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                creator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                origin_label TEXT NOT NULL DEFAULT '',
                destination_label TEXT NOT NULL DEFAULT '',
                origin_lat REAL NOT NULL,
                origin_lon REAL NOT NULL,
                destination_lat REAL NOT NULL,
                destination_lon REAL NOT NULL,
                profile TEXT NOT NULL DEFAULT 'walking',
                mode TEXT NOT NULL DEFAULT 'safest',
                route_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                uses_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS live_trips (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                destination_label TEXT NOT NULL DEFAULT '',
                last_lat REAL,
                last_lon REAL,
                last_accuracy REAL,
                last_speed REAL,
                last_heading REAL,
                route_progress REAL NOT NULL DEFAULT 0,
                safety_level INTEGER NOT NULL DEFAULT 3,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS flow_samples (
                id SERIAL PRIMARY KEY,
                cell_lat REAL NOT NULL,
                cell_lon REAL NOT NULL,
                direction_bucket INTEGER NOT NULL DEFAULT 0,
                speed_kmh REAL NOT NULL,
                source_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS nearby_presence (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                cell_lat REAL NOT NULL,
                cell_lon REAL NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS trusted_links (
                id SERIAL PRIMARY KEY,
                owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                trusted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                relation TEXT NOT NULL DEFAULT 'responsavel',
                created_at TEXT NOT NULL,
                UNIQUE(owner_user_id, trusted_user_id)
            );

            CREATE TABLE IF NOT EXISTS family_invites (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                relation TEXT NOT NULL DEFAULT 'responsavel',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                accepted_at TEXT,
                accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS app_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                kind TEXT NOT NULL DEFAULT 'info',
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                read_at TEXT
            );

            CREATE TABLE IF NOT EXISTS finance_accounts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                institution TEXT NOT NULL DEFAULT '',
                account_type TEXT NOT NULL DEFAULT 'cash' CHECK(account_type IN ('cash','checking','savings','wallet','reserve')),
                currency TEXT NOT NULL DEFAULT 'BRL',
                opening_balance_cents BIGINT NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_entries (
                id SERIAL PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
                kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
                status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('pending','posted','voided')),
                amount_cents BIGINT NOT NULL CHECK(amount_cents > 0),
                category TEXT NOT NULL DEFAULT 'Geral',
                description TEXT NOT NULL,
                counterparty TEXT NOT NULL DEFAULT '',
                cost_center TEXT NOT NULL DEFAULT 'Operação',
                payment_method TEXT NOT NULL DEFAULT '',
                document_ref TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                occurred_on TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                posted_at TEXT,
                posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                voided_at TEXT,
                voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                void_reason TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS finance_commitments (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Infraestrutura',
                supplier TEXT NOT NULL DEFAULT '',
                amount_cents BIGINT NOT NULL CHECK(amount_cents > 0),
                cadence TEXT NOT NULL DEFAULT 'monthly' CHECK(cadence IN ('weekly','monthly','annual','one_off')),
                next_due_on TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT NOT NULL DEFAULT '',
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_audit_logs (
                id SERIAL PRIMARY KEY,
                actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                object_type TEXT NOT NULL,
                object_id INTEGER,
                snapshot_json TEXT NOT NULL DEFAULT '{}',
                snapshot_sha256 TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rairo_node_configs (
                node_index INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                region TEXT NOT NULL DEFAULT 'Render',
                provider TEXT NOT NULL DEFAULT 'Render',
                environment TEXT NOT NULL DEFAULT 'production',
                capacity INTEGER NOT NULL DEFAULT 4,
                enabled INTEGER NOT NULL DEFAULT 1,
                drain_mode INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 100,
                health_path TEXT NOT NULL DEFAULT '/healthz',
                route_path TEXT NOT NULL DEFAULT '/v1/route/calculate',
                precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate',
                connect_timeout_s REAL NOT NULL DEFAULT 2.2,
                route_timeout_s REAL NOT NULL DEFAULT 10.0,
                cooldown_s INTEGER NOT NULL DEFAULT 20,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rairo_node_dispatch_logs (
                id SERIAL PRIMARY KEY,
                node_index INTEGER NOT NULL DEFAULT 0,
                node_name TEXT NOT NULL DEFAULT '',
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                request_id TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL DEFAULT '',
                profile TEXT NOT NULL DEFAULT '',
                prefetch INTEGER NOT NULL DEFAULT 0,
                http_status INTEGER,
                success INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_states (
                state TEXT PRIMARY KEY,
                redirect_uri TEXT NOT NULL,
                next_url TEXT,
                fingerprint TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at, revoked_at);
            CREATE INDEX IF NOT EXISTS idx_user_access_user_last ON user_access_log(user_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_access_ip ON user_access_log(ip_address);
            CREATE INDEX IF NOT EXISTS idx_activity_created ON request_activity_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_user_created ON request_activity_logs(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_ip_created ON request_activity_logs(ip_address, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_type_created ON request_activity_logs(event_type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_reports_geo ON reports(latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_created ON privacy_requests(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_routes_user_created ON route_history(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_route_feedback_created ON route_feedback(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_route_feedback_user ON route_feedback(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_risk_zones_geo ON risk_zones(active, latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_shared_routes_token ON shared_routes(token);
            CREATE INDEX IF NOT EXISTS idx_shared_routes_expiry ON shared_routes(expires_at);
            CREATE INDEX IF NOT EXISTS idx_live_trips_token ON live_trips(token);
            CREATE INDEX IF NOT EXISTS idx_live_trips_expiry ON live_trips(expires_at, active);
            CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
            CREATE INDEX IF NOT EXISTS idx_flow_samples_geo_time ON flow_samples(cell_lat, cell_lon, created_at);
            CREATE INDEX IF NOT EXISTS idx_flow_samples_time ON flow_samples(created_at);
            CREATE INDEX IF NOT EXISTS idx_nearby_presence_time ON nearby_presence(updated_at);
            CREATE INDEX IF NOT EXISTS idx_trusted_links_owner ON trusted_links(owner_user_id);
            CREATE INDEX IF NOT EXISTS idx_trusted_links_trusted ON trusted_links(trusted_user_id);
            CREATE INDEX IF NOT EXISTS idx_family_invites_expiry ON family_invites(expires_at);
            CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_account_date ON finance_entries(account_id, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_status_date ON finance_entries(status, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_kind_date ON finance_entries(kind, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_commitments_active_due ON finance_commitments(active, next_due_on);
            CREATE INDEX IF NOT EXISTS idx_finance_audit_object ON finance_audit_logs(object_type, object_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_rairo_node_configs_enabled ON rairo_node_configs(enabled, priority, node_index);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_node_time ON rairo_node_dispatch_logs(node_index, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_user_time ON rairo_node_dispatch_logs(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_success_time ON rairo_node_dispatch_logs(success, created_at DESC);
            """
        )

        # Additive migrations for existing PostgreSQL databases.
        user_columns = table_columns(db, "users")
        user_migrations = {
            "google_sub": "ALTER TABLE users ADD COLUMN google_sub TEXT",
            "avatar_url": "ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
            "auth_provider": "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'",
            "age": "ALTER TABLE users ADD COLUMN age INTEGER",
            "sex": "ALTER TABLE users ADD COLUMN sex TEXT NOT NULL DEFAULT ''",
            "is_app_driver": "ALTER TABLE users ADD COLUMN is_app_driver INTEGER",
            "night_safety_mode": "ALTER TABLE users ADD COLUMN night_safety_mode INTEGER NOT NULL DEFAULT 1",
            "route_preference": "ALTER TABLE users ADD COLUMN route_preference TEXT NOT NULL DEFAULT 'balanced'",
            "onboarding_completed_at": "ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT",
            "distance_unit": "ALTER TABLE users ADD COLUMN distance_unit TEXT NOT NULL DEFAULT 'km'",
            "vehicle_make": "ALTER TABLE users ADD COLUMN vehicle_make TEXT NOT NULL DEFAULT ''",
            "vehicle_model": "ALTER TABLE users ADD COLUMN vehicle_model TEXT NOT NULL DEFAULT ''",
            "vehicle_plate": "ALTER TABLE users ADD COLUMN vehicle_plate TEXT NOT NULL DEFAULT ''",
            "vehicle_year": "ALTER TABLE users ADD COLUMN vehicle_year TEXT NOT NULL DEFAULT ''",
            "preferred_fuel_networks": "ALTER TABLE users ADD COLUMN preferred_fuel_networks TEXT NOT NULL DEFAULT '[]'",
            "home_label": "ALTER TABLE users ADD COLUMN home_label TEXT NOT NULL DEFAULT ''",
            "work_label": "ALTER TABLE users ADD COLUMN work_label TEXT NOT NULL DEFAULT ''",
            "presence_visible": "ALTER TABLE users ADD COLUMN presence_visible INTEGER NOT NULL DEFAULT 0",
            "presence_terms_accepted_at": "ALTER TABLE users ADD COLUMN presence_terms_accepted_at TEXT",
            "emergency_name": "ALTER TABLE users ADD COLUMN emergency_name TEXT NOT NULL DEFAULT ''",
            "emergency_phone": "ALTER TABLE users ADD COLUMN emergency_phone TEXT NOT NULL DEFAULT ''",
            "map_style": "ALTER TABLE users ADD COLUMN map_style TEXT NOT NULL DEFAULT 'auto'",
            "map_accent": "ALTER TABLE users ADD COLUMN map_accent TEXT NOT NULL DEFAULT 'violet'",
            "avoid_ferries": "ALTER TABLE users ADD COLUMN avoid_ferries INTEGER NOT NULL DEFAULT 0",
            "avoid_tolls": "ALTER TABLE users ADD COLUMN avoid_tolls INTEGER NOT NULL DEFAULT 0",
            "avoid_unpaved": "ALTER TABLE users ADD COLUMN avoid_unpaved INTEGER NOT NULL DEFAULT 0",
        }
        for column, ddl in user_migrations.items():
            if column not in user_columns:
                db.execute(ddl)
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL")

        node_columns = table_columns(db, "rairo_node_configs")
        node_migrations = {
            "provider": "ALTER TABLE rairo_node_configs ADD COLUMN provider TEXT NOT NULL DEFAULT 'Render'",
            "environment": "ALTER TABLE rairo_node_configs ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'",
            "drain_mode": "ALTER TABLE rairo_node_configs ADD COLUMN drain_mode INTEGER NOT NULL DEFAULT 0",
            "route_path": "ALTER TABLE rairo_node_configs ADD COLUMN route_path TEXT NOT NULL DEFAULT '/v1/route/calculate'",
            "precalc_path": "ALTER TABLE rairo_node_configs ADD COLUMN precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate'",
            "connect_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN connect_timeout_s REAL NOT NULL DEFAULT 2.2",
            "route_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN route_timeout_s REAL NOT NULL DEFAULT 10.0",
            "cooldown_s": "ALTER TABLE rairo_node_configs ADD COLUMN cooldown_s INTEGER NOT NULL DEFAULT 20",
            "notes": "ALTER TABLE rairo_node_configs ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        }
        for column, ddl in node_migrations.items():
            if column not in node_columns:
                db.execute(ddl)

        risk_columns = table_columns(db, "risk_zones")
        risk_migrations = {
            "neighborhood": "ALTER TABLE risk_zones ADD COLUMN neighborhood TEXT NOT NULL DEFAULT ''",
            "city": "ALTER TABLE risk_zones ADD COLUMN city TEXT NOT NULL DEFAULT ''",
            "state": "ALTER TABLE risk_zones ADD COLUMN state TEXT NOT NULL DEFAULT ''",
            "danger_level": "ALTER TABLE risk_zones ADD COLUMN danger_level INTEGER NOT NULL DEFAULT 2",
            "block_routes": "ALTER TABLE risk_zones ADD COLUMN block_routes INTEGER NOT NULL DEFAULT 0",
        }
        danger_was_missing = "danger_level" not in risk_columns
        for column, ddl in risk_migrations.items():
            if column not in risk_columns:
                db.execute(ddl)
        if danger_was_missing:
            db.execute("UPDATE risk_zones SET danger_level=GREATEST(1, LEAST(5, 5-level_cap))")
        db.execute("CREATE INDEX IF NOT EXISTS idx_risk_zones_block ON risk_zones(active, block_routes, latitude, longitude)")

        report_columns = table_columns(db, "reports")
        report_migrations = {
            "road_snapped": "ALTER TABLE reports ADD COLUMN road_snapped INTEGER NOT NULL DEFAULT 0",
            "snap_distance_m": "ALTER TABLE reports ADD COLUMN snap_distance_m REAL",
            "road_name": "ALTER TABLE reports ADD COLUMN road_name TEXT NOT NULL DEFAULT ''",
        }
        for column, ddl in report_migrations.items():
            if column not in report_columns:
                db.execute(ddl)

        oauth_columns = table_columns(db, "oauth_states")
        if "fingerprint" not in oauth_columns:
            db.execute("ALTER TABLE oauth_states ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''")

        # Security migration: old builds created admin@rairo.local with the
        # published password Vano Maps@2026!. Disable only that exact legacy hash.
        legacy_admin = db.execute("SELECT id,password_hash FROM users WHERE email=?", ("admin@rairo.local",)).fetchone()
        if legacy_admin and verify_password(legacy_admin["password_hash"], "Vano Maps@2026!"):
            db.execute("UPDATE users SET password_hash=?,is_active=0 WHERE id=?", (hash_password(secrets.token_urlsafe(48)), legacy_admin["id"]))

        # A password administrator is now provisioned only when BOTH values are
        # explicitly supplied by the deployment. No known default credentials.
        admin_email = os.environ.get("RAIRO_ADMIN_EMAIL", "").strip().lower()
        admin_password_env = os.environ.get("RAIRO_ADMIN_PASSWORD", "").strip()
        if admin_email and admin_password_env and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", admin_email):
            existing = db.execute("SELECT id FROM users WHERE email = ?", (admin_email,)).fetchone()
            if not existing:
                db.execute(
                    "INSERT INTO users(name,email,password_hash,role,locale,created_at) VALUES(?,?,?,?,?,?)",
                    ("Administrador VANO MAPS", admin_email, hash_password(admin_password_env), "admin", "pt-BR", utcnow_iso()),
                )
            else:
                db.execute("UPDATE users SET password_hash=?, role='admin', is_active=1 WHERE id=?", (hash_password(admin_password_env), existing["id"]))

        # Optional owner bootstrap is explicit. Leaving RAIRO_OWNER_EMAIL unset
        # never creates or promotes a hidden/source-code identity.
        if RAIRO_OWNER_EMAIL and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", RAIRO_OWNER_EMAIL):
            owner = db.execute("SELECT id FROM users WHERE email=?", (RAIRO_OWNER_EMAIL,)).fetchone()
            if owner:
                db.execute("UPDATE users SET role='admin', is_active=1 WHERE id=?", (owner["id"],))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db_with_retry():
    """Initialize PostgreSQL with a short retry window during platform startup."""
    attempts = max(1, min(10, int(os.environ.get("DATABASE_INIT_RETRIES", "6") or 6)))
    delay = max(1, min(10, int(os.environ.get("DATABASE_INIT_RETRY_DELAY", "2") or 2)))
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            init_db()
            return
        except RuntimeError:
            # Erro de configuração (URL ausente/placeholder) não melhora com retry.
            raise
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                break
            print(f"[VANO MAPS] PostgreSQL ainda não disponível (tentativa {attempt}/{attempts}); nova tentativa em {delay}s: {exc}", flush=True)
            time.sleep(delay)
    raise last_error


if os.environ.get("VANO_SKIP_DB_INIT", "0").strip().lower() not in {"1", "true", "yes", "on"}:
    init_db_with_retry()

# -----------------------------
# Security / session helpers
# -----------------------------

RATE_BUCKETS = {}
RATE_LOCK = threading.Lock()
ROAD_AWARENESS_CACHE = {}
ROAD_AWARENESS_LOCK = threading.Lock()
SAFE_STOPS_CACHE = {}
SAFE_STOPS_LOCK = threading.Lock()
PARKING_CACHE = {}
PARKING_LOCK = threading.Lock()
LIVE_CONTEXT_CACHE = {}
LIVE_CONTEXT_LOCK = threading.Lock()
WEATHER_CACHE = {}
WEATHER_LOCK = threading.Lock()
SEARCH_RESULT_CACHE = {}
SEARCH_RESULT_LOCK = threading.Lock()
USER_IP_LOG_CACHE = {}
USER_IP_LOG_LOCK = threading.Lock()
USER_IP_LOG_INTERVAL = 10 * 60
ACTIVITY_LOG_QUEUE = queue.Queue(maxsize=max(1000, min(50000, int(os.environ.get("RAIRO_ACTIVITY_LOG_QUEUE", "12000") or 12000))))
ACTIVITY_LOG_RETENTION_DAYS = max(7, min(3650, int(os.environ.get("RAIRO_ACTIVITY_LOG_RETENTION_DAYS", "90") or 90)))
ACTIVITY_LOG_WORKER_LOCK = threading.Lock()
ACTIVITY_LOG_WORKER_STARTED = False
_ACTIVITY_SENSITIVE_KEYS = {
    "password", "password_hash", "pin", "token", "access_token", "refresh_token",
    "csrf_token", "code", "client_secret", "secret", "authorization"
}


def _normalize_ip(value):
    raw = str(value or "").strip().strip('"').strip("'")
    if not raw:
        return None
    # IPv6 may be wrapped in brackets; remove a port only for unambiguous IPv4.
    if raw.startswith("[") and "]" in raw:
        raw = raw[1:raw.index("]")]
    elif raw.count(":") == 1 and "." in raw:
        raw = raw.split(":", 1)[0]
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


def client_ip():
    """Return the client address after the explicitly configured trusted proxies.

    ``ProxyFix`` rewrites ``REMOTE_ADDR`` only from the number of forwarding hops
    configured in ``RAIRO_PROXY_HOPS``. We intentionally do not trust arbitrary
    X-Forwarded-For/CF headers here, which prevents a direct client from forging
    the address that appears in the admin audit log.
    """
    resolved = _normalize_ip(request.remote_addr)
    return resolved or "unknown"


_SENSITIVE_PATH_TOKEN_RE = re.compile(
    r"(/(?:family/invite|route/share|api/shared-route|api/live-trip|live)/)[^/?#]+",
    re.IGNORECASE,
)


def _safe_activity_path(value):
    """Redact capability/invite tokens that are carried in URL path segments."""
    text = str(value or "")[:1000]
    return _SENSITIVE_PATH_TOKEN_RE.sub(r"\1[redacted]", text)[:500]


def _safe_activity_metadata(value, depth=0):
    """Bound and redact browser/server audit metadata before it reaches PostgreSQL."""
    if depth > 3:
        return "[truncated]"
    if isinstance(value, dict):
        out = {}
        for key, item in list(value.items())[:32]:
            skey = str(key)[:80]
            if skey.lower() in _ACTIVITY_SENSITIVE_KEYS or any(x in skey.lower() for x in ("password", "secret", "token", "csrf", "authorization")):
                out[skey] = "[redacted]"
            elif skey.lower() in {"href", "page", "path", "referrer", "url"} and isinstance(item, str):
                out[skey] = _safe_activity_path(item)
            else:
                out[skey] = _safe_activity_metadata(item, depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [_safe_activity_metadata(x, depth + 1) for x in list(value)[:24]]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value
    return str(value)[:500]


def _activity_log_worker():
    db = None
    last_cleanup = 0.0
    while True:
        first = ACTIVITY_LOG_QUEUE.get()
        batch = [first]
        try:
            # Small batches keep request latency near zero without holding rows for long.
            deadline = time.monotonic() + 0.08
            while len(batch) < 64 and time.monotonic() < deadline:
                try:
                    batch.append(ACTIVITY_LOG_QUEUE.get_nowait())
                except queue.Empty:
                    break
            rows = [(
                item.get("user_id"), item.get("event_type", "request"), item.get("method", ""),
                item.get("path", ""), item.get("endpoint", ""), item.get("status_code"),
                item.get("ip_address", "unknown"), item.get("user_agent", ""), item.get("referrer", ""),
                json.dumps(_safe_activity_metadata(item.get("metadata") or {}), ensure_ascii=False, separators=(",", ":")),
                int(item.get("duration_ms") or 0), item.get("created_at") or utcnow_iso(),
            ) for item in batch]
            for attempt in range(2):
                try:
                    if db is None:
                        db = connect_db()
                    db.executemany(
                        """INSERT INTO request_activity_logs(
                               user_id,event_type,method,path,endpoint,status_code,ip_address,user_agent,referrer,metadata,duration_ms,created_at
                           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        rows,
                    )
                    db.commit()
                    now_cleanup = time.monotonic()
                    if now_cleanup - last_cleanup > 3600:
                        cutoff = (datetime.now(timezone.utc) - timedelta(days=ACTIVITY_LOG_RETENTION_DAYS)).replace(microsecond=0).isoformat()
                        try:
                            db.execute("DELETE FROM request_activity_logs WHERE created_at < ?", (cutoff,))
                            db.commit(); last_cleanup = now_cleanup
                        except Exception:
                            db.rollback()
                    break
                except Exception:
                    try:
                        if db is not None:
                            db.rollback(); db.close()
                    except Exception:
                        pass
                    db = None
                    if attempt:
                        # Audit logging must never take the app down.
                        break
        finally:
            for _ in batch:
                ACTIVITY_LOG_QUEUE.task_done()


def _ensure_activity_log_worker():
    global ACTIVITY_LOG_WORKER_STARTED
    if ACTIVITY_LOG_WORKER_STARTED:
        return
    with ACTIVITY_LOG_WORKER_LOCK:
        if ACTIVITY_LOG_WORKER_STARTED:
            return
        threading.Thread(target=_activity_log_worker, name="rairo-activity-audit", daemon=True).start()
        ACTIVITY_LOG_WORKER_STARTED = True


def _safe_referrer():
    raw = str(request.referrer or "")[:1000]
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}{_safe_activity_path(parsed.path)}"[:500]
    except Exception:
        pass
    return ""


def record_activity(event_type="request", metadata=None, *, status_code=None, method=None, path=None, endpoint=None, duration_ms=0, user_id=None):
    """Queue one admin-visible audit event without delaying the request path."""
    try:
        _ensure_activity_log_worker()
        item = {
            "user_id": user_id if user_id is not None else session.get("user_id"),
            "event_type": str(event_type or "request")[:40],
            "method": str(method if method is not None else request.method)[:12],
            "path": _safe_activity_path(path if path is not None else request.path),
            "endpoint": str(endpoint if endpoint is not None else (request.endpoint or ""))[:160],
            "status_code": int(status_code) if status_code is not None else None,
            "ip_address": client_ip(),
            "user_agent": (request.headers.get("User-Agent") or "")[:500],
            "referrer": _safe_referrer(),
            "metadata": _safe_activity_metadata(metadata or {}),
            "duration_ms": max(0, min(600000, int(duration_ms or 0))),
            "created_at": utcnow_iso(),
        }
        try:
            ACTIVITY_LOG_QUEUE.put_nowait(item)
        except queue.Full:
            app.logger.warning("VANO MAPS activity log queue full; dropping event")
    except Exception:
        app.logger.exception("Could not queue VANO MAPS activity log")


def _request_forwarding_diagnostics():
    """Admin-only diagnostics; values are recorded, never trusted for identity."""
    raw = (request.headers.get("X-Forwarded-For") or "")[:500]
    chain = [x.strip() for x in raw.split(",") if x.strip()][:8]
    return {
        "proxy_hops": RAIRO_PROXY_HOPS,
        "forwarded_for": chain,
        "forwarded_proto": (request.headers.get("X-Forwarded-Proto") or "")[:24],
    }


@app.before_request
def start_request_activity_timer():
    g.rairo_request_started = time.monotonic()


@app.after_request
def record_request_activity(response):
    try:
        endpoint = request.endpoint or ""
        # Static files are already covered by web-server/CDN logs; recording them
        # would drown out the user journey and create unnecessary database writes.
        fast_mobile_paths = {
            "/api/mobile/bootstrap", "/api/mobile/navigation/config",
            "/api/mobile/navigation/batch", "/mobile/health",
        }
        if endpoint != "static" and request.path != "/healthz" and endpoint != "api_telemetry_event" and request.path not in fast_mobile_paths:
            started = getattr(g, "rairo_request_started", None)
            duration = int((time.monotonic() - started) * 1000) if started else 0
            meta = {
                "query_keys": [str(k)[:80] for k in request.args.keys()][:32],
                "content_type": (request.content_type or "")[:120],
            }
            if request.path.startswith("/admin"):
                meta.update(_request_forwarding_diagnostics())
            record_activity("request", meta, status_code=response.status_code, duration_ms=duration)
    except Exception:
        pass
    return response


def _user_agent_summary(user_agent):
    ua = (user_agent or "")[:500]
    low = ua.lower()
    if "edg/" in low or "edge/" in low:
        browser = "Edge"
    elif "opr/" in low or "opera" in low:
        browser = "Opera"
    elif "chrome/" in low or "crios/" in low:
        browser = "Chrome"
    elif "firefox/" in low or "fxios/" in low:
        browser = "Firefox"
    elif "safari/" in low:
        browser = "Safari"
    else:
        browser = "Navegador"
    if "android" in low:
        os_name = "Android"
    elif "iphone" in low or "ipad" in low or "ios" in low:
        os_name = "iOS/iPadOS"
    elif "windows" in low:
        os_name = "Windows"
    elif "mac os" in low or "macintosh" in low:
        os_name = "macOS"
    elif "linux" in low:
        os_name = "Linux"
    else:
        os_name = "Sistema"
    if "ipad" in low or "tablet" in low:
        device_type = "Tablet"
    elif "mobile" in low or "iphone" in low or "android" in low:
        device_type = "Celular"
    else:
        device_type = "Computador"
    return browser, os_name, device_type


def record_user_access(user_id, force=False):
    """Store a compact, admin-only IP history for authenticated users.

    Writes are throttled per worker/IP so normal map polling does not create
    unnecessary PostgreSQL traffic. A forced write is used on successful login.
    """
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return
    ip = client_ip()
    if ip == "unknown":
        return
    now_ts = time.time()
    key = (uid, ip)
    if not force:
        with USER_IP_LOG_LOCK:
            if now_ts - USER_IP_LOG_CACHE.get(key, 0) < USER_IP_LOG_INTERVAL:
                return
            USER_IP_LOG_CACHE[key] = now_ts
    ua = (request.headers.get("User-Agent") or "")[:500]
    now = utcnow_iso()
    db = get_db()
    try:
        db.execute(
            """INSERT INTO user_access_log(user_id,ip_address,user_agent,first_seen_at,last_seen_at,request_count)
               VALUES(?,?,?,?,?,1)
               ON CONFLICT (user_id,ip_address) DO UPDATE SET
                 user_agent=EXCLUDED.user_agent,
                 last_seen_at=EXCLUDED.last_seen_at,
                 request_count=user_access_log.request_count+1""",
            (uid, ip, ua, now, now),
        )
        db.commit()
        with USER_IP_LOG_LOCK:
            USER_IP_LOG_CACHE[key] = now_ts
    except Exception:
        db.rollback()
        app.logger.exception("Could not record authenticated user IP")


def rate_limit(key, limit=20, window=60):
    now = time.time()
    bucket_key = f"{key}:{client_ip()}"
    with RATE_LOCK:
        values = RATE_BUCKETS.setdefault(bucket_key, [])
        values[:] = [x for x in values if now - x < window]
        if len(values) >= limit:
            return False
        values.append(now)
        return True


def _remember_token_hash(raw_token):
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


def _remember_cookie_tokens():
    """Return every remembered-login token visible in the current context.

    A normal top-level cookie and a partitioned embedded cookie can diverge
    after browser/privacy changes.  Logout must revoke *both* values or an old
    partitioned token may silently sign the user back in on the next request.
    """
    values = []
    for name in (REMEMBER_COOKIE_NAME, REMEMBER_EMBED_COOKIE_NAME):
        raw = (request.cookies.get(name) or "").strip()
        if raw and raw not in values:
            values.append(raw)
    return values


def _remember_cookie_token():
    # Restore uses the first usable token, while logout revokes every token.
    values = _remember_cookie_tokens()
    return values[0] if values else ""


def issue_persistent_login(user_id):
    """Create a revocable, server-side remembered-login token.

    Only a SHA-256 hash is stored in SQLite. The random token itself exists
    solely in the browser cookie. A fresh token is issued on every successful
    login/register/OAuth completion and can be revoked explicitly on logout.
    """
    raw = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires = now + timedelta(days=REMEMBER_LOGIN_DAYS)
    db = get_db()
    # Keep the most recent device sessions, but prune expired/revoked records.
    db.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)", (now.isoformat(), (now - timedelta(days=7)).isoformat()))
    db.execute(
        "INSERT INTO auth_sessions(token_hash,user_id,created_at,last_used_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL)",
        (_remember_token_hash(raw), int(user_id), now.isoformat(), now.isoformat(), expires.isoformat()),
    )
    # Avoid an unbounded number of remembered devices/tokens for one account.
    stale = db.execute(
        "SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY last_used_at DESC LIMIT -1 OFFSET 12",
        (int(user_id),),
    ).fetchall()
    if stale:
        db.executemany("UPDATE auth_sessions SET revoked_at=? WHERE id=?", [(now.isoformat(), row["id"]) for row in stale])
    db.commit()
    g.rairo_remember_set = raw
    g.rairo_remember_expires = expires
    return raw


def revoke_current_persistent_login():
    # Revoke every visible remembered-login cookie. This fixes a logout edge
    # case where the top-level and partitioned cookies held different tokens.
    raws = _remember_cookie_tokens()
    if raws:
        try:
            db = get_db()
            now = utcnow_iso()
            db.executemany(
                "UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
                [(now, _remember_token_hash(raw)) for raw in raws],
            )
            db.commit()
        except Exception:
            app.logger.exception("Could not revoke remembered login during logout")
    g.rairo_remember_clear = True


@app.before_request
def restore_persistent_login():
    """Restore an authenticated Flask session after a browser restart.

    This runs only when the signed Flask session cookie is absent. It does not
    bypass account state: inactive users and revoked/expired tokens are ignored.
    """
    if session.get("user_id"):
        return
    raw = _remember_cookie_token()
    if not raw:
        return
    now = datetime.now(timezone.utc).replace(microsecond=0)
    row = get_db().execute(
        """
        SELECT a.id,a.user_id,a.last_used_at,a.expires_at,u.is_active
        FROM auth_sessions a JOIN users u ON u.id=a.user_id
        WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>?
        LIMIT 1
        """,
        (_remember_token_hash(raw), now.isoformat()),
    ).fetchone()
    if not row or not row["is_active"]:
        g.rairo_remember_clear = True
        return
    session["user_id"] = int(row["user_id"])
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    # Sliding lifetime: active devices remain signed in. Rotation every 30 days
    # reduces the useful lifetime of a copied browser token.
    try:
        last_used = datetime.fromisoformat(row["last_used_at"])
        if last_used.tzinfo is None:
            last_used = last_used.replace(tzinfo=timezone.utc)
    except Exception:
        last_used = now - timedelta(days=31)
    if now - last_used >= timedelta(days=30):
        get_db().execute("UPDATE auth_sessions SET revoked_at=? WHERE id=?", (now.isoformat(), row["id"]))
        get_db().commit()
        issue_persistent_login(row["user_id"])
    else:
        get_db().execute("UPDATE auth_sessions SET last_used_at=? WHERE id=?", (now.isoformat(), row["id"]))
        get_db().commit()


@app.before_request
def record_authenticated_ip():
    uid = session.get("user_id")
    fast_mobile_paths = {
        "/api/mobile/bootstrap", "/api/mobile/navigation/config",
        "/api/mobile/navigation/batch", "/mobile/health",
    }
    if not uid or request.endpoint in {"static", "healthz"} or request.path in fast_mobile_paths:
        return
    record_user_access(uid)


@app.after_request
def persistent_login_cookie(response):
    max_age = REMEMBER_LOGIN_DAYS * 24 * 60 * 60
    if getattr(g, "rairo_remember_clear", False):
        response.delete_cookie(REMEMBER_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="Lax")
        response.delete_cookie(REMEMBER_EMBED_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="None", partitioned=True)
        return response
    raw = getattr(g, "rairo_remember_set", None)
    if raw:
        response.set_cookie(
            REMEMBER_COOKIE_NAME, raw, max_age=max_age, secure=True, httponly=True,
            samesite="Lax", path="/",
        )
        response.set_cookie(
            REMEMBER_EMBED_COOKIE_NAME, raw, max_age=max_age, secure=True, httponly=True,
            samesite="None", partitioned=True, path="/",
        )
    return response


def csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def validate_csrf():
    sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    expected = session.get("csrf_token")
    return bool(sent and expected and secrets.compare_digest(sent, expected))


@app.context_processor
def inject_globals():
    endpoint = request.endpoint if has_request_context() else None
    path = request.path if has_request_context() else "/"
    # Query strings, Render hostnames and temporary preview URLs should never
    # become canonical. Every HTML page points to the stable production origin.
    canonical_path = SEO_CANONICAL_PATHS.get(endpoint, path if path.startswith("/") else f"/{path}")
    public_origin = PUBLIC_SITE_URL or (request.host_url.rstrip("/") if has_request_context() else "")
    canonical_url = f"{public_origin}{canonical_path}"
    return {
        "APP_NAME": APP_NAME,
        "vano_build_id": VANO_BUILD_ID,
        "csrf_token": csrf_token,
        "current_year": datetime.now().year,
        "google_ready": google_ready(),
        "safety_level_from_score": safety_level_from_score if "safety_level_from_score" in globals() else None,
        "seo_indexable": endpoint in SEO_INDEXABLE_ENDPOINTS,
        "seo_canonical_url": canonical_url,
        "public_site_url": public_origin,
        "active_locale": active_ui_locale(),
        "locale_source": getattr(g, "rairo_locale_source", "accept_language") if has_request_context() else "default",
        "detected_country": getattr(g, "rairo_country", "") if has_request_context() else "",
    }


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    db = get_db()
    row = db.execute(
        "SELECT id,name,email,role,locale,is_active,created_at,last_login_at,google_sub,avatar_url,auth_provider,age,sex,is_app_driver,night_safety_mode,route_preference,onboarding_completed_at,distance_unit,vehicle_make,vehicle_model,vehicle_plate,vehicle_year,preferred_fuel_networks,home_label,work_label,presence_visible,presence_terms_accepted_at,emergency_name,emergency_phone,map_style,map_accent,avoid_ferries,avoid_tolls,avoid_unpaved FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    # Role is authoritative in the database. Never elevate a password account
    # merely because its unverified local e-mail matches an admin allow-list.
    return row


def onboarding_needed(user):
    if not user or user["role"] == "admin":
        return False
    return not (
        user["onboarding_completed_at"]
        and user["age"] is not None
        and user["is_app_driver"] is not None
    )


@app.before_request
def enforce_profile_onboarding():
    """Keep every account-creation method on the same profile-completion flow."""
    if not session.get("user_id"):
        return
    endpoint = request.endpoint or ""
    allowed = {
        "onboarding", "logout", "google_login", "google_callback", "login", "register",
        "healthz", "static", "frame_test", "embed",
        "mobile_bootstrap", "mobile_navigation_config", "mobile_navigation_batch", "mobile_health",
    }
    if endpoint in allowed or endpoint.startswith("static"):
        return
    user = current_user()
    if not onboarding_needed(user):
        return
    if request.path.startswith("/api/"):
        return jsonify({
            "error": "Complete seu perfil antes de continuar.",
            "code": "profile_incomplete",
            "onboarding_url": url_for("onboarding"),
        }), 428
    return redirect(url_for("onboarding", next=request.full_path if request.query_string else request.path))


@app.context_processor
def inject_user():
    return {"current_user": current_user()}


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user or not user["is_active"]:
            session.clear()
            flash("Entre na sua conta para continuar.", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user or user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def safe_next_url(value):
    """Allow only local absolute paths for post-authentication redirects."""
    value = str(value or "")[:1000]
    if not value or not value.startswith("/") or value.startswith("//"):
        return None
    if "\\" in value or "\r" in value or "\n" in value:
        return None
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return None
    return value


def audit(action, metadata=None, user_id=None):
    try:
        db = get_db()
        safe_meta = _safe_activity_metadata(metadata or {})
        safe_meta.update({"ip": client_ip(), "path": request.path[:300], "method": request.method[:12]})
        db.execute(
            "INSERT INTO audit_logs(user_id,action,metadata,created_at) VALUES(?,?,?,?)",
            (user_id or session.get("user_id"), action, json.dumps(safe_meta, ensure_ascii=False), utcnow_iso()),
        )
        db.commit()
    except Exception:
        pass

# -----------------------------
# Google OpenID Connect
# -----------------------------

def google_ready():
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

def google_redirect_uri():
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    return url_for("google_callback", _external=True)

def google_user_from_token(access_token):
    response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def oauth_client_fingerprint():
    # Used only as a fallback when an embedded browser drops the OAuth cookie.
    # It deliberately avoids storing the raw IP/user-agent in the database.
    material = "|".join([
        client_ip(),
        request.headers.get("User-Agent", "")[:500],
        request.headers.get("Accept-Language", "")[:120],
    ])
    return hashlib.sha256(material.encode("utf-8", "ignore")).hexdigest()


def oauth_cookie_value(state):
    signature = hmac.new(
        SECRET_KEY.encode("utf-8", "ignore"),
        state.encode("utf-8", "ignore"),
        hashlib.sha256,
    ).hexdigest()
    return f"{state}.{signature}"


def oauth_cookie_matches(returned_state):
    raw = request.cookies.get("rairo_oauth_state", "")
    if not raw or "." not in raw or not returned_state:
        return False
    cookie_state, signature = raw.rsplit(".", 1)
    if not secrets.compare_digest(cookie_state, returned_state):
        return False
    expected = oauth_cookie_value(cookie_state).rsplit(".", 1)[1]
    return secrets.compare_digest(signature, expected)


def persist_google_oauth_state(state, redirect_uri, next_url=None):
    """Persist one-time OAuth state independently of the Flask session.

    The app can be embedded with Partitioned cookies. A server-side record plus
    a short-lived signed OAuth cookie keeps the callback reliable on Android
    while still binding fallback validation to the initiating client.
    """
    now = datetime.now(timezone.utc)
    created = now.replace(microsecond=0).isoformat()
    expires = (now + timedelta(minutes=12)).replace(microsecond=0).isoformat()
    db = get_db()
    db.execute("DELETE FROM oauth_states WHERE expires_at < ?", (created,))
    db.execute(
        """INSERT INTO oauth_states(state,redirect_uri,next_url,fingerprint,created_at,expires_at)
           VALUES(?,?,?,?,?,?)
           ON CONFLICT(state) DO UPDATE SET
             redirect_uri=EXCLUDED.redirect_uri,
             next_url=EXCLUDED.next_url,
             fingerprint=EXCLUDED.fingerprint,
             created_at=EXCLUDED.created_at,
             expires_at=EXCLUDED.expires_at""",
        (state, redirect_uri, safe_next_url(next_url), oauth_client_fingerprint(), created, expires),
    )
    db.commit()


def consume_google_oauth_state(returned_state):
    """Atomically consume a valid OAuth state and return stored context."""
    if not returned_state:
        return None
    db = get_db()
    now = utcnow_iso()
    row = db.execute(
        "SELECT state,redirect_uri,next_url,fingerprint,expires_at FROM oauth_states WHERE state=? AND expires_at>=?",
        (returned_state, now),
    ).fetchone()
    if not row:
        db.execute("DELETE FROM oauth_states WHERE state=? OR expires_at < ?", (returned_state, now))
        db.commit()
        return None
    db.execute("DELETE FROM oauth_states WHERE state=?", (returned_state,))
    db.commit()
    return row

# -----------------------------
# Validation / route scoring
# -----------------------------

CATEGORY_META = {
    "robbery": {"label": "Roubo/furto", "weight": 1.35, "quiet": 0.15, "icon": "shield-alert"},
    "harassment": {"label": "Assédio/importunação", "weight": 1.30, "quiet": 0.10, "icon": "user-alert"},
    "poor_lighting": {"label": "Iluminação ruim", "weight": 1.05, "quiet": 0.05, "icon": "moon"},
    "accident": {"label": "Acidente/risco viário", "weight": 1.15, "quiet": 0.20, "icon": "triangle-alert"},
    "traffic": {"label": "Trânsito parado", "weight": 0.72, "quiet": 0.45, "icon": "traffic-cone"},
    "road_block": {"label": "Via bloqueada", "weight": 1.05, "quiet": 0.20, "icon": "ban"},
    "blitz": {"label": "Blitz/Fiscalização", "weight": 0.38, "quiet": 0.80, "icon": "badge-alert"},
    "speed_camera": {"label": "Radar/fiscalização eletrônica", "weight": 0.24, "quiet": 0.90, "icon": "camera"},
    "road_hazard": {"label": "Perigo na via", "weight": 0.95, "quiet": 0.25, "icon": "diamond-alert"},
    "pothole": {"label": "Buraco grande", "weight": 0.90, "quiet": 0.25, "icon": "circle-dot-dashed"},
    "stopped_vehicle": {"label": "Veículo parado", "weight": 0.92, "quiet": 0.25, "icon": "car-front"},
    "object_on_road": {"label": "Objeto na pista", "weight": 1.00, "quiet": 0.20, "icon": "package-open"},
    "broken_signal": {"label": "Semáforo com problema", "weight": 0.86, "quiet": 0.25, "icon": "traffic-cone"},
    "flood": {"label": "Alagamento", "weight": 1.25, "quiet": 0.10, "icon": "waves"},
    "construction": {"label": "Obra/bloqueio", "weight": 0.90, "quiet": 0.30, "icon": "construction"},
    "crowd": {"label": "Aglomeração/evento", "weight": 0.45, "quiet": 1.40, "icon": "users"},
    "other": {"label": "Outro alerta", "weight": 0.75, "quiet": 0.30, "icon": "info"},
}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def report_author_weight(user_id):
    """Small anti-abuse weight based only on admin-rejected prior reports.

    New/community users start at full weight. A history of confirmed false reports
    gradually reduces the impact of future reports without exposing identity.
    """
    if not user_id:
        return 1.0
    try:
        row = get_db().execute("SELECT COUNT(*) total,SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected FROM reports WHERE user_id=?", (user_id,)).fetchone()
        total = int((row["total"] if row else 0) or 0); rejected = int((row["rejected"] if row else 0) or 0)
        if total < 3 or rejected < 1: return 1.0
        return round(clamp(1.0 - (rejected/max(3,total))*.72, .55, 1.0), 3)
    except Exception:
        return 1.0


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_to_segment_distance_m(lat, lon, a_lon, a_lat, b_lon, b_lat):
    """Distância aproximada ponto-segmento em metros usando projeção local.

    Para navegação urbana isso é bem mais estável do que medir somente a distância
    aos vértices da polyline e evita falsos desvios em trechos longos e retos.
    """
    ref_lat = math.radians(float(lat))
    mx = 111320.0 * max(0.15, math.cos(ref_lat))
    my = 110540.0
    ax, ay = (float(a_lon) - float(lon)) * mx, (float(a_lat) - float(lat)) * my
    bx, by = (float(b_lon) - float(lon)) * mx, (float(b_lat) - float(lat)) * my
    vx, vy = bx - ax, by - ay
    vv = vx * vx + vy * vy
    if vv <= 1e-9:
        return math.hypot(ax, ay)
    # Ponto consultado é a origem (0,0) no plano local.
    t = clamp((-(ax * vx + ay * vy)) / vv, 0.0, 1.0)
    px, py = ax + vx * t, ay + vy * t
    return math.hypot(px, py)


def min_distance_to_geometry_m(lat, lon, coords):
    if not coords:
        return 10**9
    if len(coords) == 1:
        try:
            return haversine_m(lat, lon, float(coords[0][1]), float(coords[0][0]))
        except Exception:
            return 10**9
    # Mantém custo previsível em rotas enormes, mas mede segmentos em vez de só pontos.
    stride = max(1, (len(coords) - 1) // 1600)
    best = 10**9
    for i in range(0, len(coords) - 1, stride):
        j = min(len(coords) - 1, i + stride)
        try:
            a, b = coords[i], coords[j]
            d = point_to_segment_distance_m(lat, lon, a[0], a[1], b[0], b[1])
            if d < best:
                best = d
        except Exception:
            continue
    return best


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def safety_level_from_score(score):
    score = float(score or 0)
    if score >= 86: return 5
    if score >= 70: return 4
    if score >= 50: return 3
    if score >= 32: return 2
    if score >= 15: return 1
    return 0


def safety_level_label(level):
    return {
        5: "Muito favorável",
        4: "Favorável",
        3: "Atenção",
        2: "Cautela elevada",
        1: "Risco alto",
        0: "Evite se possível",
    }.get(int(level), "Atenção")


def zone_active_for_hour(zone, local_hour):
    if local_hour is None or zone["start_hour"] is None or zone["end_hour"] is None:
        return True
    start_h, end_h = int(zone["start_hour"]), int(zone["end_hour"])
    if start_h == end_h:
        return True
    if start_h < end_h:
        return start_h <= local_hour < end_h
    return local_hour >= start_h or local_hour < end_h


def _risk_profile_factor(category, travel_profile, local_hour=None):
    """Ajusta somente o tipo de exposição da viagem; nunca usa perfil demográfico."""
    personal = category in {"robbery", "harassment", "poor_lighting"}
    road = category in {"accident", "flood", "construction"}
    if travel_profile == "walking":
        factor = 1.20 if personal else 0.92 if road else 1.0
    elif travel_profile == "cycling":
        factor = 1.05 if personal else 1.12 if road else 1.0
    elif travel_profile == "motorcycle":
        # Motorcycles use the motorized road graph, but road-surface, crash,
        # construction and flood exposure matters more than it does in a car.
        factor = 0.88 if personal else 1.38 if road else 1.05
    else:  # driving
        factor = 0.78 if personal else 1.22 if road else 1.0
    if category == "poor_lighting" and local_hour is not None and (local_hour >= 18 or local_hour <= 6):
        factor *= 1.18 if travel_profile == "motorcycle" else (1.35 if travel_profile != "driving" else 1.12)
    return factor


def _risk_corridor_radius(category, severity, travel_profile):
    base = {
        "robbery": 460, "harassment": 360, "poor_lighting": 310,
        "accident": 245, "flood": 330, "construction": 210,
        "crowd": 190, "other": 240,
    }.get(category, 240)
    base *= .92 + clamp(float(severity), 1, 5) * .035
    if travel_profile == "driving" and category in {"accident", "flood", "construction"}:
        base *= 1.12
    elif travel_profile == "motorcycle" and category in {"accident", "flood", "construction"}:
        base *= 1.20
    return clamp(base, 150, 620)


def route_risk_metrics(route, reports, risk_zones=None, local_hour=None, travel_profile="walking"):
    """Vano Maps Safety Engine v3.

    O motor separa quatro ideias que antes ficavam misturadas:
    1) intensidade do evento/risco observado;
    2) quanto do corredor da rota fica exposto;
    3) hotspots concentrados (pior trecho);
    4) incerteza/cobertura dos dados.

    Isso evita dois erros comuns: uma rota longa ser punida só por ter mais pontos e
    uma rota sem relatos receber automaticamente nota 100.
    """
    coords = route.get("geometry", {}).get("coordinates", [])
    route_length_m = max(float(route.get("distance") or 0), 1.0)
    distance_km = route_length_m / 1000.0
    duration_min = float(route.get("duration", 0)) / 60.0
    now = datetime.now(timezone.utc)

    nearby = []
    zone_hits = []
    risk_factors = []
    level_cap = 5
    quiet_penalty = 0.0
    weighted_exposure_m = 0.0
    zone_exposure_m = 0.0
    hotspot_risk = 0.0
    high_signal_count = 0
    evidence_strength = 0.0
    confirmations_total = 0
    dimension_exposure = {"personal": 0.0, "road": 0.0, "context": 0.0}

    for report in reports:
        category = report["category"]
        severity_i = int(clamp(int(report["severity"]), 1, 5))
        radius = _risk_corridor_radius(category, severity_i, travel_profile)
        d = min_distance_to_geometry_m(report["latitude"], report["longitude"], coords)
        if d > radius + 260:
            continue

        created = parse_iso(report["created_at"]) or now
        age_hours = max(0.0, (now - created).total_seconds() / 3600)
        # Eventos recentes têm mais peso, mas não desaparecem abruptamente.
        freshness = math.exp(-age_hours / (24 * 7.0))
        proximity = max(0.0, 1.0 - (d / max(radius, 1))) ** 1.55
        severity = severity_i / 5.0
        confirmations = min(int(report["confirmations"] or 0), 12)
        confirmations_total += confirmations
        absence_votes = min(int(report.get("absence_votes") or 0), 8) if isinstance(report, dict) else 0
        confirmation_factor = (0.90 + min(.55, confirmations * .055)) * max(.42, 1.0 - absence_votes*.15)
        meta = CATEGORY_META.get(category, CATEGORY_META["other"])
        profile_factor = _risk_profile_factor(category, travel_profile, local_hour)
        quiet_time_factor = 1.20 if local_hour is not None and category == "crowd" and 16 <= local_hour <= 23 else 1.0

        strength = severity * float(meta["weight"]) * freshness * confirmation_factor * profile_factor
        event_risk = clamp(58.0 * strength * proximity, 0, 100)
        hotspot_risk = max(hotspot_risk, event_risk)
        if event_risk >= 24:
            high_signal_count += 1

        if d < radius:
            # Aproxima o comprimento do corredor atravessado pelo raio do evento.
            chord = 2.0 * math.sqrt(max(0.0, radius * radius - d * d))
            exposure = chord * clamp(.30 + strength * .70, .18, 1.70)
            weighted_exposure_m += exposure
            dim = "personal" if category in {"robbery", "harassment", "poor_lighting"} else "road" if category in {"accident", "road_block", "road_hazard", "pothole", "stopped_vehicle", "object_on_road", "broken_signal", "flood", "construction"} else "context"
            dimension_exposure[dim] += exposure

        quiet_penalty += 13.0 * severity * float(meta["quiet"]) * freshness * max(.08, proximity) * confirmation_factor * quiet_time_factor
        evidence_strength += clamp(event_risk / 42.0, 0.05, 1.5)

        if category == "robbery" and d <= 300 and severity_i >= 4 and confirmations >= 2 and freshness >= .20:
            level_cap = min(level_cap, 3)
            risk_factors.append("Relatos recentes e confirmados de roubo/furto próximos ao corredor")
        if category == "harassment" and d <= 220 and severity_i >= 4 and confirmations >= 2 and freshness >= .25 and travel_profile != "driving":
            level_cap = min(level_cap, 3)
            risk_factors.append("Relatos recentes e confirmados de assédio/importunação próximos")
        if category == "poor_lighting" and local_hour is not None and (local_hour >= 18 or local_hour <= 6) and d <= 180 and travel_profile != "driving":
            risk_factors.append("Trecho com iluminação ruim reportada no período noturno")
        if category == "flood" and d <= 180 and severity_i >= 4:
            risk_factors.append("Alagamento relevante reportado próximo da rota")

        if d <= min(430, radius + 80):
            nearby.append({
                "id": report["id"], "category": category, "category_label": meta["label"],
                "title": report["title"], "severity": severity_i,
                "distance_to_route_m": round(d), "created_at": report["created_at"],
                "lat": float(report["latitude"]), "lon": float(report["longitude"]),
                "confirmations": confirmations, "risk_strength": round(event_risk, 1),
            })

    zone_hotspot = 0.0
    for zone in (risk_zones or []):
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = clamp(float(zone["radius_m"] or 350), 80, 5000)
        d = min_distance_to_geometry_m(float(zone["latitude"]), float(zone["longitude"]), coords)
        if d > radius + 420:
            continue
        confidence = clamp(float(zone["confidence"] or .75), 0.0, 1.0)
        if d <= radius:
            cap = int(clamp(int(zone["level_cap"] if zone["level_cap"] is not None else 3), 0, 5))
            level_cap = min(level_cap, cap)
            proximity = max(.10, 1.0 - d / max(radius, 1))
            zone_event_risk = clamp(72.0 * confidence * (proximity ** 1.25), 0, 100)
            zone_hotspot = max(zone_hotspot, zone_event_risk)
            chord = 2.0 * math.sqrt(max(0.0, radius * radius - d * d))
            zone_exposure_m += chord * clamp(confidence, .2, 1.0)
            evidence_strength += .75 + confidence
            zone_hits.append({
                "id": zone["id"], "name": zone["name"], "risk_type": zone["risk_type"],
                "level_cap": cap, "distance_to_route_m": round(d), "source": zone["source"],
                "lat": float(zone["latitude"]), "lon": float(zone["longitude"]),
                "radius_m": round(radius), "confidence": round(confidence, 2),
            })
            risk_factors.append(f"Zona de atenção verificada: {zone['name']}")

    exposure_ratio = clamp(weighted_exposure_m / route_length_m, 0.0, 2.2)
    zone_ratio = clamp(zone_exposure_m / route_length_m, 0.0, 1.8)
    exposure_risk = clamp(exposure_ratio * 50.0, 0, 100)
    zone_risk = clamp(zone_ratio * 62.0, 0, 100)
    cluster_risk = clamp((high_signal_count / max(distance_km, .8)) * 11.0, 0, 55)
    hotspot_risk = max(hotspot_risk, zone_hotspot)

    observed_risk = clamp(
        exposure_risk * .46 + hotspot_risk * .34 + zone_risk * .14 + cluster_risk * .06,
        0, 99,
    )
    observed_safety = clamp(100.0 - observed_risk, 1.0, 100.0)

    # Confiança é evidência, não ausência de ocorrências. Sem dados suficientes o
    # motor converge para um prior conservador em vez de declarar a rota "100 segura".
    # Rotas longas exigem mais evidência para atingir a mesma confiança. Um único
    # relato não deve fazer o motor parecer igualmente informado em 800 m e 20 km.
    evidence_density = evidence_strength / max(1.0, math.sqrt(max(distance_km, .6)))
    data_confidence = clamp(
        30.0 + math.log1p(evidence_density) * 23.0 + min(15.0, confirmations_total * .85),
        30.0, 93.0,
    )
    conf_norm = clamp((data_confidence - 30.0) / 63.0, 0.0, 1.0)
    blend = .28 + .72 * conf_norm
    neutral_prior = 58.0
    uncertainty_penalty = max(0.0, 58.0 - data_confidence) * .09
    safety_score = clamp(neutral_prior + (observed_safety - neutral_prior) * blend - uncertainty_penalty, 1.0, 100.0)
    conservative_score = clamp(safety_score - max(0.0, 68.0 - data_confidence) * .12, 1.0, 100.0)

    if data_confidence < 42:
        level_cap = min(level_cap, 3)
    elif data_confidence < 58:
        level_cap = min(level_cap, 4)

    safety_level = min(safety_level_from_score(safety_score), level_cap)
    confidence_label = "alta" if data_confidence >= 78 else "média" if data_confidence >= 56 else "limitada"
    quiet_score = clamp(100.0 - quiet_penalty, 1.0, 100.0)

    def dim_score(value):
        return round(clamp((value / route_length_m) * 55.0, 0, 100), 1)

    return {
        "risk": round(observed_risk, 2),
        "observed_safety_score": round(observed_safety, 1),
        "safety_score": round(safety_score, 1),
        "safety_conservative_score": round(conservative_score, 1),
        "safety_level": int(safety_level),
        "safety_level_label": safety_level_label(safety_level),
        "data_confidence": round(data_confidence),
        "data_confidence_label": confidence_label,
        "uncertainty_penalty": round(uncertainty_penalty, 1),
        "risk_exposure_pct": round(clamp(exposure_ratio * 100.0, 0, 100), 1),
        "hotspot_risk": round(hotspot_risk, 1),
        "cluster_risk": round(cluster_risk, 1),
        "risk_profile": {k: dim_score(v) for k, v in dimension_exposure.items()},
        "evidence_count": len(nearby) + len(zone_hits),
        "evidence_density": round(evidence_density, 3),
        "quiet_score": round(quiet_score, 1),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min),
        "nearby_alerts": sorted(nearby, key=lambda x: (-x.get("risk_strength", 0), x["distance_to_route_m"]))[:14],
        "risk_zones": sorted(zone_hits, key=lambda x: (x["distance_to_route_m"], -x["confidence"]))[:10],
        "risk_factors": list(dict.fromkeys(risk_factors))[:7],
        "safety_engine": "rairo-safety-v3",
    }


def apply_route_intelligence(routes, travel_profile="walking", safety_bias=68, traffic_bias=60):
    """Enriquece alternativas com um score comparável (0-100).

    Não é um modelo opaco: é um motor de decisão explicável que normaliza tempo,
    segurança, trânsito, detour e confiança entre as alternativas daquela viagem.
    """
    if not routes:
        return routes
    safety_bias = clamp(float(safety_bias), 0, 100)
    traffic_bias = clamp(float(traffic_bias), 0, 100)
    fastest = min(max(float(r.get("duration") or 0), 1.0) for r in routes)
    shortest = min(max(float(r.get("distance") or 0), 1.0) for r in routes)
    max_traffic = max([float(r.get("traffic_score") or 0) for r in routes] + [1.0])

    # Pesos adaptativos. Segurança nunca vai a zero, mesmo se o usuário costuma escolher rápido.
    w_safety = 0.34 + (safety_bias / 100.0) * 0.25
    w_time = 0.38 - (safety_bias / 100.0) * 0.16
    w_traffic = (0.04 + (traffic_bias / 100.0) * 0.11) if is_motorized_profile(travel_profile) else 0.02
    w_detour = 0.08
    w_conf = 0.07
    total_w = w_safety + w_time + w_traffic + w_detour + w_conf

    for r in routes:
        duration = max(float(r.get("duration") or 0), 1.0)
        distance = max(float(r.get("distance") or 0), 1.0)
        safety = clamp(float(r.get("safety_conservative_score", r.get("safety_score")) or 0), 0, 100)
        eta_score = clamp(100.0 * fastest / duration, 45, 100)
        detour_score = clamp(100.0 - max(0.0, distance / shortest - 1.0) * 150.0, 45, 100)
        traffic_score = 100.0 - clamp(float(r.get("traffic_score") or 0), 0, 100)
        confidence = clamp(float(r.get("data_confidence") or 40), 0, 100)
        incident_penalty = min(24.0, int(r.get("incidents_count") or 0) * 4.0 + int(r.get("closures_count") or 0) * 9.0)
        low_safety_penalty = max(0, 3 - int(r.get("safety_level") or 0)) * 8.0
        raw = (
            safety * w_safety + eta_score * w_time + traffic_score * w_traffic +
            detour_score * w_detour + confidence * w_conf
        ) / total_w
        rairo_score = clamp(raw - incident_penalty - low_safety_penalty, 0, 100)
        reasons = []
        if safety >= 82: reasons.append("boa leitura de segurança")
        elif int(r.get("safety_level") or 0) <= 2: reasons.append("atenção elevada no corredor")
        if eta_score >= 96: reasons.append("ETA competitivo")
        if is_motorized_profile(travel_profile) and float(r.get("traffic_score") or 0) >= 55: reasons.append("trânsito relevante")
        if travel_profile == "motorcycle" and int(r.get("incidents_count") or 0) + int(r.get("closures_count") or 0) > 0: reasons.append("atenção extra para moto")
        if float(r.get("distance") or 0) > shortest * 1.18: reasons.append("desvio maior")
        if r.get("micro_route"): reasons.append("micro-rota anti-gargalo")
        r["rairo_score"] = round(rairo_score, 1)
        r["decision_confidence"] = round(clamp(confidence * 0.72 + 24, 35, 95))
        r["score_breakdown"] = {
            "safety": round(safety, 1), "eta": round(eta_score, 1),
            "traffic": round(traffic_score, 1), "detour": round(detour_score, 1),
            "data": round(confidence, 1),
        }
        r["decision_reasons"] = reasons[:4]
    return routes


def learned_route_biases(user_id):
    """Deriva preferências suaves do histórico recente do próprio usuário.

    Não tenta inferir atributos pessoais; somente pondera os modos de rota que a
    conta vem escolhendo. O efeito é limitado para não sacrificar segurança.
    """
    if not user_id:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    try:
        rows = get_db().execute(
            "SELECT mode FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 36",
            (user_id,),
        ).fetchall()
    except Exception:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    if not rows:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    counts = {"safest": 0, "fastest": 0, "smart": 0, "quietest": 0}
    # Recência: as escolhas mais novas pesam um pouco mais.
    weighted = {k: 0.0 for k in counts}
    for i, row in enumerate(rows):
        mode = str(row["mode"] or "").lower()
        if mode not in counts:
            continue
        counts[mode] += 1
        weighted[mode] += max(.35, 1.0 - i * .018)
    total = max(sum(weighted.values()), 1.0)
    safe_share = (weighted["safest"] + weighted["quietest"] * .55 + weighted["smart"] * .28) / total
    fast_share = weighted["fastest"] / total
    smart_share = weighted["smart"] / total
    safety = clamp(64 + safe_share * 23 - fast_share * 12, 52, 90)
    traffic = clamp(57 + smart_share * 21 + fast_share * 8, 48, 88)
    return {
        "safety_bias": round(safety, 1), "traffic_bias": round(traffic, 1),
        "samples": len(rows), "mode_counts": counts,
    }


def navigation_profile(user_id=None, local_hour=None, travel_profile="walking"):
    """Return routing preferences without inferring risk from demographic attributes.

    `sex` and `age` may be stored as profile information, but routing decisions use
    explicit safety preferences, time of day, trip mode and objective road/risk data.
    """
    profile = {
        "professional_driver": False,
        "night_safety": False,
        "night_active": False,
        "route_preference": "balanced",
        "safety_delta": 0.0,
        "traffic_delta": 0.0,
        "strict_constraints": False,
    }
    if not user_id:
        return profile
    try:
        row = get_db().execute(
            "SELECT is_app_driver,night_safety_mode,route_preference FROM users WHERE id=?",
            (int(user_id),),
        ).fetchone()
    except Exception:
        row = None
    if not row:
        return profile
    professional = bool(row["is_app_driver"]) and travel_profile == "driving"
    night_enabled = bool(row["night_safety_mode"])
    night_active = bool(local_hour is not None and (local_hour >= 19 or local_hour <= 5) and night_enabled)
    pref = str(row["route_preference"] or "balanced")
    if pref not in {"balanced", "safety_first", "fast_first"}:
        pref = "balanced"
    safety_delta = {"balanced": 0, "safety_first": 11, "fast_first": -7}[pref]
    traffic_delta = {"balanced": 0, "safety_first": -2, "fast_first": 8}[pref]
    if night_active:
        # Safety rises, but ETA/traffic remain relevant: this is a balanced night mode.
        safety_delta += 14
        traffic_delta += 4
    if professional:
        safety_delta += 10
        traffic_delta += 5
    profile.update({
        "professional_driver": professional,
        "night_safety": night_enabled,
        "night_active": night_active,
        "route_preference": pref,
        "safety_delta": float(safety_delta),
        "traffic_delta": float(traffic_delta),
        "strict_constraints": professional,
    })
    return profile


def _objective_risk_zone(zone):
    """Only objective/verified hazard types may become hard routing exclusions.

    Community labels (including favela/slum terminology) are deliberately not used
    as a proxy for danger. The engine needs incident/access evidence instead.
    """
    text = " ".join([str(zone["risk_type"] or ""), str(zone["name"] or ""), str(zone["source"] or "")]).lower()
    disallowed_proxy_terms = {"favela", "slum", "comunidade", "community", "periferia"}
    if any(term in text for term in disallowed_proxy_terms):
        return False
    allowed = {
        "verified_incident_area", "repeated_incident_corridor", "road_hazard",
        "access_restriction", "flood", "construction", "closure", "poor_road",
        "robbery_cluster", "accident_cluster",
    }
    return str(zone["risk_type"] or "").lower() in allowed


def verified_safety_avoidance_points(reports, risk_zones, local_hour=None, travel_profile="driving", max_points=12):
    """Return only high-confidence, objective hazards suitable for safest-route variants.

    Neighborhood identity, favela/community labels and demographics are never used as
    risk proxies. Points come from verified incident zones or sufficiently severe,
    confirmed and recent event reports.
    """
    now = datetime.now(timezone.utc)
    candidates = []
    for zone in (risk_zones or []):
        if not _objective_risk_zone(zone) or not zone_active_for_hour(zone, local_hour):
            continue
        confidence = clamp(float(zone["confidence"] or 0), 0, 1)
        cap = int(clamp(int(zone["level_cap"] if zone["level_cap"] is not None else 5), 0, 5))
        if confidence < .72 or cap > 2:
            continue
        candidates.append({
            "point": [float(zone["longitude"]), float(zone["latitude"])],
            "score": (5-cap)*20 + confidence*35,
            "reason": str(zone["name"] or "zona verificada")[:120],
            "kind": str(zone["risk_type"] or "verified_zone"),
        })
    allowed_reports = {"robbery", "flood", "accident", "construction", "poor_lighting"}
    for report in (reports or []):
        category = str(report["category"] or "").lower()
        if category not in allowed_reports:
            continue
        severity = int(clamp(int(report["severity"] or 0), 1, 5))
        confirmations = int(report["confirmations"] or 0)
        created = parse_iso(report["created_at"]) or now
        age_h = max(0.0, (now-created).total_seconds()/3600.0)
        freshness = math.exp(-age_h/(24*7.0))
        # Personal safety requires confirmation; road hazards may be urgent even with
        # fewer reports when severity is maximal.
        if category in {"robbery", "poor_lighting"}:
            if severity < 4 or confirmations < 2 or freshness < .18:
                continue
            if category == "poor_lighting" and not (local_hour is not None and (local_hour >= 18 or local_hour <= 6)):
                continue
        else:
            if severity < 4 or (confirmations < 1 and severity < 5) or freshness < .12:
                continue
        score = severity*14 + min(confirmations, 10)*3.5 + freshness*22
        if is_motorized_profile(travel_profile) and category in {"flood", "accident", "construction"}:
            score += 10 if travel_profile == "motorcycle" else 8
        candidates.append({
            "point": [float(report["longitude"]), float(report["latitude"])],
            "score": score,
            "reason": str(report["title"] or CATEGORY_META.get(category, CATEGORY_META["other"])["label"])[:120],
            "kind": category,
        })
    candidates.sort(key=lambda x: -x["score"])
    out = []
    for item in candidates:
        lon, lat = item["point"]
        if any(haversine_m(lat, lon, p["point"][1], p["point"][0]) < 220 for p in out):
            continue
        out.append(item)
        if len(out) >= max_points:
            break
    return out


def build_safety_bypass_routes(base_routes, start_lon, start_lat, end_lon, end_lat, avoidance_points, depart_at="now", budget=5):
    """Ask the road provider for variants around verified hazards, then score them normally.

    Point exclusions are best-effort, so every returned candidate still goes through
    Safety Engine scoring. This only expands the candidate pool; it never declares a
    street safe because of neighborhood identity or missing data.
    """
    if not base_routes or not avoidance_points:
        return []
    fastest_s = max(1.0, min(float(r.get("duration") or 10**12) for r in base_routes))
    top = list(avoidance_points)[:6]
    specs = []
    for item in top[:3]:
        specs.append([item])
    if len(top) >= 2:
        specs.append(top[:2])
    if len(top) >= 3:
        specs.append(top[:3])
    specs = specs[:max(1, min(6, int(budget or 5)))]

    def fetch(group):
        try:
            found = mapbox_routes(
                start_lon, start_lat, end_lon, end_lat, "driving", depart_at,
                exclusions=[x["point"] for x in group], alternatives=False,
                extra_excludes=None,
            )
            if not found:
                return None
            candidate = found[0]
            if float(candidate.get("duration") or 10**12) > fastest_s*1.58:
                return None
            candidate["_safety_variant"] = True
            candidate["_safety_avoided_points"] = len(group)
            candidate["_safety_avoid_reasons"] = [x["reason"] for x in group][:3]
            return candidate
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=min(5, len(specs))) as pool:
        fetched = list(pool.map(fetch, specs))
    seen = {route_signature(r) for r in base_routes}
    out = []
    for candidate in fetched:
        if not candidate:
            continue
        sig = route_signature(candidate)
        if sig and sig in seen:
            continue
        seen.add(sig)
        out.append(candidate)
    return out[:budget]


def professional_exclusion_points(start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Build hard-avoid points from verified hazards, never neighborhood identity."""
    pad = max(.035, min(.16, haversine_m(start_lat, start_lon, end_lat, end_lon) / 1000.0 / 900.0))
    min_lat, max_lat = min(start_lat, end_lat)-pad, max(start_lat, end_lat)+pad
    min_lon, max_lon = min(start_lon, end_lon)-pad, max(start_lon, end_lon)+pad
    line = [[float(start_lon), float(start_lat)], [float(end_lon), float(end_lat)]]
    points, reasons = [], []
    now = datetime.now(timezone.utc)
    try:
        zones = get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon)
    except Exception:
        zones = []
    for zone in zones:
        if not _objective_risk_zone(zone) or not zone_active_for_hour(zone, local_hour):
            continue
        confidence = float(zone["confidence"] or 0)
        cap = int(zone["level_cap"] if zone["level_cap"] is not None else 5)
        if confidence < .78 or cap > 2:
            continue
        lat, lon = float(zone["latitude"]), float(zone["longitude"])
        if min(haversine_m(lat, lon, start_lat, start_lon), haversine_m(lat, lon, end_lat, end_lon)) < 260:
            continue
        if min_distance_to_geometry_m(lat, lon, line) > 2600:
            continue
        points.append((lon, lat))
        reasons.append(f"Zona verificada: {zone['name']}")
        if len(points) >= 12:
            break
    try:
        reports = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    except Exception:
        reports = []
    for report in reports:
        if len(points) >= 18:
            break
        category = str(report["category"] or "")
        if category not in {"flood", "construction", "accident", "robbery", "road_block", "object_on_road"}:
            continue
        severity = int(report["severity"] or 0)
        confirmations = int(report["confirmations"] or 0)
        if severity < 4 or confirmations < 2:
            continue
        created = parse_iso(report["created_at"]) or now
        age_h = max(0.0, (now-created).total_seconds()/3600.0)
        ttl = 96 if category in {"flood", "construction", "accident"} else 24*7
        if age_h > ttl:
            continue
        lat, lon = float(report["latitude"]), float(report["longitude"])
        if min(haversine_m(lat, lon, start_lat, start_lon), haversine_m(lat, lon, end_lat, end_lon)) < 220:
            continue
        if min_distance_to_geometry_m(lat, lon, line) > 1800:
            continue
        points.append((lon, lat))
        reasons.append(f"Alerta confirmado: {CATEGORY_META.get(category, CATEGORY_META['other'])['label']}")
    # de-duplicate close points to avoid wasting Mapbox's exclusion quota
    dedup=[]
    for lon,lat in points:
        if all(haversine_m(lat,lon,py,px) > 180 for px,py in dedup):
            dedup.append((lon,lat))
    return dedup[:18], list(dict.fromkeys(reasons))[:8]


def route_exclusion_violations(route):
    notifications = list(route.get("notifications") or [])
    for leg in route.get("legs", []) or []:
        notifications.extend(leg.get("notifications") or [])
    violations=[]
    for item in notifications:
        if str(item.get("type") or "") != "violation":
            continue
        subtype = str(item.get("subtype") or "")
        if subtype in {"pointExclusion", "unpaved", "maxWidth", "maxWeight", "maxHeight"}:
            violations.append(subtype)
    return violations


def professional_route_assessment(route, metrics, road):
    """Hard constraints for professional driving based on objective route evidence."""
    flags=[]
    blocking=False
    violations = route_exclusion_violations(route)
    if violations:
        blocking=True
        flags.append("Uma exclusão obrigatória não pôde ser respeitada")
    if int(road.get("closures_count") or 0) > 0:
        blocking=True
        flags.append("Fechamento viário detectado")
    for z in metrics.get("risk_zones", []) or []:
        if int(z.get("level_cap", 5)) <= 2 and float(z.get("confidence", 0)) >= .78:
            blocking=True
            flags.append("Zona verificada de risco alto no corredor")
            break
    for alert in metrics.get("nearby_alerts", []) or []:
        if alert.get("category") in {"flood", "construction", "accident", "robbery"} and int(alert.get("severity", 0)) >= 4 and int(alert.get("confirmations", 0)) >= 2 and float(alert.get("distance_to_route_m", 9999)) <= 180:
            blocking=True
            flags.append(f"Alerta severo confirmado: {alert.get('category_label','atenção')}")
            break
    return {
        "professional_ok": not blocking,
        "professional_flags": list(dict.fromkeys(flags))[:5],
        "exclusion_violations": violations,
    }


def _candidate_bounds(routes, start_lat, start_lon, end_lat, end_lon):
    coords = []
    for route in (routes or [])[:20]:
        coords.extend((route.get("geometry") or {}).get("coordinates") or [])
    if coords:
        lons = [float(c[0]) for c in coords if len(c) >= 2]
        lats = [float(c[1]) for c in coords if len(c) >= 2]
        if lons and lats:
            pad = .018
            return min(lats)-pad, min(lons)-pad, max(lats)+pad, max(lons)+pad
    pad = .025
    return min(start_lat,end_lat)-pad, min(start_lon,end_lon)-pad, max(start_lat,end_lat)+pad, max(start_lon,end_lon)+pad


def admin_blocked_zone_points(zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Strong-avoid points explicitly configured by an administrator.

    A zone containing the trip origin/destination is not hard-avoided; otherwise
    users could be unable to leave or reach their own neighborhood. The zone still
    participates in the Safety Engine and can lower the route's safety score.
    """
    out = []
    for zone in (zones or []):
        if not int(zone["active"] or 0) or not int(zone["block_routes"] or 0):
            continue
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = float(clamp(float(zone["radius_m"] or 700), 100, 5000))
        zlat, zlon = float(zone["latitude"]), float(zone["longitude"])
        if haversine_m(start_lat, start_lon, zlat, zlon) <= radius or haversine_m(end_lat, end_lon, zlat, zlon) <= radius:
            continue
        out.append({
            "point": [zlon, zlat],
            "score": 200 + int(zone["danger_level"] or 1) * 25,
            "reason": str(zone["name"] or zone["neighborhood"] or "área evitada")[:120],
            "kind": "admin_blocked_area",
            "zone_id": int(zone["id"]),
            "radius_m": radius,
        })
    return out[:12]


def route_blocked_zone_hits(route, zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    coords = (route.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return []
    hits = []
    for zone in (zones or []):
        if not int(zone["active"] or 0) or not int(zone["block_routes"] or 0):
            continue
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = float(clamp(float(zone["radius_m"] or 700), 100, 5000))
        zlat, zlon = float(zone["latitude"]), float(zone["longitude"])
        # Never hard-block the origin/destination zone.
        if haversine_m(start_lat, start_lon, zlat, zlon) <= radius or haversine_m(end_lat, end_lon, zlat, zlon) <= radius:
            continue
        d = min_distance_to_geometry_m(zlat, zlon, coords)
        if d <= radius:
            hits.append({"id": int(zone["id"]), "name": zone["name"], "distance_to_route_m": round(d), "radius_m": round(radius)})
    return hits


def apply_admin_route_blocks(routes, zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Drop candidates crossing admin strong-avoid areas whenever an alternative exists."""
    evaluated = []
    for route in (routes or []):
        hits = route_blocked_zone_hits(route, zones, start_lat, start_lon, end_lat, end_lon, local_hour)
        route["_admin_block_hits"] = hits
        evaluated.append(route)
    clear = [r for r in evaluated if not r.get("_admin_block_hits")]
    if clear:
        return clear, {"enforced": True, "fallback": False, "filtered": len(evaluated)-len(clear)}
    return evaluated, {"enforced": bool(evaluated), "fallback": bool(evaluated), "filtered": 0}


_ROUTE_CONTEXT_CACHE = {}
_ROUTE_CONTEXT_CACHE_LOCK = threading.Lock()
_ROUTE_CONTEXT_CACHE_TTL = max(5, min(45, int(os.environ.get("RAIRO_ROUTE_CONTEXT_TTL", "14"))))

def _route_context_key(kind,min_lat,min_lon,max_lat,max_lon):
    # Coarse corridor buckets maximize reuse between Segura/Smart prefetches while
    # keeping the cache short enough for live reports.
    return (str(kind),round(float(min_lat),3),round(float(min_lon),3),round(float(max_lat),3),round(float(max_lon),3))

def _route_context_get(key):
    now=time.time()
    with _ROUTE_CONTEXT_CACHE_LOCK:
        item=_ROUTE_CONTEXT_CACHE.get(key)
        if not item:return None
        ts,rows=item
        if now-ts>_ROUTE_CONTEXT_CACHE_TTL:
            _ROUTE_CONTEXT_CACHE.pop(key,None);return None
        return copy.deepcopy(rows)

def _route_context_put(key,rows):
    with _ROUTE_CONTEXT_CACHE_LOCK:
        _ROUTE_CONTEXT_CACHE[key]=(time.time(),copy.deepcopy(list(rows or [])))
        if len(_ROUTE_CONTEXT_CACHE)>180:
            for k,_ in sorted(_ROUTE_CONTEXT_CACHE.items(),key=lambda kv:kv[1][0])[:50]:_ROUTE_CONTEXT_CACHE.pop(k,None)

def invalidate_route_context(kind=None):
    """Invalidate short-lived route/report context after live community changes."""
    with _ROUTE_CONTEXT_CACHE_LOCK:
        if kind is None:
            _ROUTE_CONTEXT_CACHE.clear()
            return
        prefix=str(kind)
        for key in [k for k in _ROUTE_CONTEXT_CACHE if k and str(k[0]) == prefix]:
            _ROUTE_CONTEXT_CACHE.pop(key, None)

def get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon):
    key=_route_context_key("zones",min_lat,min_lon,max_lat,max_lon)
    cached=_route_context_get(key)
    if cached is not None:return cached
    pad = 0.05
    rows=get_db().execute(
        """
        SELECT id,name,risk_type,latitude,longitude,radius_m,level_cap,confidence,source,source_url,start_hour,end_hour,neighborhood,city,state,danger_level,block_routes,active
        FROM risk_zones
        WHERE active=1 AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        ORDER BY confidence DESC, id DESC
        """,
        (min_lat-pad, max_lat+pad, min_lon-pad, max_lon+pad),
    ).fetchall()
    rows=[dict(r) for r in rows]
    _route_context_put(key,rows)
    return rows

def get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon):
    key=_route_context_key("reports",min_lat,min_lon,max_lat,max_lon)
    cached=_route_context_get(key)
    if cached is not None:return cached
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_REPORT_AGE_DAYS)).replace(microsecond=0).isoformat()
    rows=get_db().execute(
        """
        SELECT r.id,r.user_id,r.category,r.title,r.description,r.severity,r.latitude,r.longitude,r.address,r.status,r.created_at,r.expires_at,r.confirmations,
               (SELECT COUNT(*) FROM report_absence_votes v WHERE v.report_id=r.id) AS absence_votes
        FROM reports r
        WHERE r.status='active'
          AND r.created_at >= ?
          AND r.latitude BETWEEN ? AND ?
          AND r.longitude BETWEEN ? AND ?
          AND (r.expires_at IS NULL OR r.expires_at > ?)
        """,
        (cutoff, min_lat, max_lat, min_lon, max_lon, utcnow_iso()),
    ).fetchall()
    rows=[dict(r) for r in rows]
    _route_context_put(key,rows)
    return rows

# -----------------------------
# External providers — Mapbox
# -----------------------------

CEP_RE = re.compile(r"^\s*(?:CEP\s*)?(\d{5})[-.\s]?(\d{3})\s*$", re.IGNORECASE)
CEP_ANY_RE = re.compile(r"(?<!\d)(\d{5})[-.\s]?(\d{3})(?!\d)", re.IGNORECASE)
HOUSE_NUMBER_RE = re.compile(r"(?:^|[,\s])(?:n(?:[º°o]\.?|\.?|úmero)?|#)\s*([0-9]{1,6}[A-Za-z]?)\b", re.IGNORECASE)

# Common European postcode forms. This is a detection aid only; Mapbox remains
# the source of truth for geocoding and address validation.
EUROPE_POSTCODE_RE = re.compile(
    r"^(?:"
    r"[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}"      # UK
    r"|\d{4}[- ]?\d{3}"                         # Portugal
    r"|\d{4}\s?[A-Z]{2}"                        # Netherlands
    r"|\d{4}"                                      # Switzerland/Austria/etc.
    r"|\d{5}"                                      # FR/DE/ES/IT/etc.
    r"|[A-Z]{1,2}-?\d{4,5}"                        # prefixed forms
    r")$", re.IGNORECASE
)

# Explicit country names are used only to narrow an intentional international
# search. If no country is written, no country filter is sent to Mapbox.
EUROPE_COUNTRY_HINTS = {
    "portugal":"pt", "portuguesa":"pt",
    "espanha":"es", "spain":"es", "espana":"es",
    "franca":"fr", "france":"fr",
    "alemanha":"de", "germany":"de", "deutschland":"de",
    "italia":"it", "italy":"it",
    "reino unido":"gb", "united kingdom":"gb", "great britain":"gb", "uk":"gb",
    "inglaterra":"gb", "england":"gb", "escocia":"gb", "scotland":"gb",
    "suica":"ch", "switzerland":"ch", "schweiz":"ch",
    "paises baixos":"nl", "netherlands":"nl", "holanda":"nl",
    "belgica":"be", "belgium":"be",
    "austria":"at", "irlanda":"ie", "ireland":"ie",
    "dinamarca":"dk", "denmark":"dk", "noruega":"no", "norway":"no",
    "suecia":"se", "sweden":"se", "finlandia":"fi", "finland":"fi",
    "polonia":"pl", "poland":"pl", "republica tcheca":"cz", "czechia":"cz",
    "grecia":"gr", "greece":"gr", "romenia":"ro", "romania":"ro",
    "hungria":"hu", "hungary":"hu", "croacia":"hr", "croatia":"hr",
    "eslovenia":"si", "slovenia":"si", "eslovaquia":"sk", "slovakia":"sk",
    "luxemburgo":"lu", "luxembourg":"lu", "islandia":"is", "iceland":"is",
    "estonia":"ee", "letonia":"lv", "latvia":"lv", "lituania":"lt", "lithuania":"lt",
}

def _explicit_country_hint(query):
    normalized = _search_normalize(query or "")
    # Longest aliases first so phrases like "reino unido" win before "uk".
    for alias in sorted(EUROPE_COUNTRY_HINTS, key=len, reverse=True):
        if re.search(r"(?:^|\s)" + re.escape(alias) + r"(?:$|\s)", normalized):
            return EUROPE_COUNTRY_HINTS[alias]
    return None

def _international_query_context(query):
    clean = re.sub(r"\s+", " ", (query or "").strip())
    country = _explicit_country_hint(clean)
    pure_postcode = bool(EUROPE_POSTCODE_RE.fullmatch(clean.upper())) and not CEP_RE.fullmatch(clean)
    return {"country": country, "pure_postcode": pure_postcode}


def normalize_location_query(value):
    value = re.sub(r"\s+", " ", (value or "").strip())[:240]
    match = CEP_RE.match(value)
    if match:
        return f"{match.group(1)}-{match.group(2)}, Brasil", True
    return value, bool(CEP_ANY_RE.search(value))


def parse_brazil_location_query(value):
    """Extrai CEP e número sem destruir a consulta digitada.

    Aceita exemplos como `05659-000 120`, `CEP 05659000, nº 120` e
    `Rua Exemplo, 120 - 05659-000`. O número só é inferido automaticamente
    quando existe um CEP na mesma consulta, evitando confundir números de rua
    com outras partes de nomes comuns.
    """
    clean = re.sub(r"\s+", " ", (value or "").strip())[:240]
    cep_match = CEP_ANY_RE.search(clean)
    cep = "".join(cep_match.groups()) if cep_match else ""
    number = None
    explicit = HOUSE_NUMBER_RE.search(clean)
    if explicit:
        number = explicit.group(1)
    elif cep_match:
        without_cep = (clean[:cep_match.start()] + " " + clean[cep_match.end():]).strip(" ,;-")
        candidates = re.findall(r"(?<!\d)(\d{1,6}[A-Za-z]?)(?!\d)", without_cep)
        if candidates:
            number = candidates[-1]
    return {"raw": clean, "cep": cep, "number": number}



# VANO MAPS V136 — zero-flash automatic locale resolution.
# Country headers from trusted/proxy infrastructure win. When Render does not
# expose a country header, the first HTML response uses Accept-Language and the
# client refines it before first paint using timezone/region, then persists a
# same-site cookie used by API requests and later pages.
SUPPORTED_UI_LOCALES = {"pt-BR", "fr-FR", "de-DE", "ru-RU", "en-US", "es-ES"}
COUNTRY_UI_LOCALE = {
    "BR": "pt-BR", "FR": "fr-FR", "DE": "de-DE", "RU": "ru-RU",
    "PT": "pt-BR", "US": "en-US", "GB": "en-US", "CA": "en-US",
    "ES": "es-ES", "MX": "es-ES", "AR": "es-ES", "CL": "es-ES",
    "CO": "es-ES", "PE": "es-ES", "UY": "es-ES",
}
COUNTRY_HEADER_CANDIDATES = (
    "CF-IPCountry", "CloudFront-Viewer-Country", "X-Vercel-IP-Country",
    "X-Country-Code", "X-Appengine-Country", "Fastly-Client-Country",
)


def _normalize_ui_locale(value):
    raw = re.sub(r"[^A-Za-z0-9_-]", "", str(value or "")).replace("_", "-")[:24]
    if not raw:
        return ""
    low = raw.lower()
    if low.startswith("pt"):
        return "pt-BR"
    if low.startswith("fr"):
        return "fr-FR"
    if low.startswith("de"):
        return "de-DE"
    if low.startswith("ru"):
        return "ru-RU"
    if low.startswith("es"):
        return "es-ES"
    if low.startswith("en"):
        return "en-US"
    return ""


def _country_locale_from_headers():
    if not has_request_context():
        return "", ""
    for header in COUNTRY_HEADER_CANDIDATES:
        code = re.sub(r"[^A-Za-z]", "", request.headers.get(header, ""))[:2].upper()
        if code in COUNTRY_UI_LOCALE:
            return COUNTRY_UI_LOCALE[code], code
    return "", ""


def detect_ui_locale():
    """Resolve UI language without storing precise location or coordinates."""
    if not has_request_context():
        return _normalize_ui_locale(os.environ.get("RAIRO_DEFAULT_LANGUAGE", "pt-BR")) or "pt-BR", "default", ""

    header_locale, country = _country_locale_from_headers()
    if header_locale:
        return header_locale, "country_header", country

    cookie_locale = _normalize_ui_locale(request.cookies.get("rairo_locale_auto", ""))
    if cookie_locale in SUPPORTED_UI_LOCALES:
        return cookie_locale, "client_auto", ""

    # Parse q-values instead of trusting only the first token.
    best = request.accept_languages.best_match(
        ["pt-BR", "fr-FR", "de-DE", "ru-RU", "en-US", "es-ES"],
        default="pt-BR",
    )
    normalized = _normalize_ui_locale(best) or "pt-BR"
    return normalized, "accept_language", ""


@app.before_request
def resolve_ui_locale():
    locale, source, country = detect_ui_locale()
    g.rairo_locale = locale
    g.rairo_locale_source = source
    g.rairo_country = country


def active_ui_locale():
    if has_request_context():
        value = getattr(g, "rairo_locale", "") or detect_ui_locale()[0]
        return _normalize_ui_locale(value) or "pt-BR"
    return _normalize_ui_locale(os.environ.get("RAIRO_DEFAULT_LANGUAGE", "pt-BR")) or "pt-BR"

def preferred_language():
    """Return a safe language even when called outside Flask request context.

    Search providers may run inside worker threads. Flask's ``request`` proxy is
    local to the HTTP request context, so touching it from those workers raises
    ``Working outside of request context``. Capture the language before spawning
    workers whenever possible; this guard keeps other background callers safe.
    """
    if has_request_context():
        return active_ui_locale()
    raw = os.environ.get("RAIRO_DEFAULT_LANGUAGE", "pt-BR")
    return _normalize_ui_locale(raw) or "pt-BR"


def mapbox_ready():
    """Return True only for a plausible public Mapbox token.

    X3 accidentally removed this helper while keeping its call sites, which
    caused the Render home page to fail with NameError/HTTP 500.
    """
    token = (MAPBOX_ACCESS_TOKEN or "").strip()
    lowered = token.lower()
    return bool(
        token.startswith("pk.")
        and len(token) > 30
        and "seu_token" not in lowered
        and "your_mapbox" not in lowered
    )


def mapbox_get(url, params, timeout=12):
    if not mapbox_ready():
        raise RuntimeError("Infraestrutura de mapas não configurada neste ambiente.")
    params = dict(params)
    params["access_token"] = MAPBOX_ACCESS_TOKEN
    last_error = None
    for attempt in range(2):
        try:
            response = _MAPBOX_HTTP.get(url, params=params, timeout=(2.5, timeout))
            try:
                payload = response.json()
            except Exception:
                payload = {}
            if response.ok:
                return payload
            message = payload.get("message") or payload.get("error") or f"HTTP {response.status_code}"
            last_error = RuntimeError(f"Serviço de mapas: {message}")
            if attempt == 0 and (response.status_code == 429 or response.status_code >= 500):
                time.sleep(.16)
                continue
            raise last_error
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(.12)
                continue
    if isinstance(last_error, RuntimeError):
        raise last_error
    raise RuntimeError("Serviço de mapas temporariamente indisponível.") from last_error


def lookup_brazil_cep(cep):
    """Resolve CEP brasileiro combinando ViaCEP + BrasilAPI.

    V35: ViaCEP é usado como referência textual principal para logradouro/bairro/
    cidade/UF; BrasilAPI v2 complementa coordenadas quando disponíveis. As duas
    consultas são independentes para que uma indisponibilidade não derrube a busca.
    """
    digits = re.sub(r"\D", "", cep or "")
    if len(digits) != 8:
        return None

    def fetch_viacep():
        try:
            r = requests.get(f"{VIACEP_URL}/{digits}/json/", timeout=4.5)
            if not r.ok:
                return None
            d = r.json() or {}
            if d.get("erro"):
                return None
            return {
                "street": (d.get("logradouro") or "").strip(),
                "neighborhood": (d.get("bairro") or "").strip(),
                "city": (d.get("localidade") or "").strip(),
                "state": (d.get("uf") or "").strip(),
                "ibge": (d.get("ibge") or "").strip(),
            }
        except Exception:
            return None

    def fetch_brasilapi():
        try:
            r = requests.get(f"{BRASILAPI_CEP_URL}/{digits}", timeout=4.5)
            if not r.ok:
                return None
            d = r.json() or {}
            coords = ((d.get("location") or {}).get("coordinates") or {})
            return {
                "street": (d.get("street") or "").strip(),
                "neighborhood": (d.get("neighborhood") or "").strip(),
                "city": (d.get("city") or "").strip(),
                "state": (d.get("state") or "").strip(),
                "lat": coords.get("latitude"),
                "lon": coords.get("longitude"),
            }
        except Exception:
            return None

    via = bra = None
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fv = pool.submit(fetch_viacep)
            fb = pool.submit(fetch_brasilapi)
            via, bra = fv.result(), fb.result()
    except Exception:
        via, bra = fetch_viacep(), fetch_brasilapi()

    if not via and not bra:
        return None
    via, bra = via or {}, bra or {}
    # Prefer ViaCEP text so a pure CEP always renders its canonical street label;
    # use BrasilAPI only to fill fields absent from ViaCEP and to supply coordinates.
    return {
        "cep": digits,
        "street": via.get("street") or bra.get("street") or "",
        "neighborhood": via.get("neighborhood") or bra.get("neighborhood") or "",
        "city": via.get("city") or bra.get("city") or "",
        "state": via.get("state") or bra.get("state") or "",
        "lat": bra.get("lat"),
        "lon": bra.get("lon"),
        "source": "viacep+brasilapi" if via and bra else ("viacep" if via else "brasilapi"),
    }


def _cep_authoritative_result(cep_info, query_meta, candidates=None, proximity=None):
    """Build the top CEP result with canonical postal text and best known point."""
    if not cep_info or not query_meta.get("cep"):
        return None
    lat = cep_info.get("lat")
    lon = cep_info.get("lon")
    chosen = None
    for item in candidates or []:
        got = re.sub(r"\D", "", str(item.get("postcode") or ""))
        street_ok = not cep_info.get("street") or _soft_token_match(
            _search_normalize(cep_info.get("street")), item.get("street") or item.get("label") or ""
        )
        if got == query_meta["cep"] or item.get("postcode_match") == "matched" or street_ok:
            chosen = item
            if item.get("type") in {"address", "street", "postcode"}:
                break
    if chosen:
        lat, lon = chosen.get("lat"), chosen.get("lon")
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        # BrasilAPI may legitimately have no coordinates for a CEP. Use Mapbox itself
        # to geocode the canonical ViaCEP street, keeping the search stack Mapbox-only.
        canonical_query = ", ".join(x for x in [
            cep_info.get("street"), cep_info.get("neighborhood"),
            cep_info.get("city"), cep_info.get("state"), "Brasil"
        ] if x)
        try:
            params = {
                "q": canonical_query, "country": "br", "limit": 5,
                "language": preferred_language(), "types": "address,street,postcode,place,locality",
            }
            if proximity:
                params["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"
            payload = mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", params, timeout=7) if canonical_query else {}
            fallback = [_mapbox_result(f, query_meta) for f in (payload.get("features") or [])]
            candidate = next((x for x in fallback if x and x.get("type") in {"street", "address", "place", "locality", "postcode"}), None)
            if candidate:
                lat, lon = float(candidate["lat"]), float(candidate["lon"])
                chosen = candidate
            else:
                return None
        except Exception:
            return None
    cep = query_meta["cep"]
    cep_fmt = f"{cep[:5]}-{cep[5:]}"
    street = cep_info.get("street") or ""
    neighborhood = cep_info.get("neighborhood") or ""
    city = cep_info.get("city") or ""
    state = cep_info.get("state") or ""
    number = query_meta.get("number") or ""
    first = " ".join(x for x in [street, number] if x).strip()
    label = ", ".join(x for x in [first, neighborhood, f"{city} - {state}".strip(" -"), cep_fmt] if x)
    cep_display = f"{cep_fmt} · nº {number}" if number else cep_fmt
    canonical_address = ", ".join(x for x in [first or street, neighborhood, f"{city} - {state}".strip(" -"), cep_fmt] if x)
    item = {
        "label": label or cep_fmt,
        "name": cep_display,
        "address": canonical_address,
        "query_display": cep_display,
        "category": "CEP",
        "category_key": "address",
        "lat": lat, "lon": lon,
        "display_lat": float(chosen.get("display_lat", lat)) if chosen else lat,
        "display_lon": float(chosen.get("display_lon", lon)) if chosen else lon,
        "entrance_lat": chosen.get("entrance_lat") if chosen else None,
        "entrance_lon": chosen.get("entrance_lon") if chosen else None,
        "type": "address" if number and chosen and chosen.get("type") == "address" else "postcode",
        "mapbox_id": chosen.get("mapbox_id", "") if chosen else "",
        "postcode": cep_fmt,
        "address_number": str(number),
        "street": street,
        "accuracy": chosen.get("accuracy", "approximate") if chosen else "approximate",
        "match_confidence": chosen.get("match_confidence", "") if chosen else "",
        "address_number_match": chosen.get("address_number_match", "") if chosen else "",
        "street_match": "matched" if street else "",
        "postcode_match": "matched",
        "precision_label": ("CEP + número" if number and chosen and chosen.get("type") == "address" else "logradouro oficial do CEP"),
        "number_unverified": bool(number and not (chosen and chosen.get("type") == "address")),
        "source": "cep-authoritative",
        "cep_query": True,
        "rank": -250,
    }
    if proximity:
        try:
            item["distance_m"] = round(haversine_m(float(proximity[1]), float(proximity[0]), lat, lon))
        except Exception:
            pass
    return item

def _mapbox_result(feature, query_meta=None, source="mapbox"):
    props = feature.get("properties") or {}
    coords = props.get("coordinates") or {}
    lon, lat = coords.get("longitude"), coords.get("latitude")
    if lon is None or lat is None:
        pair = (feature.get("geometry") or {}).get("coordinates") or []
        if len(pair) >= 2:
            lon, lat = pair[0], pair[1]
    if lon is None or lat is None:
        return None
    context = props.get("context") or {}
    postcode = ((context.get("postcode") or {}).get("name") or "").strip()
    address_ctx = context.get("address") or {}
    street_ctx = context.get("street") or {}
    address_number = (address_ctx.get("address_number") or "").strip()
    street_name = (address_ctx.get("street_name") or street_ctx.get("name") or "").strip()
    match = props.get("match_code") or {}
    confidence = str(match.get("confidence") or "").lower()
    accuracy = str(coords.get("accuracy") or "").lower()
    routable = coords.get("routable_points") or []
    default_point = next((p for p in routable if str(p.get("name", "")).lower() == "default"), None)
    entrance_point = next((p for p in routable if str(p.get("name", "")).lower() == "entrance"), None)
    nav_lon = default_point.get("longitude") if default_point else lon
    nav_lat = default_point.get("latitude") if default_point else lat
    ent_lon = entrance_point.get("longitude") if entrance_point else None
    ent_lat = entrance_point.get("latitude") if entrance_point else None
    label = props.get("full_address") or ", ".join(x for x in [props.get("name_preferred") or props.get("name"), props.get("place_formatted")] if x)
    if postcode and postcode not in (label or ""):
        label = f"{label}, {postcode}" if label else postcode
    feature_type = props.get("feature_type", "")
    precision_label = {
        "rooftop": "entrada/prédio",
        "parcel": "lote",
        "point": "endereço",
        "interpolated": "número estimado",
        "approximate": "aproximado",
        "intersection": "cruzamento",
    }.get(accuracy, "endereço" if feature_type == "address" else "rua" if feature_type == "street" else "CEP" if feature_type == "postcode" else "local")
    primary_name = props.get("name_preferred") or props.get("name") or street_name or label or "Local"
    formatted_address = props.get("full_address") or props.get("place_formatted") or label or ""
    return {
        "label": label or (query_meta or {}).get("raw") or "Local",
        "name": primary_name,
        "address": formatted_address,
        "category": "Endereço" if feature_type == "address" else "Rua" if feature_type == "street" else "CEP" if feature_type == "postcode" else "Local",
        "category_key": "address" if feature_type == "address" else "street" if feature_type == "street" else "place",
        "lat": float(nav_lat), "lon": float(nav_lon),
        "display_lat": float(lat), "display_lon": float(lon),
        "entrance_lat": float(ent_lat) if ent_lat is not None else None,
        "entrance_lon": float(ent_lon) if ent_lon is not None else None,
        "type": feature_type,
        "mapbox_id": props.get("mapbox_id") or feature.get("id", ""),
        "postcode": postcode,
        "address_number": address_number,
        "street": street_name,
        "accuracy": accuracy,
        "match_confidence": confidence,
        "address_number_match": str(match.get("address_number") or "").lower(),
        "street_match": str(match.get("street") or "").lower(),
        "postcode_match": str(match.get("postcode") or "").lower(),
        "precision_label": precision_label,
        "source": source,
        "cep_query": bool((query_meta or {}).get("cep")),
    }


def _result_rank(item, query_meta):
    type_rank = {"address": 0, "street": 14, "postcode": 24, "neighborhood": 34, "locality": 38, "place": 42, "district": 48, "region": 54, "country": 60}
    conf_rank = {"exact": 0, "high": 3, "medium": 9, "low": 18, "": 11}
    accuracy_rank = {"rooftop": 0, "parcel": 2, "point": 4, "interpolated": 8, "intersection": 9, "approximate": 14, "": 7}
    score = type_rank.get(item.get("type"), 45) + conf_rank.get(item.get("match_confidence", ""), 12) + accuracy_rank.get(item.get("accuracy", ""), 8)
    if query_meta.get("number"):
        if item.get("type") != "address": score += 35
        wanted_number = str(query_meta["number"]).lower()
        got_number = str(item.get("address_number") or "").lower()
        number_match = item.get("address_number_match", "")
        if got_number and got_number == wanted_number: score -= 18
        elif number_match == "matched": score -= 14
        elif number_match == "plausible": score += 3
        elif number_match == "unmatched" or (got_number and got_number != wanted_number): score += 58
    if query_meta.get("cep"):
        wanted = query_meta["cep"]
        got = re.sub(r"\D", "", item.get("postcode") or "")
        postcode_match = item.get("postcode_match", "")
        if got == wanted or postcode_match == "matched": score -= 15
        elif postcode_match == "unmatched": score += 42
        elif got: score += 18
    if item.get("source") == "cep-fallback": score += 70
    return score


SEARCH_STOPWORDS = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "na", "no",
    "nas", "nos", "para", "por", "brasil", "sao", "paulo",
    "rua", "r", "avenida", "av", "estrada", "rodovia",
}
SEARCH_LEADING_NOISE_RE = re.compile(
    r"^\s*(?:rua|r\.?|avenida|av\.?|estrada|rodovia)\s+(?=(?:escola|colegio|colégio|universidade|hospital|clinica|clínica|banco|santander|itau|itaú|bradesco|mercado|shopping|farmacia|farmácia|posto)\b)",
    re.IGNORECASE,
)


def _search_normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _search_tokens(value):
    return [x for x in _search_normalize(value).split() if len(x) >= 2 and x not in SEARCH_STOPWORDS]


def _soft_token_match(token, haystack):
    words = set(_search_normalize(haystack).split())
    if token in words or token in _search_normalize(haystack):
        return True
    if len(token) < 4:
        return False
    # Small typo tolerance for proper names (Melo/Mello, Andronico/Andrônico).
    return any(
        abs(len(token) - len(word)) <= 2 and difflib.SequenceMatcher(None, token, word).ratio() >= 0.82
        for word in words if len(word) >= 4
    )


def _search_cache_key(query, proximity):
    q = _search_normalize(query)
    if proximity:
        # ~1 km cells keep cache useful without mixing distant neighborhoods.
        return f"search-v163:{q}:{float(proximity[1]):.2f}:{float(proximity[0]):.2f}"
    return f"search-v163:{q}:global"


def _search_cache_get(key, ttl_seconds=900):
    now = time.time()
    with SEARCH_RESULT_LOCK:
        row = SEARCH_RESULT_CACHE.get(key)
        if not row:
            return None
        created, payload = row
        if now - created > ttl_seconds:
            SEARCH_RESULT_CACHE.pop(key, None)
            return None
        return [dict(x) for x in payload]


def _search_cache_set(key, results):
    # Keep provider responses ephemeral in memory. This reduces repeated public
    # geocoder traffic without retaining temporary Mapbox search data in SQLite.
    with SEARCH_RESULT_LOCK:
        if len(SEARCH_RESULT_CACHE) > 600:
            cutoff = time.time() - 900
            for cache_key, (created, _payload) in list(SEARCH_RESULT_CACHE.items()):
                if created < cutoff:
                    SEARCH_RESULT_CACHE.pop(cache_key, None)
        SEARCH_RESULT_CACHE[key] = (time.time(), [dict(x) for x in results])

def _osm_category(props):
    key = str(props.get("osm_key") or "").lower()
    value = str(props.get("osm_value") or "").lower()
    pair = f"{key}:{value}"
    mapping = {
        "amenity:school": ("Escola", "school"),
        "amenity:college": ("Faculdade", "school"),
        "amenity:university": ("Universidade", "school"),
        "amenity:kindergarten": ("Educação", "school"),
        "amenity:bank": ("Banco", "bank"),
        "amenity:hospital": ("Hospital", "hospital"),
        "amenity:clinic": ("Clínica", "hospital"),
        "amenity:pharmacy": ("Farmácia", "pharmacy"),
        "amenity:fuel": ("Posto", "fuel"),
        "amenity:parking": ("Estacionamento", "parking"),
        "amenity:bus_station": ("Terminal", "terminal"),
        "public_transport:station": ("Terminal / estação", "terminal"),
        "aeroway:aerodrome": ("Aeroporto", "airport"),
        "aeroway:terminal": ("Terminal de aeroporto", "airport"),
        "amenity:restaurant": ("Restaurante", "food"),
        "amenity:cafe": ("Café", "food"),
        "amenity:cinema": ("Cinema", "poi"),
        "amenity:theatre": ("Teatro", "poi"),
        "amenity:marketplace": ("Comércio", "shop"),
        "shop:supermarket": ("Supermercado", "shop"),
        "shop:mall": ("Shopping", "shop"),
        "tourism:hotel": ("Hotel", "hotel"),
        "leisure:park": ("Parque", "park"),
        "amenity:police": ("Serviço público", "public"),
        "office:government": ("Órgão público", "public"),
    }
    if pair in mapping:
        return mapping[pair]
    if key == "shop": return ("Comércio", "shop")
    if key == "office": return ("Empresa / escritório", "business")
    if key == "amenity": return ("Estabelecimento", "poi")
    if key in {"tourism", "leisure"}: return ("Local", "poi")
    if key == "building": return ("Edifício", "building")
    return ("Local", "poi")



def _searchbox_category(props):
    categories = props.get("poi_category") or []
    if isinstance(categories, str):
        categories = [categories]
    values = " ".join(str(x).lower() for x in categories)
    maki = str(props.get("maki") or "").lower()
    text = f"{values} {maki}"
    # Keep malls separate from ordinary stores. A query such as "shopping Butantã"
    # should rank the mall itself above shops located inside or near it.
    if any(n in text for n in ("shopping mall", "shopping center", "shopping centre", "mall")):
        return ("Shopping", "mall")
    mapping = [
        (("cinema", "movie", "theatre", "theater"), ("Cinema / entretenimento", "poi")),
        (("restaurant", "food", "cafe"), ("Restaurante", "food")),
        (("hospital", "clinic", "doctor"), ("Saúde", "hospital")),
        (("pharmacy",), ("Farmácia", "pharmacy")),
        (("school", "college", "university"), ("Educação", "school")),
        (("bank",), ("Banco", "bank")),
        (("fuel", "gas"), ("Posto", "fuel")),
        (("parking",), ("Estacionamento", "parking")),
        (("airport", "aerodrome", "airfield"), ("Aeroporto", "airport")),
        (("bus station", "transit station", "rail station", "station"), ("Terminal / estação", "terminal")),
        (("hotel", "lodging"), ("Hotel", "hotel")),
        (("park",), ("Parque", "park")),
        (("supermarket", "grocery"), ("Supermercado", "shop")),
        (("shop", "store", "retail"), ("Comércio", "shop")),
    ]
    for needles, result in mapping:
        if any(n in text for n in needles):
            return result
    return ("Empresa / local", "business")


def _query_search_intent(query):
    raw = re.sub(r"\s+", " ", str(query or "").strip())
    meta = parse_brazil_location_query(raw)
    normalized = _search_normalize(raw)
    pure_cep = bool(meta.get("cep") and CEP_RE.fullmatch(raw))
    street_prefix = bool(re.match(
        r"\s*(?:rua|r\.?|avenida|av\.?|alameda|travessa|estrada|rodovia|street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|rue|route|chemin|quai|via|viale|corso|strada|calle|carrer|paseo|platz|strasse|straße|weg|gasse)\b",
        raw, re.I
    ))
    explicit_number = bool(re.search(r",\s*\d{1,6}[A-Za-z]?\s*$", raw) or HOUSE_NUMBER_RE.search(raw))
    shopping = bool(re.search(r"\b(?:shopping|shopping center|shopping centre|shopping mall|mall)\b", normalized))
    category_patterns = [
        ("mall", r"\b(?:shopping|shopping center|shopping centre|shopping mall|mall)\b"),
        ("hospital", r"\b(?:hospital|hospitais|clinica|clinica medica|pronto socorro|upa)\b"),
        ("pharmacy", r"\b(?:farmacia|farmacias|drogaria|drogarias)\b"),
        ("school", r"\b(?:escola|colegio|faculdade|universidade|etec|senai|educacao)\b"),
        ("airport", r"\b(?:aeroporto|airport|aerodromo|terminal aeroportuario)\b"),
        ("terminal", r"\b(?:terminal|rodoviaria|estacao|metro|trem)\b"),
        ("parking", r"\b(?:estacionamento|parking|garagem)\b"),
        ("fuel", r"\b(?:posto|combustivel|gasolina|etanol)\b"),
        ("food", r"\b(?:restaurante|restaurantes|cafe|cafeteria|lanchonete)\b"),
        ("bank", r"\b(?:banco|agencia bancaria|caixa eletronico)\b"),
        ("hotel", r"\b(?:hotel|pousada|hostel)\b"),
        ("park", r"\b(?:parque|praca)\b"),
        ("shop", r"\b(?:mercado|supermercado|loja|comercio)\b"),
    ]
    wanted_category = next((cat for cat, pattern in category_patterns if re.search(pattern, normalized)), "")
    if meta.get("cep"):
        kind = "cep_number" if meta.get("number") else "cep"
    elif street_prefix and explicit_number:
        kind = "address"
    elif street_prefix:
        kind = "street"
    elif explicit_number:
        kind = "address"
    else:
        kind = "poi"
    return {"kind": kind, "shopping": shopping, "wanted_category": wanted_category, "meta": meta, "normalized": normalized, "pure_cep": pure_cep}

def _mapbox_searchbox_result(feature, query, proximity=None, provider_rank=0):
    props = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    pair = geometry.get("coordinates") or []
    coords = props.get("coordinates") or {}
    lon = coords.get("longitude")
    lat = coords.get("latitude")
    if (lon is None or lat is None) and len(pair) >= 2:
        lon, lat = pair[0], pair[1]
    try:
        lon, lat = float(lon), float(lat)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    routable = coords.get("routable_points") or []
    nav = next((x for x in routable if str(x.get("name") or "").lower() == "default"), None)
    if nav:
        try:
            nav_lon = float(nav.get("longitude")); nav_lat = float(nav.get("latitude"))
        except (TypeError, ValueError):
            nav_lon, nav_lat = lon, lat
    else:
        nav_lon, nav_lat = lon, lat

    feature_type = str(props.get("feature_type") or "poi")
    name = str(props.get("name_preferred") or props.get("name") or "Local").strip()
    full_address = str(props.get("full_address") or "").strip()
    place_formatted = str(props.get("place_formatted") or "").strip()
    address = full_address or place_formatted
    context = props.get("context") or {}
    postcode = str(((context.get("postcode") or {}).get("name") or "")).strip()
    street = str(((context.get("street") or {}).get("name") or "")).strip()
    address_ctx = context.get("address") or {}
    address_number = str(address_ctx.get("address_number") or "").strip()
    if not street:
        street = str(address_ctx.get("street_name") or "").strip()
    if feature_type == "poi":
        category, category_key = _searchbox_category(props)
    else:
        category = {"address":"Endereço","street":"Rua","postcode":"CEP","place":"Cidade","locality":"Local"}.get(feature_type, "Local")
        category_key = "address" if feature_type in {"address","street","postcode"} else "place"
    item = {
        "label": full_address or ", ".join(x for x in [name, place_formatted] if x) or name,
        "name": name,
        "address": address,
        "category": category,
        "category_key": category_key,
        "lat": nav_lat, "lon": nav_lon,
        "display_lat": lat, "display_lon": lon,
        "entrance_lat": None, "entrance_lon": None,
        "type": feature_type,
        "mapbox_id": props.get("mapbox_id") or feature.get("id", ""),
        "postcode": postcode,
        "address_number": address_number,
        "street": street,
        "accuracy": str(coords.get("accuracy") or "point"),
        "match_confidence": "",
        "precision_label": category,
        "source": "mapbox-searchbox",
        "cep_query": False,
        "rank": float(provider_rank),
    }
    if proximity:
        try:
            d = haversine_m(float(proximity[1]), float(proximity[0]), nav_lat, nav_lon)
            item["distance_m"] = round(d)
        except Exception:
            pass
    return item


def mapbox_searchbox_forward(query, proximity=None, language=None):
    """POI/business + address search using Mapbox Search Box /forward.

    This endpoint is intentionally used for generic names such as malls, cinemas,
    companies and categories because Geocoding v6 is address-focused.
    """
    raw = re.sub(r"\s+", " ", (query or "").strip())[:240]
    if not raw or not mapbox_ready():
        return []
    context = _international_query_context(raw)
    params = {
        "q": raw,
        "limit": 10,
        "language": (language or preferred_language()).split("-", 1)[0].lower(),
        "types": "poi,address,street,postcode,place,locality,neighborhood",
        "auto_complete": "true",
    }
    if context.get("country"):
        params["country"] = context["country"].lower()
    # An explicit foreign country should beat the user's current GPS bias.
    if proximity and not context.get("country"):
        params["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"
    payload = mapbox_get(f"{MAPBOX_SEARCHBOX_URL}/forward", params, timeout=5.5)
    out = []
    for idx, feature in enumerate((payload.get("features") or [])[:10]):
        item = _mapbox_searchbox_result(feature, raw, proximity, provider_rank=idx * 2)
        if item:
            out.append(item)
    return out

def _combined_search_rank(item, query, proximity=None):
    if item.get("source") == "cep-authoritative":
        return -500.0
    intent = _query_search_intent(query)
    base = float(item.get("rank", 100))
    qtokens = _search_tokens(query)
    name = item.get("name") or str(item.get("label") or "").split(",", 1)[0]
    qn = _search_normalize(query)
    nn = _search_normalize(name)
    streetn = _search_normalize(item.get("street") or "")
    labeln = _search_normalize(item.get("label") or "")
    combined = _search_normalize(" ".join([str(name), str(item.get("address") or ""), str(item.get("label") or "")]))
    name_hits = sum(1 for t in qtokens if _soft_token_match(t, nn))
    all_hits = sum(1 for t in qtokens if _soft_token_match(t, combined))
    name_ratio = name_hits / max(1, len(qtokens))
    all_ratio = all_hits / max(1, len(qtokens))
    base += (1 - all_ratio) * 70
    base += (1 - name_ratio) * 24

    # Exact typed wording beats provider popularity. This is what keeps a named
    # mall/street on top instead of a loosely related commerce result.
    if qn and nn == qn:
        base -= 82
    elif qn and (nn.startswith(qn) or qn.startswith(nn)):
        base -= 48
    elif qn and qn in nn:
        base -= 40
    elif qtokens and name_hits == len(qtokens):
        base -= 34

    kind = intent["kind"]
    item_type = str(item.get("type") or "")
    category_key = str(item.get("category_key") or "")
    category_text = _search_normalize(item.get("category") or "")

    if kind in {"cep", "cep_number"}:
        wanted_cep = str(intent["meta"].get("cep") or "")
        got_cep = re.sub(r"\D", "", str(item.get("postcode") or ""))
        if got_cep == wanted_cep:
            base -= 95
        else:
            base += 180
        if kind == "cep_number":
            wanted_number = str(intent["meta"].get("number") or "").lower()
            got_number = str(item.get("address_number") or "").lower()
            if got_number == wanted_number:
                base -= 75
            elif item.get("number_unverified"):
                base += 16
            elif got_number:
                base += 160
            if item_type not in {"address", "postcode", "street"}:
                base += 160
    elif kind in {"street", "address"}:
        if item_type in {"street", "address"}:
            base -= 45
        elif item_type == "poi":
            base += 72
        street_query = re.sub(r"^(?:rua|r|avenida|av|alameda|travessa|estrada|rodovia)\s+", "", qn).strip()
        street_candidate = re.sub(r"^(?:rua|r|avenida|av|alameda|travessa|estrada|rodovia)\s+", "", streetn or nn).strip()
        if street_query and street_candidate == street_query:
            base -= 72
        elif street_query and street_candidate.startswith(street_query):
            base -= 38
        if kind == "address" and item_type != "address":
            base += 28
    else:
        # Named places/businesses must stay places/businesses. Do not let a street
        # or generic locality outrank a POI just because it is geographically close.
        if item_type == "poi":
            base -= 42
        elif item_type in {"street", "address", "postcode"}:
            base += 66
        if intent["shopping"]:
            if category_key == "mall" or category_text == "shopping":
                base -= 100
            elif category_key == "shop":
                base += 38
            else:
                base += 18
            if "shopping" in nn or "mall" in nn:
                base -= 42
        wanted = str(intent.get("wanted_category") or "")
        if wanted:
            compatible = {
                "mall": {"mall"}, "hospital": {"hospital"}, "pharmacy": {"pharmacy"},
                "school": {"school"}, "airport": {"airport"}, "terminal": {"terminal"},
                "parking": {"parking"}, "fuel": {"fuel"}, "food": {"food"},
                "bank": {"bank"}, "hotel": {"hotel"}, "park": {"park"},
                "shop": {"shop", "mall"},
            }.get(wanted, {wanted})
            if category_key in compatible:
                base -= 92
            elif item_type == "poi":
                base += 54
            else:
                base += 82

    # Proximity decides between equally relevant alternatives, not between an
    # exact semantic match and an unrelated nearby place.
    if proximity:
        try:
            if item.get("distance_m") is None:
                d = haversine_m(float(proximity[1]), float(proximity[0]), float(item["lat"]), float(item["lon"]))
                item["distance_m"] = round(d)
            else:
                d = float(item.get("distance_m") or 0)
            base += min(22, math.log1p(max(0, d) / 700.0) * 3.2)
        except Exception:
            pass
    return round(base, 3)

def smart_location_search(query, proximity=None):
    """Intent-aware location search.

    CEP/house-number queries are resolved as addresses; street queries prioritize
    the matching street; named places (shopping, hospital, school, business, etc.)
    prioritize POIs. Distance only breaks ties among semantically relevant hits.
    """
    cache_key = _search_cache_key(query, proximity)
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached

    intent = _query_search_intent(query)
    query_meta = intent["meta"]
    international = _international_query_context(query)
    search_language = preferred_language()
    effective_proximity = None if international.get("country") else proximity
    candidates = []
    errors = []

    def collect(fn, label):
        try:
            rows = fn() or []
            candidates.extend(rows)
            return bool(rows)
        except Exception as exc:
            errors.append(f"{label}: {exc}")
            return False

    kind = intent["kind"]
    if kind in {"cep", "cep_number", "address", "street"}:
        collect(lambda: mapbox_forward_geocode(query, effective_proximity, search_language), "geocode")
        # For a street/address query Search Box is only a secondary source. It can
        # recover named buildings without being allowed to dominate the ranking.
        if kind in {"address", "street"} and mapbox_ready():
            collect(lambda: mapbox_searchbox_forward(query, effective_proximity, search_language), "searchbox-secondary")
    else:
        # Place/business searches always query Search Box first, then Geocoding as
        # a secondary source for locality/street fallbacks.
        if mapbox_ready():
            collect(lambda: mapbox_searchbox_forward(query, effective_proximity, search_language), "searchbox")
        collect(lambda: mapbox_forward_geocode(query, effective_proximity, search_language), "geocode-secondary")

    merged, seen = [], set()
    for item in candidates:
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
        except Exception:
            continue
        name_key = _search_normalize(item.get("name") or str(item.get("label") or "").split(",", 1)[0])
        key = item.get("mapbox_id") or f"{round(lat,5)}:{round(lon,5)}:{name_key[:90]}"
        if item.get("source") == "cep-authoritative":
            key = f"cep:{query_meta.get('cep')}:{query_meta.get('number') or ''}"
        if key in seen:
            continue
        seen.add(key)
        item["rank"] = _combined_search_rank(item, query, effective_proximity)
        merged.append(item)

    merged.sort(key=lambda x: (float(x.get("rank", 9999)), float(x.get("distance_m", 1e12)), str(x.get("label", ""))))

    # CEP + number: if the authoritative canonical result exists, it must be the
    # first thing the UI sees and it must visibly preserve the typed number.
    if kind in {"cep", "cep_number"}:
        authoritative = [x for x in merged if x.get("source") == "cep-authoritative"]
        rest = [x for x in merged if x.get("source") != "cep-authoritative"]
        if authoritative:
            merged = authoritative + rest

    final = merged[:10]
    for item in final:
        item.pop("rank", None)
    if final:
        _search_cache_set(cache_key, final)
        return final
    if errors:
        raise RuntimeError(" | ".join(errors[:2]))
    return []

def mapbox_forward_geocode(query, proximity=None, language=None):
    query_meta = parse_brazil_location_query(query)
    raw = query_meta["raw"]
    if not raw:
        return []
    features = []
    cep_info = lookup_brazil_cep(query_meta["cep"]) if query_meta.get("cep") else None

    context = _international_query_context(raw)
    base = {
        "limit": 10,
        "language": language or preferred_language(),
        "entrances": "true",
    }
    # Brazilian CEP remains deliberately constrained to BR; every other query is global
    # unless the user explicitly wrote a country name such as Portugal/France/UK.
    if query_meta.get("cep"):
        base["country"] = "br"
    elif context.get("country"):
        base["country"] = context["country"].lower()
    if proximity and not context.get("country"):
        base["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"

    # CEP + número usa Structured Input: é a forma mais forte de dizer ao geocoder
    # qual token é número, rua, cidade, estado e código postal.
    if cep_info and cep_info.get("street"):
        structured = dict(base)
        structured["autocomplete"] = "false"
        structured["street"] = cep_info["street"]
        structured["postcode"] = query_meta["cep"]
        if query_meta.get("number"): structured["address_number"] = query_meta["number"]
        if cep_info.get("city"): structured["place"] = cep_info["city"]
        if cep_info.get("state"): structured["region"] = cep_info["state"]
        if cep_info.get("neighborhood"): structured["neighborhood"] = cep_info["neighborhood"]
        try:
            features.extend((mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", structured, timeout=5.5).get("features") or [])[:7])
        except Exception:
            pass

    normalized, _ = normalize_location_query(raw)
    general = dict(base)
    general.update({
        "q": normalized,
        "autocomplete": "true",
        "types": "address,street,postcode,place,locality,neighborhood,district,region,country",
    })
    try:
        features.extend((mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", general, timeout=5.5).get("features") or [])[:10])
    except Exception:
        # Se a consulta estruturada já trouxe resultados, não falhamos a busca inteira.
        if not features:
            raise

    results = []
    seen = set()
    for feature in features:
        item = _mapbox_result(feature, query_meta)
        if not item:
            continue
        key = item.get("mapbox_id") or f"{item['lat']:.6f},{item['lon']:.6f}:{item['label'].lower()}"
        if key in seen:
            continue
        seen.add(key)
        item["rank"] = _result_rank(item, query_meta)
        results.append(item)

    # O fallback de CEP é intencionalmente identificado como aproximado. Nunca
    # afirmamos que o centroide do CEP é o número digitado.
    if not results and cep_info and cep_info.get("lat") is not None and cep_info.get("lon") is not None:
        try:
            lat, lon = float(cep_info["lat"]), float(cep_info["lon"])
            cep_fmt = f"{query_meta['cep'][:5]}-{query_meta['cep'][5:]}"
            pieces = [cep_info.get("street"), cep_info.get("neighborhood"), f"{cep_info.get('city','')} - {cep_info.get('state','')}".strip(" -"), cep_fmt]
            label = ", ".join(x for x in pieces if x)
            results.append({
                "label": label or cep_fmt, "lat": lat, "lon": lon,
                "display_lat": lat, "display_lon": lon, "entrance_lat": None, "entrance_lon": None,
                "type": "postcode", "mapbox_id": "", "postcode": cep_fmt,
                "address_number": "", "street": cep_info.get("street") or "",
                "accuracy": "approximate", "match_confidence": "",
                "precision_label": (f"CEP localizado; nº {query_meta['number']} não confirmado" if query_meta.get("number") else "centro aproximado do CEP"),
                "number_unverified": bool(query_meta.get("number")), "source": "cep-fallback",
                "cep_query": True, "rank": 999,
            })
        except Exception:
            pass

    results.sort(key=lambda x: (x.get("rank", 999), x.get("label", "")))
    if query_meta.get("cep") and query_meta.get("number"):
        wanted_cep = query_meta["cep"]
        wanted_number = str(query_meta["number"]).lower()
        strict = []
        for item in results:
            got_cep = re.sub(r"\D", "", item.get("postcode") or "")
            got_number = str(item.get("address_number") or "").lower()
            number_ok = got_number == wanted_number or item.get("address_number_match") in {"matched", "plausible"}
            cep_ok = got_cep == wanted_cep or item.get("postcode_match") == "matched"
            if item.get("type") == "address" and number_ok and cep_ok:
                strict.append(item)
        if strict:
            # Evita exibir números claramente diferentes quando a consulta já trouxe
            # candidatos coerentes com CEP + número.
            results = strict + [x for x in results if x.get("type") in {"street", "postcode"}][:2]
        else:
            # Precisão > palpite: quando o número não pôde ser confirmado, removemos
            # endereços com outro número e mostramos apenas a rua/CEP coerente. Isso
            # evita navegar silenciosamente para o imóvel errado.
            safe = []
            for item in results:
                got_cep = re.sub(r"\D", "", item.get("postcode") or "")
                cep_ok = got_cep == wanted_cep or item.get("postcode_match") == "matched"
                if item.get("type") in {"street", "postcode"} and cep_ok:
                    item["number_unverified"] = True
                    item["precision_label"] = f"CEP localizado; nº {query_meta['number']} não confirmado"
                    safe.append(item)
            if safe:
                results = safe[:3]
            elif cep_info and cep_info.get("lat") is not None and cep_info.get("lon") is not None:
                try:
                    lat, lon = float(cep_info["lat"]), float(cep_info["lon"])
                    cep_fmt = f"{wanted_cep[:5]}-{wanted_cep[5:]}"
                    pieces = [cep_info.get("street"), cep_info.get("neighborhood"), f"{cep_info.get('city','')} - {cep_info.get('state','')}".strip(" -"), cep_fmt]
                    results = [{
                        "label": ", ".join(x for x in pieces if x) or cep_fmt,
                        "lat": lat, "lon": lon, "display_lat": lat, "display_lon": lon,
                        "entrance_lat": None, "entrance_lon": None, "type": "postcode", "mapbox_id": "",
                        "postcode": cep_fmt, "address_number": "", "street": cep_info.get("street") or "",
                        "accuracy": "approximate", "match_confidence": "", "address_number_match": "",
                        "street_match": "", "postcode_match": "matched",
                        "precision_label": f"CEP localizado; nº {query_meta['number']} não confirmado",
                        "number_unverified": True, "source": "cep-fallback", "cep_query": True,
                    }]
                except Exception:
                    results = []
            else:
                results = []

    # Pure CEP must always display the canonical postal street/address first, even
    # if a geocoder returns a nearby POI or a differently formatted street label.
    if query_meta.get("cep") and cep_info:
        canonical = _cep_authoritative_result(cep_info, query_meta, results, proximity)
        if canonical:
            results = [canonical] + [x for x in results if x.get("source") != "cep-authoritative"]

    for item in results:
        item.pop("rank", None)
    return results[:10]


def mapbox_reverse_geocode(lon, lat):
    data = mapbox_get(f"{MAPBOX_GEOCODING_URL}/reverse", {
        "longitude": float(lon),
        "latitude": float(lat),
        "language": preferred_language(),
    })
    features = data.get("features", [])
    if not features:
        return f"{lat:.5f}, {lon:.5f}"
    props = features[0].get("properties") or {}
    return props.get("full_address") or ", ".join(x for x in [props.get("name_preferred") or props.get("name"), props.get("place_formatted")] if x) or f"{lat:.5f}, {lon:.5f}"

def sanitize_depart_at(value):
    value = (value or "now").strip()
    if value == "now":
        return "now"
    # ISO 8601 enxuto; o Mapbox calcula o fuso quando não há offset.
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?", value):
        return value[:32]
    return "now"


def sanitize_start_bearing(value):
    """Normalize a GPS heading for provider-side start-direction matching."""
    try:
        bearing = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(bearing):
        return None
    return round(bearing % 360.0, 1)


def sanitize_start_speed(value):
    try:
        speed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(speed) or speed < 0:
        return None
    return round(min(speed, 70.0), 2)


def _bearing_delta_deg(a, b):
    return abs(((float(a) - float(b) + 180.0) % 360.0) - 180.0)


def _route_initial_bearing(route):
    coords = ((route or {}).get("geometry") or {}).get("coordinates") or []
    valid = []
    for c in coords[:80]:
        try:
            lon, lat = float(c[0]), float(c[1])
        except (TypeError, ValueError, IndexError):
            continue
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            valid.append((lon, lat))
    if len(valid) < 2:
        return None
    a = valid[0]
    for b in valid[1:]:
        if haversine_m(a[1], a[0], b[1], b[0]) < 14:
            continue
        y = math.sin(math.radians(b[0]-a[0])) * math.cos(math.radians(b[1]))
        x = math.cos(math.radians(a[1])) * math.sin(math.radians(b[1])) - math.sin(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.cos(math.radians(b[0]-a[0]))
        return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return None


def apply_start_direction_guard(routes, start_bearing=None, start_speed=None, moving_threshold=1.2):
    """Reject variants that begin almost opposite to a moving vehicle's heading.

    Mapbox's bearings parameter is the primary constraint. This second pass protects
    the custom micro-route pool too, because some variants are generated by helper
    calls that do not necessarily carry live GPS context. If every candidate fails,
    keep the provider set rather than leaving the user without a route.
    """
    routes = list(routes or [])
    bearing = sanitize_start_bearing(start_bearing)
    speed = sanitize_start_speed(start_speed)
    if bearing is None or speed is None or speed < moving_threshold or not routes:
        return routes, {"active": False, "rejected": 0, "bearing": bearing, "speed_mps": speed}
    accepted, rejected = [], 0
    for route in routes:
        rb = _route_initial_bearing(route)
        delta = _bearing_delta_deg(rb, bearing) if rb is not None else None
        route["_start_direction_bearing"] = round(rb, 1) if rb is not None else None
        route["_start_direction_delta"] = round(delta, 1) if delta is not None else None
        route["_start_direction_ok"] = bool(delta is None or delta <= 112.0)
        if route["_start_direction_ok"]:
            accepted.append(route)
        else:
            rejected += 1
    if not accepted:
        return routes, {"active": True, "rejected": 0, "bearing": bearing, "speed_mps": speed, "fallback": "provider-set"}
    return accepted, {"active": True, "rejected": rejected, "bearing": bearing, "speed_mps": speed}



def _ors_language():
    lang = (preferred_language() or "pt-BR").lower()
    return "pt" if lang.startswith("pt") else (lang.split("-", 1)[0] or "en")


def _ors_step_type(step_type):
    # ORS encodes maneuver type as an integer. We keep broad maneuver labels only;
    # the human instruction string remains the source of truth for guidance/voice.
    mapping = {
        0: ("turn", "left"), 1: ("turn", "right"), 2: ("turn", "sharp-left"),
        3: ("turn", "sharp-right"), 4: ("turn", "slight-left"), 5: ("turn", "slight-right"),
        6: ("continue", "straight"), 7: ("roundabout", ""), 8: ("roundabout", ""),
        10: ("arrive", ""), 11: ("depart", ""), 12: ("keep", "left"), 13: ("keep", "right"),
    }
    try:
        return mapping.get(int(step_type), ("continue", ""))
    except Exception:
        return ("continue", "")


def openrouteservice_routes(start_lon, start_lat, end_lon, end_lat, travel_profile="walking", alternatives=True):
    """Secondary routing provider used only when Mapbox cannot produce a route.

    Uses the official HeiGIT/openrouteservice endpoint. Returned data is normalized
    to the subset of the Mapbox route shape that Vano Maps already consumes.
    """
    if not OPENROUTESERVICE_API_KEY:
        raise RuntimeError("Fallback openrouteservice não configurado (OPENROUTESERVICE_API_KEY).")
    profiles = {"walking": "foot-walking", "cycling": "cycling-regular", "driving": "driving-car", "motorcycle": "driving-car"}
    profile = profiles.get(travel_profile, "foot-walking")
    url = f"{OPENROUTESERVICE_URL}/{profile}/geojson"
    body = {
        "coordinates": [[float(start_lon), float(start_lat)], [float(end_lon), float(end_lat)]],
        "instructions": True,
        "instructions_format": "text",
        "language": _ors_language(),
        "preference": "fastest",
    }
    direct_km = haversine_m(start_lat, start_lon, end_lat, end_lon) / 1000.0
    if alternatives and direct_km <= 95:
        body["alternative_routes"] = {"target_count": 3, "weight_factor": 1.45, "share_factor": 0.7}
    headers = {"Authorization": OPENROUTESERVICE_API_KEY, "Content-Type": "application/json", "Accept": "application/geo+json, application/json"}
    try:
        r = requests.post(url, json=body, headers=headers, timeout=22)
        if r.status_code >= 400 and "alternative_routes" in body:
            body.pop("alternative_routes", None)
            r = requests.post(url, json=body, headers=headers, timeout=22)
        r.raise_for_status()
        data = r.json() or {}
    except Exception as exc:
        raise RuntimeError(f"openrouteservice indisponível: {exc}") from exc
    routes = []
    for feature in (data.get("features") or [])[:4]:
        props = feature.get("properties") or {}
        summary = props.get("summary") or {}
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if geometry.get("type") != "LineString" or len(coords) < 2:
            continue
        normalized_steps = []
        for segment in props.get("segments") or []:
            for st in segment.get("steps") or []:
                mtype, modifier = _ors_step_type(st.get("type"))
                way = st.get("way_points") or []
                loc = None
                if way:
                    try:
                        idx = max(0, min(len(coords)-1, int(way[-1])))
                        loc = coords[idx]
                    except Exception:
                        loc = None
                normalized_steps.append({
                    "distance": float(st.get("distance") or 0),
                    "duration": float(st.get("duration") or 0),
                    "name": str(st.get("name") or ""),
                    "maneuver": {
                        "instruction": str(st.get("instruction") or "Continue pela rota"),
                        "type": mtype, "modifier": modifier,
                        "location": loc or coords[0],
                    },
                    "voiceInstructions": [{
                        "distanceAlongGeometry": float(st.get("distance") or 0),
                        "announcement": str(st.get("instruction") or "Continue pela rota"),
                    }],
                    "intersections": [],
                })
        routes.append({
            "distance": float(summary.get("distance") or 0),
            "duration": float(summary.get("duration") or 0),
            "geometry": {"type": "LineString", "coordinates": coords},
            "legs": [{"steps": normalized_steps, "annotation": {}}],
            "_profile_used": f"openrouteservice-{profile}",
            "_provider": "openrouteservice",
            "_traffic_source": "unavailable",
        })
    if not routes:
        raise RuntimeError("openrouteservice não encontrou rota.")
    return routes


def osrm_routes(start_lon, start_lat, end_lon, end_lat, travel_profile="driving", alternatives=True):
    """Optional final fallback for a user-configured/self-hosted OSRM server."""
    if not OSRM_BASE_URL:
        raise RuntimeError("OSRM fallback não configurado.")
    profile = "driving" if is_motorized_profile(travel_profile) else ("cycling" if travel_profile == "cycling" else "walking")
    url = f"{OSRM_BASE_URL}/route/v1/{profile}/{float(start_lon):.6f},{float(start_lat):.6f};{float(end_lon):.6f},{float(end_lat):.6f}"
    params = {"alternatives": "true" if alternatives else "false", "steps": "true", "overview": "full", "geometries": "geojson"}
    try:
        r = requests.get(url, params=params, timeout=18); r.raise_for_status(); data = r.json() or {}
    except Exception as exc:
        raise RuntimeError(f"OSRM indisponível: {exc}") from exc
    if data.get("code") != "Ok":
        raise RuntimeError(data.get("message") or "OSRM não encontrou rota.")
    routes=[]
    for raw in (data.get("routes") or [])[:4]:
        raw["_profile_used"] = f"osrm-{profile}"; raw["_provider"] = "osrm"; raw["_traffic_source"] = "unavailable"
        routes.append(raw)
    if not routes: raise RuntimeError("OSRM não encontrou rota.")
    return routes


def fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile="walking", alternatives=True):
    errors=[]
    if OPENROUTESERVICE_API_KEY:
        try: return openrouteservice_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,alternatives)
        except Exception as exc: errors.append(str(exc))
    if OSRM_BASE_URL:
        try: return osrm_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,alternatives)
        except Exception as exc: errors.append(str(exc))
    raise RuntimeError("Nenhum provedor secundário de rotas disponível." + (" " + " | ".join(errors) if errors else ""))



def motorized_candidate_routes(start_lon, start_lat, end_lon, end_lat, travel_profile="driving", depart_at="now", micro_budget=8, mapbox_exclusions=None, extra_excludes=None, start_bearing=None, start_speed=None, reroute=False):
    """V48 Mapbox-only candidate engine.

    Mapbox provides the traffic-aware base alternatives; Vano Maps then expands them with
    nearby block/corridor micro-variants before the selected policy chooses a winner.
    """
    routes = mapbox_routes(
        start_lon, start_lat, end_lon, end_lat, travel_profile,
        depart_at=depart_at, exclusions=mapbox_exclusions, alternatives=True,
        extra_excludes=extra_excludes, start_bearing=start_bearing, start_speed=start_speed, reroute=reroute,
    )
    return routes, "mapbox", len(routes)

def mapbox_routes(start_lon, start_lat, end_lon, end_lat, travel_profile="walking", depart_at="now", exclusions=None, alternatives=True, extra_excludes=None, start_bearing=None, start_speed=None, reroute=False):
    profile_map = {
        "walking": "walking",
        "cycling": "cycling",
        "driving": "driving-traffic",
        # Mapbox has no dedicated motorcycle Directions profile. We use the
        # motorized traffic graph and apply motorcycle-specific safety/scoring
        # in Vano Maps instead of pretending bike routing is appropriate.
        "motorcycle": "driving-traffic",
    }
    profile = profile_map.get(travel_profile, "walking")
    coords = f"{start_lon},{start_lat};{end_lon},{end_lat}"
    params = {
        "alternatives": "true" if alternatives else "false",
        "steps": "true",
        "banner_instructions": "true",
        "voice_instructions": "true",
        "voice_units": "metric",
        "geometries": "geojson",
        "overview": "full",
        "language": preferred_language(),
        "annotations": "distance,duration,speed",
    }
    if profile == "driving-traffic":
        params["annotations"] = "distance,duration,speed,congestion,congestion_numeric,maxspeed,closure"
        params["notifications"] = "all"
        params["depart_at"] = sanitize_depart_at(depart_at)
        # Live direction guard: when the GPS says the vehicle is actually moving,
        # constrain the first snapped road segment to the vehicle heading. This is
        # specifically recommended by Mapbox for rerouting vehicles.
        bearing = sanitize_start_bearing(start_bearing)
        speed = sanitize_start_speed(start_speed)
        direction_guard_active = bearing is not None and speed is not None and speed >= 1.2
        if direction_guard_active:
            params["bearings"] = f"{bearing:.0f},70;"
            params["continue_straight"] = "true"
            if reroute:
                params["avoid_maneuver_radius"] = str(int(clamp(45 + speed * 7.0, 45, 160)))
        excludes = []
        for value in (extra_excludes or []):
            value = str(value or "").strip().lower()
            if value in {"unpaved", "toll", "ferry", "motorway", "tunnel", "cash_only_tolls"} and value not in excludes:
                excludes.append(value)
        if exclusions:
            # Mapbox custom-location exclusions are best-effort; the response is
            # validated again before a professional route is selected.
            for lon, lat in exclusions[:18]:
                excludes.append(f"point({float(lon):.6f} {float(lat):.6f})")
        if excludes:
            params["exclude"] = ",".join(excludes)
    direct_km = haversine_m(start_lat, start_lon, end_lat, end_lon) / 1000.0
    timeout = 28 if direct_km > 1200 else 20
    cache_key = (
        round(float(start_lon), 5), round(float(start_lat), 5),
        round(float(end_lon), 5), round(float(end_lat), 5),
        travel_profile, sanitize_depart_at(depart_at), bool(alternatives), str(params.get("language") or ""),
        str(params.get("bearings") or ""), str(params.get("avoid_maneuver_radius") or ""), bool(reroute),
        tuple(sorted(str(x) for x in (extra_excludes or []))),
        tuple((round(float(x[0]), 5), round(float(x[1]), 5)) for x in (exclusions or [])[:18]),
    )
    cache_ttl = _ROUTE_PROVIDER_CACHE_TTL_LIVE if (is_motorized_profile(travel_profile) and sanitize_depart_at(depart_at) == "now") else _ROUTE_PROVIDER_CACHE_TTL_STATIC
    cached = _route_cache_get(cache_key, cache_ttl)
    if cached is not None:
        return cached
    used_profile = profile
    try:
        data = _route_mapbox_get(f"{MAPBOX_DIRECTIONS_URL}/{profile}/{coords}", params, timeout=timeout)
    except Exception as primary_exc:
        if profile == "driving-traffic":
            try:
                fallback = dict(params)
                fallback.pop("depart_at", None)
                fallback["annotations"] = "distance,duration,speed,maxspeed"
                data = _route_mapbox_get(f"{MAPBOX_DIRECTIONS_URL}/driving/{coords}", fallback, timeout=timeout)
                used_profile = "driving"
            except Exception:
                routes = fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile, alternatives)
                _route_cache_put(cache_key, routes)
                return routes
        else:
            routes = fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile, alternatives)
            _route_cache_put(cache_key, routes)
            return routes
    if data.get("code") != "Ok" and profile == "driving-traffic":
        try:
            fallback = dict(params)
            fallback.pop("depart_at", None)
            fallback["annotations"] = "distance,duration,speed,maxspeed"
            data = _route_mapbox_get(f"{MAPBOX_DIRECTIONS_URL}/driving/{coords}", fallback, timeout=timeout)
            used_profile = "driving"
        except Exception:
            routes = fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile, alternatives)
            _route_cache_put(cache_key, routes)
            return routes
    if data.get("code") != "Ok":
        try:
            routes = fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile, alternatives)
            _route_cache_put(cache_key, routes)
            return routes
        except Exception as fallback_exc:
            raise RuntimeError((data.get("message") or "Nenhuma rota disponível") + f" · fallback: {fallback_exc}")
    routes = data.get("routes", [])
    if not routes:
        try:
            routes = fallback_routes(start_lon, start_lat, end_lon, end_lat, travel_profile, alternatives)
            _route_cache_put(cache_key, routes)
            return routes
        except Exception:
            pass
    for route in routes:
        route["_profile_used"] = used_profile
        route["_provider"] = "mapbox"
    _route_cache_put(cache_key, routes)
    return routes


def mapbox_routes_via(points, depart_at="now", start_bearing=None, start_speed=None, reroute=False):
    """Recalcula o ETA de uma rota atual usando pontos silenciosos como guias do caminho."""
    clean = []
    for item in (points or [])[:8]:
        try:
            lon, lat = float(item[0]), float(item[1])
        except Exception:
            continue
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            if not clean or haversine_m(clean[-1][1], clean[-1][0], lat, lon) > 15:
                clean.append([lon, lat])
    if len(clean) < 2:
        raise RuntimeError("Pontos insuficientes para estimar a rota atual.")
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in clean)
    params = {
        "alternatives": "false",
        "steps": "true",
        "banner_instructions": "true",
        "voice_instructions": "true",
        "voice_units": "metric",
        "geometries": "geojson",
        "overview": "full",
        "language": preferred_language(),
        "annotations": "distance,duration,speed,congestion,congestion_numeric,maxspeed,closure",
        "notifications": "all",
        "depart_at": sanitize_depart_at(depart_at),
        # Os pontos intermediários orientam o caminho sem criar chegadas/partidas artificiais.
        "waypoints": f"0;{len(clean)-1}",
    }
    bearing = sanitize_start_bearing(start_bearing)
    speed = sanitize_start_speed(start_speed)
    if bearing is not None and speed is not None and speed >= 1.2:
        params["bearings"] = ";".join([f"{bearing:.0f},70"] + [""] * (len(clean)-1))
        params["continue_straight"] = "true"
        if reroute:
            params["avoid_maneuver_radius"] = str(int(clamp(45 + speed * 7.0, 45, 160)))
    try:
        data = _route_mapbox_get(f"{MAPBOX_DIRECTIONS_URL}/driving-traffic/{coords}", params, timeout=18)
        used = "driving-traffic"
    except Exception:
        fallback = dict(params)
        fallback.pop("depart_at", None)
        fallback["annotations"] = "distance,duration,speed,maxspeed"
        data = _route_mapbox_get(f"{MAPBOX_DIRECTIONS_URL}/driving/{coords}", fallback, timeout=18)
        used = "driving"
    if data.get("code") != "Ok" or not data.get("routes"):
        raise RuntimeError(data.get("message") or "Não foi possível atualizar a rota atual.")
    route = data["routes"][0]
    route["_profile_used"] = used
    return route


def route_signature(route):
    coords = ((route or {}).get("geometry") or {}).get("coordinates") or []
    if not coords:
        return ""
    step = max(1, len(coords)//18)
    sample = coords[::step][:20]
    raw = "|".join(f"{float(c[0]):.4f},{float(c[1]):.4f}" for c in sample if len(c) >= 2)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:18]


def route_spatial_cells(route, cell_m=72):
    """Coarse geometry fingerprint: detects same-road alternatives despite polyline noise."""
    coords = ((route or {}).get("geometry") or {}).get("coordinates") or []
    valid = [(float(c[0]), float(c[1])) for c in coords if len(c) >= 2]
    if len(valid) < 2:
        return set()
    avg_lat = sum(c[1] for c in valid) / len(valid)
    lat_step = max(.00012, float(cell_m) / 110540.0)
    lon_step = max(.00012, float(cell_m) / (111320.0 * max(.22, math.cos(math.radians(avg_lat)))))
    stride = max(1, len(valid)//700)
    cells = {(int(round(lat/lat_step)), int(round(lon/lon_step))) for lon,lat in valid[::stride]}
    lon, lat = valid[-1]
    cells.add((int(round(lat/lat_step)), int(round(lon/lon_step))))
    return cells

def route_overlap_ratio(a, b):
    ca, cb = route_spatial_cells(a), route_spatial_cells(b)
    if not ca or not cb:
        return 1.0 if route_signature(a) == route_signature(b) else 0.0
    return len(ca & cb) / max(1, min(len(ca), len(cb)))

def select_diverse_routes(routes, max_routes=6, max_overlap=.91, sort_key=None):
    ordered = list(routes or [])
    if sort_key is not None:
        ordered.sort(key=sort_key)
    selected = []
    for route in ordered:
        if not ((route or {}).get("geometry") or {}).get("coordinates"):
            continue
        if any(route_overlap_ratio(route, other) >= max_overlap for other in selected):
            continue
        selected.append(route)
        if len(selected) >= max_routes:
            break
    return selected or ordered[:1]

def adaptive_exclusion_groups(route, budget=4):
    coords = ((route or {}).get("geometry") or {}).get("coordinates") or []
    if len(coords) < 10:
        return []
    fractions = [.24, .40, .56, .72, .84]
    points = []
    for frac in fractions:
        idx = max(2, min(len(coords)-3, int((len(coords)-1)*frac)))
        c = coords[idx]
        if len(c) >= 2:
            points.append([float(c[0]), float(c[1])])
    groups = [[p] for p in points[:max(1, budget-1)]]
    if len(points) >= 3 and budget >= 3:
        groups.append([points[1], points[-2]])
    return groups[:max(1, budget)]

def build_adaptive_corridor_routes(base_routes, start_lon, start_lat, end_lon, end_lat, depart_at="now", budget=4, base_exclusions=None, extra_excludes=None):
    """Expand the pool with block/corridor variants when provider alternatives collapse."""
    if not base_routes:
        return []
    primary = min(base_routes, key=lambda r: float(r.get("duration", 10**12)))
    groups = adaptive_exclusion_groups(primary, max(1, min(5, int(budget or 4))))
    if not groups:
        return []
    def fetch_group(group):
        try:
            found = mapbox_routes(start_lon,start_lat,end_lon,end_lat,"driving",depart_at,exclusions=(list(base_exclusions or [])+list(group))[:18],alternatives=False,extra_excludes=extra_excludes)
            if found:
                candidate = found[0]
                candidate["_adaptive_variant"] = True
                candidate["_adaptive_avoided_points"] = len(group)
                return candidate
        except Exception:
            return None
        return None
    with ThreadPoolExecutor(max_workers=min(4, len(groups))) as pool:
        fetched = list(pool.map(fetch_group, groups))
    fastest_s = max(1.0, float(primary.get("duration") or 1))
    out = []
    for candidate in fetched:
        if not candidate or float(candidate.get("duration") or 10**12) > fastest_s*1.70:
            continue
        if any(route_overlap_ratio(candidate, r) >= .91 for r in list(base_routes)+out):
            continue
        out.append(candidate)
    return out[:budget]

def ensure_adaptive_route_pool(routes, start_lon, start_lat, end_lon, end_lat, depart_at="now", target=4, budget=4, base_exclusions=None, extra_excludes=None):
    base = list(routes or [])
    if not base:
        return []
    distinct = select_diverse_routes(base, max_routes=8, max_overlap=.91, sort_key=lambda r: float(r.get("duration", 10**12)))
    # V88: Mapbox alternatives are already useful. Only probe generic corridors
    # when alternatives are sparse AND the fastest route has meaningful traffic.
    primary = min(base, key=lambda r: float(r.get("duration", 10**12)))
    traffic = route_traffic_metrics(primary)
    traffic_score = float(traffic.get("traffic_score") or 0)
    severe = int(traffic.get("severe_segments") or 0)
    duration_s = float(primary.get("duration") or 0)
    if len(distinct) < min(target, 3) and duration_s >= 420 and (traffic_score >= 42 or severe > 0):
        base.extend(build_adaptive_corridor_routes(base,start_lon,start_lat,end_lon,end_lat,depart_at,budget=min(2,budget),base_exclusions=base_exclusions,extra_excludes=extra_excludes))
    return select_diverse_routes(base, max_routes=7, max_overlap=.93, sort_key=lambda r: float(r.get("duration", 10**12)))


def route_traffic_metrics(route):
    """Turn Mapbox per-edge traffic annotations into compact route intelligence.

    The raw provider data remains the source of truth for ETA/routing. This helper
    only summarizes it for UI, route scoring and traffic-aware rerouting.
    """
    empty = {
        "traffic_score": 0, "traffic_level": "Sem dados", "congested_distance_km": 0,
        "traffic_points": [], "traffic_segments": [], "traffic_corridors": [],
        "severe_segments": 0, "traffic_delay_min": 0, "traffic_delay_pct": 0,
        "duration_typical": None, "traffic_source": route.get("_traffic_source", "mapbox-driving-traffic") if route else "mapbox-driving-traffic",
    }
    if not route:
        return dict(empty)
    geometry = (route.get("geometry") or {}).get("coordinates") or []
    if len(geometry) < 2:
        return dict(empty)

    weights = {"unknown": 15, "low": 15, "moderate": 48, "heavy": 76, "severe": 94}
    samples = []
    step_ranges = []
    global_m = 0.0
    severe_indices = []
    closures_count = 0
    incidents_count = 0

    # Step ranges give human-readable street names without an extra geocoding call.
    for leg in route.get("legs", []) or []:
        leg_start = global_m
        for step in leg.get("steps", []) or []:
            d = max(0.0, float(step.get("distance") or 0))
            step_ranges.append({
                "start": global_m,
                "end": global_m + d,
                "street": str(step.get("name") or "").strip()[:140] or "Trecho da rota",
                "duration": max(0.0, float(step.get("duration") or 0)),
                "duration_typical": max(0.0, float(step.get("duration_typical") or 0)) if step.get("duration_typical") is not None else None,
            })
            global_m += d
        # Annotation distance is the best alignment reference; correct any small
        # difference between sum(step.distance) and the leg annotation total.
        ann = leg.get("annotation") or {}
        nums = list(ann.get("congestion_numeric") or [])
        labels = list(ann.get("congestion") or [])
        distances = list(ann.get("distance") or [])
        n = max(len(nums), len(labels), len(distances))
        ann_cursor = leg_start
        for i in range(n):
            d = float(distances[i]) if i < len(distances) and distances[i] is not None else 1.0
            d = max(0.2, d)
            numeric = nums[i] if i < len(nums) else None
            label = str(labels[i]).lower() if i < len(labels) and labels[i] else "unknown"
            score = clamp(float(numeric) if numeric is not None else float(weights.get(label, 20)), 0, 100)
            samples.append({"start": ann_cursor, "end": ann_cursor + d, "distance": d, "score": score, "label": label})
            if score >= 65 or label in {"heavy", "severe"}:
                severe_indices.append(len(samples)-1)
            ann_cursor += d
        # Keep following legs aligned to annotation distance when available.
        if n:
            global_m = max(global_m, ann_cursor)
        closures_count += len(leg.get("closures") or [])
        incidents_count += len(leg.get("incidents") or [])

    if not samples:
        out = dict(empty)
        out["closures_count"] = closures_count
        out["incidents_count"] = incidents_count
        return out

    total_d = sum(x["distance"] for x in samples)
    weighted = sum(x["score"] * x["distance"] for x in samples)
    congested_d = sum(x["distance"] for x in samples if x["score"] >= 65 or x["label"] in {"heavy", "severe"})
    score = weighted / max(total_d, 1)
    level = traffic_level_from_score(score)

    # Map provider distance to the rendered route geometry by physical cumulative
    # distance. This is more stable than mapping annotation index -> polyline index.
    geom_cum = [0.0]
    for i in range(1, len(geometry)):
        try:
            a, b = geometry[i-1], geometry[i]
            geom_cum.append(geom_cum[-1] + haversine_m(float(a[1]), float(a[0]), float(b[1]), float(b[0])))
        except Exception:
            geom_cum.append(geom_cum[-1])
    geom_total = max(1.0, geom_cum[-1])
    provider_total = max(1.0, total_d)

    def geom_index_at(provider_m):
        target = clamp(float(provider_m) / provider_total, 0, 1) * geom_total
        lo, hi = 0, len(geom_cum)-1
        while lo < hi:
            mid = (lo + hi) // 2
            if geom_cum[mid] < target:
                lo = mid + 1
            else:
                hi = mid
        return max(0, min(len(geometry)-1, lo))

    def street_for_distance(mid_m):
        for s in step_ranges:
            if s["start"] <= mid_m <= s["end"] + 1:
                return s["street"]
        return "Trecho da rota"

    def bucket(v):
        if v >= 82: return "severe"
        if v >= 62: return "heavy"
        if v >= 40: return "moderate"
        return "free"

    # Merge contiguous annotations into a complete route traffic ribbon.
    # Free-flow is intentionally kept as orange so the route can transition
    # continuously orange -> yellow -> orange/red without visual gaps.
    merged = []
    for sample in samples:
        b = bucket(sample["score"])
        if merged and merged[-1]["bucket"] == b and sample["start"] - merged[-1]["end"] < 30:
            old_d = merged[-1]["distance"]
            new_d = old_d + sample["distance"]
            merged[-1]["score"] = (merged[-1]["score"] * old_d + sample["score"] * sample["distance"]) / max(1, new_d)
            merged[-1]["distance"] = new_d
            merged[-1]["end"] = sample["end"]
        else:
            merged.append({**sample, "bucket": b})

    segments = []
    for seg in merged[:90]:
        i0 = geom_index_at(seg["start"])
        i1 = max(i0 + 1, geom_index_at(seg["end"]))
        i1 = min(len(geometry)-1, i1)
        coords = geometry[i0:i1+1]
        if len(coords) < 2:
            continue
        mid = (seg["start"] + seg["end"]) / 2
        segments.append({
            "score": round(seg["score"], 1),
            "level": traffic_level_from_score(seg["score"]),
            "bucket": seg["bucket"],
            "street": street_for_distance(mid),
            "distance_start_m": round(seg["start"]),
            "distance_end_m": round(seg["end"]),
            "coordinates": coords,
        })

    # Street-level summaries are computed by overlapping edge annotations with
    # Mapbox steps. This adds no extra API call and lets the UI say which road is
    # slow and how far ahead it begins.
    corridors = []
    for step in step_ranges:
        if step["end"] <= step["start"]:
            continue
        overlap_d = weighted_step = 0.0
        for sample in samples:
            overlap = max(0.0, min(step["end"], sample["end"]) - max(step["start"], sample["start"]))
            if overlap <= 0:
                continue
            overlap_d += overlap
            weighted_step += sample["score"] * overlap
        if overlap_d <= 0:
            continue
        step_score = weighted_step / overlap_d
        if step_score < 40:
            continue
        typical = step.get("duration_typical")
        delay_s = max(0.0, step["duration"] - typical) if typical is not None else 0.0
        item = {
            "street": step["street"],
            "score": round(step_score, 1),
            "level": traffic_level_from_score(step_score),
            "distance_start_m": round(step["start"]),
            "distance_end_m": round(step["end"]),
            "length_m": round(step["end"] - step["start"]),
            "delay_s": round(delay_s),
        }
        # Merge adjacent steps on the same named road.
        if corridors and corridors[-1]["street"] == item["street"] and item["distance_start_m"] - corridors[-1]["distance_end_m"] < 60:
            prev = corridors[-1]
            total_len = max(1, prev["length_m"] + item["length_m"])
            prev["score"] = round((prev["score"]*prev["length_m"] + item["score"]*item["length_m"]) / total_len, 1)
            prev["level"] = traffic_level_from_score(prev["score"])
            prev["distance_end_m"] = item["distance_end_m"]
            prev["length_m"] = total_len
            prev["delay_s"] += item["delay_s"]
        else:
            corridors.append(item)

    # Representative severe points are only for generating provider-side bypass
    # candidates. They are intentionally sparse to avoid extra Directions calls.
    points = []
    last_m = -10**9
    for idx in severe_indices:
        sample = samples[idx]
        mid = (sample["start"] + sample["end"]) / 2
        if mid - last_m < max(180, total_d / 14):
            continue
        gi = geom_index_at(mid)
        c = geometry[gi]
        if len(c) >= 2:
            points.append([float(c[0]), float(c[1])])
            last_m = mid
        if len(points) >= 6:
            break

    live_duration = max(0.0, float(route.get("duration") or 0))
    typical_duration = route.get("duration_typical")
    try:
        typical_duration = max(0.0, float(typical_duration)) if typical_duration is not None else None
    except (TypeError, ValueError):
        typical_duration = None
    delay_s = max(0.0, live_duration - typical_duration) if typical_duration is not None else 0.0
    delay_pct = (delay_s / max(typical_duration, 1) * 100.0) if typical_duration else 0.0

    return {
        "traffic_score": round(score, 1),
        "traffic_level": level,
        "congested_distance_km": round(congested_d/1000.0, 2),
        "traffic_points": points,
        "traffic_segments": segments[:140],
        "traffic_corridors": sorted(corridors, key=lambda x: (x["distance_start_m"], -x["score"]))[:18],
        "severe_segments": len(severe_indices),
        "traffic_delay_min": round(delay_s/60.0, 1),
        "traffic_delay_pct": round(delay_pct, 1),
        "duration_typical": round(typical_duration, 1) if typical_duration is not None else None,
        "closures_count": closures_count,
        "incidents_count": incidents_count,
        "traffic_source": "mapbox-driving-traffic",
    }



def route_live_flow_metrics(route):
    """Cruza a geometria da rota com células anônimas do Vano Maps Live Flow."""
    coords = ((route or {}).get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return {"live_flow_score": 0, "live_flow_cells": 0, "live_flow_confidence": 0, "live_flow_points": []}
    lons = [float(c[0]) for c in coords if len(c) >= 2]
    lats = [float(c[1]) for c in coords if len(c) >= 2]
    if not lons or not lats:
        return {"live_flow_score": 0, "live_flow_cells": 0, "live_flow_confidence": 0, "live_flow_points": []}
    db = get_db()
    prune_flow_samples(db)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=20)).replace(microsecond=0).isoformat()
    pad = 0.004
    rows = db.execute('''
        SELECT cell_lat,cell_lon,direction_bucket,AVG(speed_kmh) avg_speed,COUNT(*) samples,COUNT(DISTINCT source_hash) sources,MAX(created_at) updated_at
        FROM flow_samples
        WHERE created_at>=? AND cell_lat BETWEEN ? AND ? AND cell_lon BETWEEN ? AND ?
        GROUP BY cell_lat,cell_lon,direction_bucket
        HAVING COUNT(DISTINCT source_hash) >= 3
        LIMIT 220
    ''', (cutoff, min(lats)-pad, max(lats)+pad, min(lons)-pad, max(lons)+pad)).fetchall()
    hits = []
    for row in rows:
        d = min_distance_to_geometry_m(float(row["cell_lat"]), float(row["cell_lon"]), coords)
        if d > 190:
            continue
        speed = float(row["avg_speed"] or 0)
        if speed < 8: score = 92
        elif speed < 18: score = 72
        elif speed < 32: score = 48
        else: score = 18
        weight = min(8.0, float(row["sources"] or 0)) * max(0.25, 1.0 - d / 220.0)
        hits.append((score, weight, row, d))
    if not hits:
        return {"live_flow_score": 0, "live_flow_cells": 0, "live_flow_confidence": 0, "live_flow_points": []}
    total_w = sum(x[1] for x in hits)
    score = sum(x[0] * x[1] for x in hits) / max(total_w, 1)
    distinct_sources = sum(min(5, int(x[2]["sources"] or 0)) for x in hits)
    confidence = clamp(18 + distinct_sources * 3.5 + len(hits) * 4, 0, 100)
    points = [{
        "lat": float(row["cell_lat"]), "lon": float(row["cell_lon"]),
        "avg_speed_kmh": round(float(row["avg_speed"] or 0), 1), "sources": int(row["sources"] or 0),
        "traffic_score": int(sc), "distance_to_route_m": round(d), "source": "rairo-live-flow",
    } for sc, _w, row, d in sorted(hits, key=lambda x: x[3])[:18]]
    return {"live_flow_score": round(score, 1), "live_flow_cells": len(hits), "live_flow_confidence": round(confidence, 1), "live_flow_points": points}


def traffic_level_from_score(score):
    score = float(score or 0)
    if score < 28: return "Leve"
    if score < 52: return "Moderado"
    if score < 74: return "Intenso"
    return "Muito intenso"

def build_micro_route(base_routes, start_lon, start_lat, end_lon, end_lat, depart_at="now"):
    if not base_routes:
        return None
    fastest = min(base_routes, key=lambda r: float(r.get("duration", 10**12)))
    t = route_traffic_metrics(fastest)
    # O driving-traffic já evita tráfego. A micro-rota só é tentada quando ainda existe
    # um gargalo relevante, evitando chamadas extras desnecessárias.
    if t["traffic_score"] < 42 or not t["traffic_points"] or float(fastest.get("duration", 0)) < 240:
        return None
    try:
        candidates = mapbox_routes(start_lon, start_lat, end_lon, end_lat, "driving", depart_at, t["traffic_points"], alternatives=False)
    except Exception:
        return None
    if not candidates:
        return None
    candidate = candidates[0]
    candidate["_micro_route"] = True
    candidate["_micro_avoided_points"] = len(t["traffic_points"])
    return candidate


def traffic_hotspot_clusters(route, max_clusters=6):
    """Extract block-scale congestion clusters from the provider traffic ribbon.

    The output is intentionally sparse: each point is snapped by Mapbox when used
    as a point exclusion, which lets the provider search side streets around a
    congested block/corridor instead of us inventing off-road geometry.
    """
    traffic = route_traffic_metrics(route)
    segments = [s for s in (traffic.get("traffic_segments") or []) if s.get("bucket") in {"heavy", "severe"}]
    if not segments:
        return []
    clusters = []
    for seg in segments:
        coords = seg.get("coordinates") or []
        if len(coords) < 2:
            continue
        start_m = float(seg.get("distance_start_m") or 0)
        end_m = float(seg.get("distance_end_m") or start_m)
        score = float(seg.get("score") or 0)
        if clusters and start_m - clusters[-1]["end_m"] <= 140:
            c = clusters[-1]
            c["end_m"] = max(c["end_m"], end_m)
            c["score"] = max(c["score"], score)
            c["coordinates"].extend(coords[1:])
            if seg.get("street") and seg.get("street") != "Trecho da rota":
                c["street"] = seg.get("street")
        else:
            clusters.append({
                "start_m": start_m, "end_m": end_m, "score": score,
                "street": seg.get("street") or "Trecho da rota",
                "coordinates": list(coords),
            })
    out = []
    for c in clusters:
        coords = c.pop("coordinates", [])
        if len(coords) < 2:
            continue
        mid = coords[len(coords)//2]
        if len(mid) < 2:
            continue
        span = max(1.0, c["end_m"] - c["start_m"])
        priority = c["score"] * min(2.2, .75 + span/550.0)
        out.append({**c, "point": [float(mid[0]), float(mid[1])], "span_m": round(span), "priority": priority})
    out.sort(key=lambda x: (-x["priority"], x["start_m"]))
    return out[:max_clusters]


def build_fast_micro_routes(base_routes, start_lon, start_lat, end_lon, end_lat, depart_at="now"):
    """Generate ETA-only block bypasses in parallel around live congestion.

    Important: fastest mode never consults the Safety Engine. The provider ETA is
    still the sole winner criterion. Small block-level deviations are *not* thrown
    away merely because they overlap most of the original route.
    """
    if not base_routes:
        return []
    fastest = min(base_routes, key=lambda r: float(r.get("duration", 10**12)))
    baseline_s = max(1.0, float(fastest.get("duration") or 1))
    traffic = route_traffic_metrics(fastest)
    clusters = traffic_hotspot_clusters(fastest, max_clusters=6)
    if baseline_s < 150 or not clusters:
        return []
    if float(traffic.get("traffic_score") or 0) < 32 and int(traffic.get("severe_segments") or 0) == 0:
        return []

    groups = []
    # One hotspot = true block-scale bypass.
    for c in clusters[:4]:
        groups.append({"points": [c["point"]], "kind": "block", "labels": [c["street"]]})
    # Long jams often need a corridor escape instead of one side street.
    if len(clusters) >= 2:
        groups.append({"points": [clusters[0]["point"], clusters[1]["point"]], "kind": "corridor", "labels": [clusters[0]["street"], clusters[1]["street"]]})
    if len(clusters) >= 3 and float(traffic.get("traffic_score") or 0) >= 58:
        groups.append({"points": [c["point"] for c in clusters[:3]], "kind": "corridor", "labels": [c["street"] for c in clusters[:3]]})
    groups = groups[:6]

    def fetch(spec):
        try:
            found = mapbox_routes(
                start_lon, start_lat, end_lon, end_lat, "driving", depart_at,
                exclusions=spec["points"], alternatives=False, extra_excludes=None,
            )
            if not found:
                return None
            candidate = found[0]
            # Avoid pathological detours, but allow a candidate to be slower: the
            # final selector will simply ignore it if it does not beat the ETA.
            if float(candidate.get("duration") or 10**12) > baseline_s * 1.42:
                return None
            candidate["_micro_route"] = True
            candidate["_micro_avoided_points"] = len(spec["points"])
            candidate["_micro_strategy"] = spec["kind"]
            candidate["_micro_streets"] = list(dict.fromkeys(spec["labels"]))[:3]
            candidate["_fast_eta_only"] = True
            candidate["_eta_gain_s"] = round(baseline_s - float(candidate.get("duration") or baseline_s), 1)
            return candidate
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=min(6, len(groups))) as pool:
        fetched = list(pool.map(fetch, groups))

    # Exact duplicates are useless, but 97-99% overlap can be precisely the useful
    # one-block shortcut the user asked for, so do not apply broad overlap pruning.
    seen = {route_signature(r) for r in base_routes}
    out = []
    for candidate in fetched:
        if not candidate:
            continue
        sig = route_signature(candidate)
        if sig and sig in seen:
            continue
        seen.add(sig)
        out.append(candidate)
    out.sort(key=lambda r: float(r.get("duration") or 10**12))
    return out[:6]


def build_dense_micro_route_pool(base_routes, start_lon, start_lat, end_lon, end_lat, depart_at="now", budget=8, base_exclusions=None, extra_excludes=None):
    """Generate a bounded but broad pool of block/corridor micro-routes.

    There is no finite way to request literally every street combination from a
    routing provider. Instead, V45 enumerates the useful combinations around the
    strongest live congestion clusters (single blocks, adjacent pairs and short
    corridors), requests them in parallel and keeps every exact-distinct route
    that remains within a sane detour ceiling. The normal mode selector still
    decides the winner afterwards.
    """
    base = list(base_routes or [])
    if not base:
        return []
    requested_budget = max(2, min(12, int(budget or 8)))
    baseline = min(base, key=lambda r: float(r.get("duration") or 10**12))
    baseline_s = max(1.0, float(baseline.get("duration") or 1))
    baseline_t = route_traffic_metrics(baseline)
    baseline_score = float(baseline_t.get("traffic_score") or 0)
    severe_count = int(baseline_t.get("severe_segments") or 0)
    # V88: do not spend several provider calls on short/light trips. Increase
    # exploration only when live congestion is strong enough to justify it.
    if baseline_s < 300:
        return []
    if baseline_score < 34 and severe_count == 0:
        return []
    if baseline_score >= 82 or severe_count >= 5:
        dynamic_budget = 6
    elif baseline_score >= 68 or severe_count >= 3:
        dynamic_budget = 5
    elif baseline_score >= 52 or severe_count >= 2:
        dynamic_budget = 4
    else:
        dynamic_budget = 2
    budget = min(requested_budget, dynamic_budget)

    seeds = select_diverse_routes(base, max_routes=2, max_overlap=.965, sort_key=lambda r: float(r.get("duration") or 10**12))
    specs = []

    def add_spec(points, kind, streets):
        clean = []
        for point in points or []:
            try:
                lon, lat = float(point[0]), float(point[1])
            except Exception:
                continue
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue
            if all(haversine_m(lat, lon, q[1], q[0]) > 55 for q in clean):
                clean.append([lon, lat])
        if not clean:
            return
        key = tuple((round(x[0], 4), round(x[1], 4)) for x in clean[:4])
        if any(x["key"] == key for x in specs):
            return
        specs.append({"key": key, "points": clean[:4], "kind": kind, "streets": list(dict.fromkeys(streets or []))[:4]})

    for seed_idx, seed in enumerate(seeds):
        clusters = traffic_hotspot_clusters(seed, max_clusters=6)
        # Interleave strategy families before applying the global budget. That way
        # a busy corridor cannot spend every request on single-point exclusions and
        # we always probe both block-scale and multi-block escapes.
        for c in clusters[:4]:
            add_spec([c["point"]], "block", [c.get("street") or "Trecho congestionado"])
        for i in range(min(3, max(0, len(clusters)-1))):
            add_spec([clusters[i]["point"], clusters[i+1]["point"]], "adjacent-blocks", [clusters[i].get("street"), clusters[i+1].get("street")])
        if len(clusters) >= 3:
            for i in range(min(2, len(clusters)-2)):
                window = clusters[i:i+3]
                add_spec([c["point"] for c in window], "short-corridor", [c.get("street") for c in window])
        # Skip-one combinations catch the common pattern where one side street is
        # blocked but the next parallel block still beats the congested corridor.
        for i in range(min(2, max(0, len(clusters)-2))):
            add_spec([clusters[i]["point"], clusters[i+2]["point"]], "parallel-blocks", [clusters[i].get("street"), clusters[i+2].get("street")])
        if seed_idx == 0 and baseline_score >= 58 and len(clusters) >= 4:
            add_spec([clusters[0]["point"], clusters[2]["point"], clusters[3]["point"]], "corridor-escape", [clusters[0].get("street"), clusters[2].get("street"), clusters[3].get("street")])
            add_spec([clusters[1]["point"], clusters[2]["point"], clusters[4]["point"]] if len(clusters) >= 5 else [clusters[1]["point"], clusters[2]["point"], clusters[3]["point"]], "corridor-escape", [clusters[1].get("street"), clusters[2].get("street"), clusters[min(4, len(clusters)-1)].get("street")])

    # If provider traffic was summarized but did not form named clusters, still
    # explore its sparse representative severe points.
    if not specs:
        for point in (baseline_t.get("traffic_points") or [])[:5]:
            add_spec([point], "traffic-point", ["Gargalo detectado"])
    specs = specs[:budget]
    if not specs:
        return []

    def fetch(spec):
        try:
            exclusions = (list(base_exclusions or []) + list(spec["points"]))[:18]
            found = mapbox_routes(
                start_lon, start_lat, end_lon, end_lat, "driving", depart_at,
                exclusions=exclusions, alternatives=False, extra_excludes=extra_excludes,
            )
            if not found:
                return None
            candidate = found[0]
            duration = float(candidate.get("duration") or 10**12)
            if duration > baseline_s * 1.48:
                return None
            after = route_traffic_metrics(candidate)
            after_score = float(after.get("traffic_score") or 0)
            # V88 micro-routes are time-saving candidates, not scenic traffic
            # relief. Safety detours are handled by the safety engine separately.
            eta_gain = baseline_s - duration
            relief = baseline_score - after_score
            min_gain = 30 if baseline_s >= 1200 else 20 if baseline_s >= 600 else 12
            if eta_gain < min_gain:
                return None
            candidate["_micro_route"] = True
            candidate["_micro_avoided_points"] = len(spec["points"])
            candidate["_micro_strategy"] = spec["kind"]
            candidate["_micro_streets"] = [x for x in spec["streets"] if x][:4]
            candidate["_micro_traffic_relief"] = round(relief, 1)
            candidate["_micro_baseline_traffic"] = round(baseline_score, 1)
            candidate["_micro_traffic_score"] = round(after_score, 1)
            candidate["_eta_gain_s"] = round(eta_gain, 1)
            return candidate
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=min(4, len(specs))) as pool:
        fetched = list(pool.map(fetch, specs))

    seen = {route_signature(r) for r in base if route_signature(r)}
    out = []
    for candidate in fetched:
        if not candidate:
            continue
        sig = route_signature(candidate)
        if sig and sig in seen:
            continue
        if sig:
            seen.add(sig)
        out.append(candidate)
    out.sort(key=lambda r: (
        float(r.get("duration") or 10**12),
        -float(r.get("_micro_traffic_relief") or 0),
    ))
    return out[:budget]


def fast_route_payload(route, idx, travel_profile="driving"):
    """Minimal route enrichment for the ETA-only fast engine."""
    traffic = route_traffic_metrics(route) if is_motorized_profile(travel_profile) else {
        "traffic_score": 0, "traffic_level": "—", "congested_distance_km": 0,
        "severe_segments": 0, "traffic_segments": [],
    }
    road = route_road_controls(route)
    return {
        "id": idx,
        "distance": route.get("distance", 0),
        "duration": route.get("duration", 0),
        "duration_min": round(float(route.get("duration", 0)) / 60, 1),
        "geometry": route.get("geometry"),
        "steps": compact_steps(route),
        "profile": travel_profile,
        "micro_route": bool(route.get("_micro_route")),
        "micro_avoided_points": int(route.get("_micro_avoided_points", 0) or 0),
        "micro_strategy": route.get("_micro_strategy") or "",
        "micro_streets": route.get("_micro_streets") or [],
        "micro_traffic_relief": round(float(route.get("_micro_traffic_relief") or 0), 1),
        "micro_baseline_traffic": round(float(route.get("_micro_baseline_traffic") or 0), 1),
        "micro_traffic_score": round(float(route.get("_micro_traffic_score") or 0), 1),
        "eta_gain_s": round(float(route.get("_eta_gain_s") or 0), 1),
        "eta_gain_min": round(max(0.0, float(route.get("_eta_gain_s") or 0))/60.0, 1),
        "adaptive_variant": bool(route.get("_adaptive_variant")),
        "adaptive_avoided_points": int(route.get("_adaptive_avoided_points", 0) or 0),
        "routing_profile_used": route.get("_profile_used", ""),
        "routing_provider": route.get("_provider", "mapbox"),
        "route_signature": route_signature(route),
        "fast_eta_only": True,
        "badges": [],
        # Compatibility fields: the fast engine intentionally does not calculate safety.
        "safety_score": None, "safety_conservative_score": None, "safety_level": None,
        "safety_level_label": "Não analisado no modo Rápida",
        "data_confidence": 0, "decision_confidence": 0, "risk_exposure_pct": 0,
        "hotspot_risk": 0, "risk_zones": [], "risk_factors": [], "nearby_alerts": [],
        "quiet_score": 0, "rairo_score": 0,
        **{k: v for k, v in traffic.items() if k != "traffic_points"},
        **road,
    }


def compact_steps(route):
    steps = []
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            maneuver = step.get("maneuver") or {}
            controls = []
            for inter in step.get("intersections", []) or []:
                loc = inter.get("location") or []
                if len(loc) < 2:
                    continue
                base = {"lon": float(loc[0]), "lat": float(loc[1])}
                if inter.get("traffic_signal"):
                    controls.append({**base, "type": "traffic_signal", "label": "Semáforo"})
                if inter.get("stop_sign"):
                    controls.append({**base, "type": "stop_sign", "label": "Parada obrigatória"})
                if inter.get("yield_sign"):
                    controls.append({**base, "type": "yield_sign", "label": "Dê a preferência"})
                if inter.get("railway_crossing"):
                    controls.append({**base, "type": "railway_crossing", "label": "Cruzamento ferroviário"})
                toll = inter.get("toll_collection") or {}
                if toll:
                    controls.append({**base, "type": "toll", "label": toll.get("name") or "Pedágio"})
            lane_guidance = []
            for inter in step.get("intersections", []) or []:
                lanes = inter.get("lanes") or []
                if lanes:
                    lane_guidance = [{
                        "indications": list(lane.get("indications") or [])[:4],
                        "valid": bool(lane.get("valid")),
                        "active": bool(lane.get("active")),
                    } for lane in lanes[:10]]
                    # A interseção mais próxima do fim do step costuma ser a útil para a manobra.
            steps.append({
                "instruction": maneuver.get("instruction") or "Continue pela rota",
                "name": step.get("name") or "",
                "type": maneuver.get("type", ""),
                "modifier": maneuver.get("modifier", ""),
                "distance": round(float(step.get("distance", 0)), 1),
                "duration": round(float(step.get("duration", 0)), 1),
                "duration_typical": round(float(step.get("duration_typical", 0)), 1) if step.get("duration_typical") is not None else None,
                "bearing_after": maneuver.get("bearing_after"),
                "exit": maneuver.get("exit"),
                "lanes": lane_guidance,
                "speed_limit_sign": step.get("speedLimitSign"),
                "speed_limit_unit": step.get("speedLimitUnit"),
                "controls": controls[:24],
                "voice_prompts": [{
                    "distance": round(float(v.get("distanceAlongGeometry", 0)), 1),
                    "announcement": str(v.get("announcement") or "")[:280],
                } for v in (step.get("voiceInstructions") or [])[:5] if v.get("announcement")],
            })
    # Rotas interestaduais/internacionais podem ter centenas de manobras.
    return steps[:700]


def route_road_controls(route):
    controls = []
    seen = set()
    maxspeeds = []
    incident_count = 0
    closure_count = 0
    for leg in route.get("legs", []) or []:
        incident_count += len(leg.get("incidents") or [])
        closure_count += len(leg.get("closures") or [])
        ann = leg.get("annotation") or {}
        maxspeeds.extend(ann.get("maxspeed") or [])
        for step in leg.get("steps", []) or []:
            for inter in step.get("intersections", []) or []:
                loc = inter.get("location") or []
                if len(loc) < 2:
                    continue
                lon, lat = round(float(loc[0]), 6), round(float(loc[1]), 6)
                types = []
                if inter.get("traffic_signal"): types.append(("traffic_signal", "Semáforo"))
                if inter.get("stop_sign"): types.append(("stop_sign", "Parada obrigatória"))
                if inter.get("yield_sign"): types.append(("yield_sign", "Dê a preferência"))
                if inter.get("railway_crossing"): types.append(("railway_crossing", "Cruzamento ferroviário"))
                toll = inter.get("toll_collection") or {}
                if toll: types.append(("toll", toll.get("name") or "Pedágio"))
                for kind, label in types:
                    key = (kind, lon, lat)
                    if key in seen:
                        continue
                    seen.add(key)
                    controls.append({"type": kind, "label": label, "lon": lon, "lat": lat, "source": "mapbox"})
    known_limits = []
    speed_limit_points = []
    geometry = (route.get("geometry") or {}).get("coordinates") or []
    last_limit = None
    for idx, item in enumerate(maxspeeds):
        if isinstance(item, dict) and item.get("speed") is not None:
            entry = {"speed": item.get("speed"), "unit": item.get("unit") or "km/h"}
            known_limits.append(entry)
            current = (entry["speed"], entry["unit"])
            if current != last_limit and geometry:
                gi = min(max(0, idx), len(geometry)-1)
                speed_limit_points.append({"index": gi, "lon": float(geometry[gi][0]), "lat": float(geometry[gi][1]), **entry})
                last_limit = current
    return {
        "road_controls": controls[:500],
        "road_controls_count": len(controls),
        "known_speed_limits": known_limits[:120],
        "speed_limit_points": speed_limit_points[:220],
        "incidents_count": incident_count,
        "closures_count": closure_count,
    }



def weather_risk_summary(current):
    """Converte condições meteorológicas em contexto de condução, sem alegar precisão de rua."""
    current = current or {}
    precip = max(float(current.get("precipitation") or 0), float(current.get("rain") or 0), float(current.get("showers") or 0))
    visibility = float(current.get("visibility") or 10000)
    gust = float(current.get("wind_gusts_10m") or 0)
    wind = float(current.get("wind_speed_10m") or 0)
    code = int(current.get("weather_code") or 0)
    risk = 0.0
    reasons = []
    if precip >= 8:
        risk += 45; reasons.append("chuva muito forte")
    elif precip >= 3:
        risk += 32; reasons.append("chuva forte")
    elif precip >= 0.8:
        risk += 20; reasons.append("pista possivelmente molhada")
    elif precip > 0:
        risk += 9; reasons.append("chuva leve")
    if visibility < 1200:
        risk += 34; reasons.append("visibilidade muito baixa")
    elif visibility < 3000:
        risk += 22; reasons.append("visibilidade reduzida")
    elif visibility < 6000:
        risk += 10; reasons.append("visibilidade moderada")
    if gust >= 70:
        risk += 28; reasons.append("rajadas muito fortes")
    elif gust >= 50:
        risk += 18; reasons.append("rajadas fortes")
    elif wind >= 40:
        risk += 10; reasons.append("vento forte")
    if code in {95, 96, 99}:
        risk += 26; reasons.append("trovoadas")
    elif code in {80, 81, 82}:
        risk += 12
    risk = round(clamp(risk, 0, 100), 1)
    level = "normal" if risk < 15 else "atenção" if risk < 38 else "elevado" if risk < 65 else "alto"
    return {"risk_score": risk, "risk_level": level, "reasons": reasons[:4]}


def open_meteo_current(lat, lon):
    """Condições atuais sem chave via Open-Meteo; falha silenciosamente para não quebrar navegação."""
    lat, lon = float(lat), float(lon)
    key = (round(lat, 2), round(lon, 2))
    now = time.time()
    with WEATHER_LOCK:
        cached = WEATHER_CACHE.get(key)
        if cached and now - cached[0] < 180:
            return cached[1]
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,rain,showers,weather_code,visibility,wind_speed_10m,wind_gusts_10m,is_day",
        "timezone": "auto",
        "forecast_days": 1,
    }
    try:
        r = requests.get(OPEN_METEO_URL, params=params, headers={"User-Agent": "VANO MAPS/5.0 live-road"}, timeout=8)
        r.raise_for_status()
        data = r.json() or {}
        cur = data.get("current") or {}
        summary = weather_risk_summary(cur)
        result = {
            "available": True,
            "source": "open-meteo",
            "time": cur.get("time"),
            "temperature_c": cur.get("temperature_2m"),
            "precipitation_mm": cur.get("precipitation"),
            "rain_mm": cur.get("rain"),
            "showers_mm": cur.get("showers"),
            "visibility_m": cur.get("visibility"),
            "wind_kmh": cur.get("wind_speed_10m"),
            "gust_kmh": cur.get("wind_gusts_10m"),
            "weather_code": cur.get("weather_code"),
            "is_day": cur.get("is_day"),
            **summary,
        }
    except Exception:
        result = {"available": False, "source": "open-meteo", "risk_score": 0, "risk_level": "indisponível", "reasons": []}
    with WEATHER_LOCK:
        WEATHER_CACHE[key] = (now, result)
        if len(WEATHER_CACHE) > 600:
            stale = sorted(WEATHER_CACHE.items(), key=lambda kv: kv[1][0])[:150]
            for k, _ in stale:
                WEATHER_CACHE.pop(k, None)
    return result


def _element_center(el):
    lat_v, lon_v = el.get("lat"), el.get("lon")
    if lat_v is None or lon_v is None:
        c = el.get("center") or {}
        lat_v, lon_v = c.get("lat"), c.get("lon")
    try:
        return float(lat_v), float(lon_v)
    except (TypeError, ValueError):
        return None


def overpass_live_road_context(lat, lon, radius=850):
    """Consulta periodicamente obstáculos e atributos viários mapeados no OpenStreetMap."""
    radius = int(clamp(radius, 350, 1300))
    key = (round(float(lat), 3), round(float(lon), 3), int(radius / 200) * 200)
    now = time.time()
    with LIVE_CONTEXT_LOCK:
        cached = LIVE_CONTEXT_CACHE.get(key)
        if cached and now - cached[0] < 240:
            return cached[1]
    q = f'''[out:json][timeout:9];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["highway"="construction"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["construction"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["barrier"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["traffic_calming"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["smoothness"~"^(bad|very_bad|horrible|very_horrible|impassable)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["surface"~"^(unpaved|gravel|fine_gravel|dirt|earth|ground|sand|mud|cobblestone|sett)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["lit"="no"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["ford"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["flood_prone"="yes"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["hazard"];
);
out center tags 140;'''
    try:
        r = requests.post(OVERPASS_URL, data={"data": q}, headers={"User-Agent": "VANO MAPS/5.0 live-road-context"}, timeout=11)
        r.raise_for_status()
        elements = (r.json() or {}).get("elements") or []
    except Exception:
        elements = []
    items, seen = [], set()
    for el in elements:
        center = _element_center(el)
        if not center:
            continue
        elat, elon = center
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "")
        surface = str(tags.get("surface") or "")
        smooth = str(tags.get("smoothness") or "")
        barrier = str(tags.get("barrier") or "")
        calming = str(tags.get("traffic_calming") or "")
        kind = label = None
        severity = 2
        avoid = False
        if highway == "construction" or tags.get("construction"):
            kind, label, severity, avoid = "roadwork", "Obra viária mapeada", 4, True
        elif barrier and barrier not in {"kerb", "bollard", "cycle_barrier"}:
            kind, label, severity, avoid = "barrier", "Barreira/obstáculo mapeado", 4, True
        elif smooth in {"very_bad", "horrible", "very_horrible", "impassable"}:
            kind, label, severity = "rough_road", "Pavimento muito irregular", 4
        elif smooth == "bad":
            kind, label, severity = "rough_road", "Pavimento irregular", 3
        elif surface in {"mud", "sand", "dirt", "earth", "ground", "gravel", "fine_gravel", "unpaved", "cobblestone", "sett"}:
            kind, label, severity = "surface", f"Piso {surface.replace('_',' ')}", 2
        elif tags.get("flood_prone") == "yes" or tags.get("ford") is not None:
            kind, label, severity = "water_risk", "Trecho com água/alagamento mapeado", 4
        elif tags.get("hazard"):
            kind, label, severity = "hazard", "Perigo viário mapeado", 3
        elif tags.get("lit") == "no":
            kind, label, severity = "unlit", "Trecho sem iluminação mapeada", 2
        elif calming:
            kind, label, severity = "traffic_calming", "Redutor de velocidade", 1
        if not kind:
            continue
        k = (kind, round(elat, 5), round(elon, 5))
        if k in seen:
            continue
        seen.add(k)
        items.append({
            "id": f"osm-{el.get('type','x')}-{el.get('id','')}", "type": kind, "label": label,
            "lat": elat, "lon": elon, "severity": severity, "avoid_candidate": avoid,
            "source": "openstreetmap", "freshness": "mapped", "name": str(tags.get("name") or "")[:100],
        })
    result = items[:120]
    with LIVE_CONTEXT_LOCK:
        LIVE_CONTEXT_CACHE[key] = (now, result)
        if len(LIVE_CONTEXT_CACHE) > 650:
            stale = sorted(LIVE_CONTEXT_CACHE.items(), key=lambda kv: kv[1][0])[:160]
            for k, _ in stale:
                LIVE_CONTEXT_CACHE.pop(k, None)
    return result


def flow_source_hash():
    nonce = session.get("flow_probe_nonce")
    if not nonce:
        nonce = secrets.token_urlsafe(16)
        session["flow_probe_nonce"] = nonce
    return hmac.new(SECRET_KEY.encode("utf-8"), str(nonce).encode("utf-8"), hashlib.sha256).hexdigest()[:20]


def quantize_flow_cell(lat, lon, cell_deg=0.0022):
    return round(round(float(lat) / cell_deg) * cell_deg, 5), round(round(float(lon) / cell_deg) * cell_deg, 5)


_FLOW_PRUNE_LOCK = threading.Lock()
_FLOW_PRUNE_LAST = 0.0
_FLOW_PRUNE_INTERVAL = max(120, min(1800, int(os.environ.get("RAIRO_FLOW_PRUNE_INTERVAL", "600"))))
_FLOW_QUERY_CACHE = {}
_FLOW_QUERY_CACHE_LOCK = threading.Lock()
_FLOW_QUERY_CACHE_TTL = max(3, min(30, int(os.environ.get("RAIRO_FLOW_QUERY_TTL", "8"))))

def prune_flow_samples(db=None, force=False):
    global _FLOW_PRUNE_LAST
    now_ts=time.time()
    with _FLOW_PRUNE_LOCK:
        if not force and now_ts-_FLOW_PRUNE_LAST < _FLOW_PRUNE_INTERVAL:
            return False
        _FLOW_PRUNE_LAST=now_ts
    db = db or get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=45)).replace(microsecond=0).isoformat()
    db.execute("DELETE FROM flow_samples WHERE created_at < ?", (cutoff,))
    return True


def store_flow_probe(lat, lon, speed_kmh, heading=None):
    db = get_db()
    prune_flow_samples(db)
    cell_lat, cell_lon = quantize_flow_cell(lat, lon)
    try:
        heading_v = float(heading) if heading is not None else 0.0
    except (TypeError, ValueError):
        heading_v = 0.0
    hb = int((heading_v % 360) // 45) * 45
    src = flow_source_hash()
    now = utcnow_iso()
    recent_cutoff = (datetime.now(timezone.utc) - timedelta(seconds=24)).replace(microsecond=0).isoformat()
    exists = db.execute("SELECT 1 FROM flow_samples WHERE source_hash=? AND cell_lat=? AND cell_lon=? AND created_at>=? LIMIT 1", (src, cell_lat, cell_lon, recent_cutoff)).fetchone()
    if not exists:
        db.execute("INSERT INTO flow_samples(cell_lat,cell_lon,direction_bucket,speed_kmh,source_hash,created_at) VALUES(?,?,?,?,?,?)", (cell_lat, cell_lon, hb, clamp(float(speed_kmh), 0, 160), src, now))
        db.commit()
    return cell_lat, cell_lon


def query_live_flow(lat, lon, radius=2400):
    key=(round(float(lat),3),round(float(lon),3),int(float(radius)//400)*400)
    now_ts=time.time()
    with _FLOW_QUERY_CACHE_LOCK:
        item=_FLOW_QUERY_CACHE.get(key)
        if item and now_ts-item[0]<_FLOW_QUERY_CACHE_TTL:
            return copy.deepcopy(item[1])
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=20)).replace(microsecond=0).isoformat()
    deg_lat = float(radius) / 110540.0
    deg_lon = float(radius) / max(25000.0, 111320.0 * math.cos(math.radians(float(lat))))
    rows = db.execute('''
        SELECT cell_lat,cell_lon,direction_bucket,AVG(speed_kmh) avg_speed,COUNT(*) samples,COUNT(DISTINCT source_hash) sources,MAX(created_at) updated_at
        FROM flow_samples
        WHERE created_at>=? AND cell_lat BETWEEN ? AND ? AND cell_lon BETWEEN ? AND ?
        GROUP BY cell_lat,cell_lon,direction_bucket
        HAVING COUNT(DISTINCT source_hash) >= 3
        ORDER BY updated_at DESC LIMIT 120
    ''', (cutoff, float(lat)-deg_lat, float(lat)+deg_lat, float(lon)-deg_lon, float(lon)+deg_lon)).fetchall()
    out = []
    for row in rows:
        speed = float(row["avg_speed"] or 0)
        if speed < 8: level, score = "parado", 92
        elif speed < 18: level, score = "lento", 72
        elif speed < 32: level, score = "moderado", 48
        else: level, score = "fluindo", 18
        out.append({
            "lat": row["cell_lat"], "lon": row["cell_lon"], "direction": row["direction_bucket"],
            "avg_speed_kmh": round(speed, 1), "samples": int(row["samples"]), "sources": int(row["sources"]),
            "traffic_level": level, "traffic_score": score, "updated_at": row["updated_at"], "source": "rairo-live-flow",
        })
    with _FLOW_QUERY_CACHE_LOCK:
        _FLOW_QUERY_CACHE[key]=(now_ts,copy.deepcopy(out))
        if len(_FLOW_QUERY_CACHE)>180:
            for k,_ in sorted(_FLOW_QUERY_CACHE.items(),key=lambda kv:kv[1][0])[:50]:_FLOW_QUERY_CACHE.pop(k,None)
    return out


def community_context(lat, lon, radius=1800):
    dlat = radius / 110540.0
    dlon = radius / max(25000.0, 111320.0 * math.cos(math.radians(float(lat))))
    rows = get_active_reports_for_bounds(float(lat)-dlat, float(lon)-dlon, float(lat)+dlat, float(lon)+dlon)
    items = []
    for r in rows:
        d = haversine_m(float(lat), float(lon), float(r["latitude"]), float(r["longitude"]))
        if d > radius:
            continue
        items.append({
            "id": f"report-{r['id']}", "type": str(r["category"]), "label": str(r["title"]),
            "lat": float(r["latitude"]), "lon": float(r["longitude"]), "severity": int(r["severity"]),
            "confirmations": int(r["confirmations"] or 0), "created_at": r["created_at"],
            "distance_m": round(d), "source": "rairo-community", "freshness": "community-live",
        })
    return sorted(items, key=lambda x: (x["distance_m"], -x["severity"]))[:80]

def overpass_road_awareness(lat, lon, radius=320):
    radius = int(clamp(radius, 250, 5000))
    cache_key = (round(float(lat), 3), round(float(lon), 3), int(radius / 100) * 100)
    now = time.time()
    with ROAD_AWARENESS_LOCK:
        cached = ROAD_AWARENESS_CACHE.get(cache_key)
        if cached and now - cached[0] < 180:
            return cached[1]
    query = f"""[out:json][timeout:13];
(
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"traffic_signals\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"stop\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"give_way\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"traffic_sign\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"speed_camera\"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"enforcement\"~\"^(maxspeed|speed)$\"];
);
out center tags 3000;"""
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, headers={"User-Agent": "VANO MAPS/5.0 road-awareness"}, timeout=15)
        response.raise_for_status()
        data = response.json()
    except Exception:
        return []
    items, seen = [], set()
    for el in data.get("elements", []) or []:
        center = _element_center(el)
        if not center:
            continue
        elat, elon = center
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "")
        enforcement = str(tags.get("enforcement") or "").lower()
        if highway == "speed_camera" or enforcement in {"maxspeed", "speed"}: kind, label = "speed_camera", "Radar de velocidade"
        elif highway == "traffic_signals": kind, label = "traffic_signal", "Semáforo"
        elif highway == "stop": kind, label = "stop_sign", "Parada obrigatória"
        elif highway == "give_way": kind, label = "yield_sign", "Dê a preferência"
        elif tags.get("traffic_sign"): kind, label = "traffic_sign", "Sinalização viária"
        else: continue
        key = (kind, round(float(elat), 6), round(float(elon), 6))
        if key in seen: continue
        seen.add(key)
        items.append({
            "id": str(el.get("id", "")), "type": kind, "label": label,
            "lat": float(elat), "lon": float(elon), "source": "openstreetmap",
            "maxspeed": str(tags.get("maxspeed") or tags.get("maxspeed:forward") or "")[:20],
        })
    with ROAD_AWARENESS_LOCK:
        ROAD_AWARENESS_CACHE[cache_key] = (now, items)
        if len(ROAD_AWARENESS_CACHE) > 800:
            stale = sorted(ROAD_AWARENESS_CACHE.items(), key=lambda kv: kv[1][0])[:200]
            for key, _ in stale: ROAD_AWARENESS_CACHE.pop(key, None)
    return items

def _overpass_query_json(query, timeout=10):
    """Consulta Overpass com failover curto para reduzir falsos 'nenhum resultado'."""
    endpoints = []
    for url in [OVERPASS_URL, "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]:
        url = str(url or "").strip()
        if url and url not in endpoints:
            endpoints.append(url)
    last_error = None
    for url in endpoints[:2]:
        try:
            response = requests.post(
                url, data={"data": query},
                headers={"User-Agent": "VANO MAPS/6.4 nearby-data"}, timeout=max(5, int(timeout)),
            )
            response.raise_for_status()
            payload = response.json() or {}
            if isinstance(payload.get("elements"), list):
                return payload
        except Exception as exc:
            last_error = exc
    if last_error:
        app.logger.debug("Overpass indisponível: %s", last_error)
    return {"elements": []}


# V231 — canonical road snap for community alerts.
_ALERT_ROAD_SEGMENT_CACHE = {}
_ALERT_ROAD_SEGMENT_LOCK = threading.Lock()
_ALERT_ROAD_SEGMENT_TTL = 10 * 60
_ALERT_ROAD_TYPES = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "living_street", "service", "road",
}

def _alert_segment_cache_key(lat, lon, radius):
    return (round(float(lat), 3), round(float(lon), 3), int(radius))

def _alert_road_segments(lat, lon, radius=450):
    radius = max(80, min(1200, int(radius or 450)))
    key = _alert_segment_cache_key(lat, lon, radius)
    now = time.time()
    with _ALERT_ROAD_SEGMENT_LOCK:
        cached = _ALERT_ROAD_SEGMENT_CACHE.get(key)
        if cached and now - cached[0] < _ALERT_ROAD_SEGMENT_TTL:
            return cached[1]
    highway_rx = "|".join(sorted(_ALERT_ROAD_TYPES))
    query = (f'[out:json][timeout:8];way(around:{radius},{float(lat):.7f},{float(lon):.7f})'
             f'["highway"~"^({highway_rx})$"];out tags geom;')
    data = _overpass_query_json(query, timeout=9)
    segments = []
    for el in data.get("elements", []) or []:
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "").strip()
        if highway not in _ALERT_ROAD_TYPES:
            continue
        name = str(tags.get("name") or tags.get("ref") or "").strip()[:140]
        clean = []
        for pt in el.get("geometry") or []:
            try:
                plat, plon = float(pt.get("lat")), float(pt.get("lon"))
            except Exception:
                continue
            if -90 <= plat <= 90 and -180 <= plon <= 180:
                clean.append((plat, plon))
        for a, b in zip(clean, clean[1:]):
            segments.append((a[0], a[1], b[0], b[1], name, highway, str(el.get("id") or "")))
    with _ALERT_ROAD_SEGMENT_LOCK:
        _ALERT_ROAD_SEGMENT_CACHE[key] = (now, segments)
        if len(_ALERT_ROAD_SEGMENT_CACHE) > 900:
            for stale_key, _ in sorted(_ALERT_ROAD_SEGMENT_CACHE.items(), key=lambda kv: kv[1][0])[:180]:
                _ALERT_ROAD_SEGMENT_CACHE.pop(stale_key, None)
    return segments

def _project_point_to_road_segment(lat, lon, segment):
    alat, alon, blat, blon, name, highway, way_id = segment
    scale_x = 111320.0 * max(0.2, math.cos(math.radians(float(lat))))
    scale_y = 110540.0
    ax, ay = (alon - lon) * scale_x, (alat - lat) * scale_y
    bx, by = (blon - lon) * scale_x, (blat - lat) * scale_y
    vx, vy = bx - ax, by - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom <= 1e-9 else max(0.0, min(1.0, -(ax * vx + ay * vy) / denom))
    px, py = ax + t * vx, ay + t * vy
    return {
        "lat": float(lat) + py / scale_y,
        "lon": float(lon) + px / scale_x,
        "distance_m": float(math.hypot(px, py)),
        "road_name": name, "highway": highway, "osm_way_id": way_id,
    }

def snap_alert_to_nearest_road(lat, lon, *, max_radius=1200):
    try:
        lat, lon = float(lat), float(lon)
    except Exception:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    best = None
    seen = set()
    for radius in [180, 420, 850, max(850, min(1200, int(max_radius or 1200)))]:
        if radius in seen:
            continue
        seen.add(radius)
        for seg in _alert_road_segments(lat, lon, radius):
            hit = _project_point_to_road_segment(lat, lon, seg)
            if best is None or hit["distance_m"] < best["distance_m"]:
                best = hit
        if best is not None and best["distance_m"] <= min(95.0, radius * 0.55):
            break
    if best is None or best["distance_m"] > float(max_radius):
        return None
    best["source"] = "openstreetmap-road-snap"
    return best

def _row_value(row, key, default=None):
    try:
        return row[key]
    except Exception:
        try:
            return row.get(key, default)
        except Exception:
            return default

def _resnap_visible_report_rows(rows, limit=8):
    db = get_db()
    updates = {}
    changed = 0
    for row in rows:
        if changed >= max(0, int(limit or 0)):
            break
        try:
            if int(_row_value(row, "road_snapped", 0) or 0) == 1:
                continue
            rid = int(row["id"]); lat = float(row["latitude"]); lon = float(row["longitude"])
        except Exception:
            continue
        hit = snap_alert_to_nearest_road(lat, lon)
        if not hit:
            continue
        db.execute("UPDATE reports SET latitude=?,longitude=?,road_snapped=1,snap_distance_m=?,road_name=? WHERE id=?",
                   (hit["lat"], hit["lon"], round(hit["distance_m"], 1), hit.get("road_name") or "", rid))
        updates[rid] = hit
        changed += 1
    if changed:
        db.commit(); invalidate_route_context("reports")
    return updates



# -----------------------------------------------------------------------------
# V164 — Event Pressure Engine
# -----------------------------------------------------------------------------
_EVENT_VENUE_CACHE = {}
_EVENT_VENUE_CACHE_LOCK = threading.Lock()
_EVENT_VENUE_CACHE_TTL = 12 * 60
_EVENT_FEED_CACHE = {"ts": 0.0, "items": []}
_EVENT_FEED_LOCK = threading.Lock()
_MATCH_SCHEDULE_CACHE = {"ts": 0.0, "items": []}
_MATCH_SCHEDULE_LOCK = threading.Lock()


def _event_bounds_from_geometry(coords, pad=.014):
    clean = [(float(c[0]), float(c[1])) for c in (coords or []) if len(c) >= 2]
    if not clean:
        return None
    lons = [x[0] for x in clean]; lats = [x[1] for x in clean]
    return min(lats)-pad, min(lons)-pad, max(lats)+pad, max(lons)+pad


def _event_bounds_key(bounds):
    if not bounds:
        return None
    a,b,c,d = bounds
    return tuple(round(float(x), 2) for x in (a,b,c,d))


def _event_element_center(el):
    try:
        lat = el.get("lat"); lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        lat, lon = float(lat), float(lon)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
    except Exception:
        pass
    return None


def event_venues_for_bounds(bounds):
    """Discover large places where games/shows can materially change traffic.

    This is venue discovery, not an assertion that an event is happening. A venue
    only becomes an active disruption when live traffic, recent crowd/road reports
    or an optional configured event feed corroborates it.
    """
    if not RAIRO_EVENT_INTELLIGENCE_ENABLED or not bounds:
        return []
    min_lat,min_lon,max_lat,max_lon = [float(x) for x in bounds]
    if max_lat <= min_lat or max_lon <= min_lon:
        return []
    if max_lat-min_lat > .85 or max_lon-min_lon > .85:
        return []
    key = _event_bounds_key(bounds); now = time.time()
    with _EVENT_VENUE_CACHE_LOCK:
        row = _EVENT_VENUE_CACHE.get(key)
        if row and now-row[0] < _EVENT_VENUE_CACHE_TTL:
            return copy.deepcopy(row[1])
    bbox=f"{min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f}"
    q=f"""[out:json][timeout:7];
(
  nwr({bbox})[\"leisure\"=\"stadium\"];
  nwr({bbox})[\"building\"=\"stadium\"];
  nwr({bbox})[\"amenity\"=\"events_venue\"];
  nwr({bbox})[\"amenity\"=\"concert_hall\"];
  nwr({bbox})[\"amenity\"=\"exhibition_centre\"];
  nwr({bbox})[\"amenity\"=\"conference_centre\"];
  nwr({bbox})[\"leisure\"=\"sports_centre\"][\"capacity\"];
);
out center tags qt;"""
    elements = (_overpass_query_json(q, timeout=7).get("elements") or [])[:220]
    venues=[]; seen=set()
    for el in elements:
        center=_event_element_center(el)
        if not center: continue
        lat,lon=center; tags=el.get("tags") or {}
        name=str(tags.get("name") or tags.get("official_name") or "Local de evento").strip()[:140]
        kind=(str(tags.get("leisure") or tags.get("amenity") or tags.get("building") or "event_venue").strip().lower())
        try: capacity=int(re.sub(r"[^0-9]", "", str(tags.get("capacity") or "0")) or 0)
        except Exception: capacity=0
        if kind == "sports_centre" and capacity and capacity < 1800: continue
        k=(round(lat,5),round(lon,5),name.lower())
        if k in seen: continue
        seen.add(k)
        base_radius = 720 if kind in {"stadium","events_venue"} else 620
        if capacity >= 30000: base_radius=1250
        elif capacity >= 12000: base_radius=1000
        elif capacity >= 5000: base_radius=850
        venues.append({"name":name,"lat":lat,"lon":lon,"kind":kind,"capacity":capacity,"radius_m":base_radius,"source":"openstreetmap"})
    venues.sort(key=lambda x:(-int(x.get("capacity") or 0), x["name"]))
    with _EVENT_VENUE_CACHE_LOCK:
        _EVENT_VENUE_CACHE[key]=(now,copy.deepcopy(venues[:80]))
        if len(_EVENT_VENUE_CACHE)>160:
            for old,_ in sorted(_EVENT_VENUE_CACHE.items(),key=lambda kv:kv[1][0])[:40]: _EVENT_VENUE_CACHE.pop(old,None)
    return venues[:80]



def _event_norm_name(value):
    value=unicodedata.normalize("NFKD",str(value or "")).encode("ascii","ignore").decode("ascii").lower()
    value=re.sub(r"\b(estadio|arena|stadium|estadium|estadio municipal|estadio estadual|do|da|de|the)\b"," ",value)
    return re.sub(r"[^a-z0-9]+"," ",value).strip()


def _scheduled_match_events():
    """Best-effort football schedule signal using ESPN's public site scoreboard.

    The endpoint is undocumented, so this source is never required for routing.
    Traffic/reports remain the fallback source of truth if the schema or service
    changes. Results are cached to avoid polling sports endpoints per route.
    """
    if not RAIGO_ESPN_MATCH_FEED_ENABLED or not RAIGO_ESPN_SOCCER_LEAGUES:
        return []
    now=time.time()
    with _MATCH_SCHEDULE_LOCK:
        if now-float(_MATCH_SCHEDULE_CACHE.get("ts") or 0)<8*60:
            return copy.deepcopy(_MATCH_SCHEDULE_CACHE.get("items") or [])
    dt=datetime.now(timezone.utc);start=(dt-timedelta(days=1)).strftime("%Y%m%d");end=(dt+timedelta(days=1)).strftime("%Y%m%d")
    def fetch(league):
        url=f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard"
        try:
            r=requests.get(url,params={"dates":f"{start}-{end}"},headers={"User-Agent":"VANO MAPS/164 event-intelligence"},timeout=4.5);r.raise_for_status();data=r.json() or {}
        except Exception:return []
        out=[]
        for ev in (data.get("events") or [])[:80]:
            comps=ev.get("competitions") or []
            if not comps:continue
            comp=comps[0] or {};venue=comp.get("venue") or {};venue_name=str(venue.get("fullName") or "").strip()
            if not venue_name:continue
            start_dt=parse_iso(ev.get("date") or comp.get("date"));
            if not start_dt:continue
            # Soccer road pressure: roughly 3 h before kickoff through 3 h after a
            # normal match; the live-traffic signal can keep it active longer.
            if not (start_dt-timedelta(hours=3)<=datetime.now(timezone.utc)<=start_dt+timedelta(hours=5)):continue
            status=((comp.get("status") or {}).get("type") or {})
            out.append({"event_name":str(ev.get("name") or ev.get("shortName") or "Jogo").strip()[:160],"venue_name":venue_name[:140],"venue_norm":_event_norm_name(venue_name),"start":start_dt.isoformat(),"league":league,"status":str(status.get("name") or status.get("description") or "")[:80],"source":"espn-scoreboard"})
        return out
    items=[]
    with ThreadPoolExecutor(max_workers=min(3,len(RAIGO_ESPN_SOCCER_LEAGUES))) as pool:
        for rows in pool.map(fetch,RAIGO_ESPN_SOCCER_LEAGUES):items.extend(rows)
    # same match can appear in national and continental schedule windows
    dedup={}
    for item in items:
        key=(item["venue_norm"],item["start"],_event_norm_name(item["event_name"]))
        dedup[key]=item
    items=list(dedup.values())[:180]
    with _MATCH_SCHEDULE_LOCK:
        _MATCH_SCHEDULE_CACHE["ts"]=now;_MATCH_SCHEDULE_CACHE["items"]=copy.deepcopy(items)
    return items


def _scheduled_event_for_venue(venue, schedule):
    vn=_event_norm_name(venue.get("name"));
    if not vn:return None
    best=None;best_score=0.0
    for ev in schedule or []:
        en=ev.get("venue_norm") or _event_norm_name(ev.get("venue_name"));
        if not en:continue
        if vn in en or en in vn:score=.96
        else:score=difflib.SequenceMatcher(None,vn,en).ratio()
        if score>best_score:best_score=score;best=ev
    return best if best is not None and best_score>=.66 else None


def _event_feed_items():
    if not RAIGO_EVENT_FEED_URLS:
        return []
    now=time.time()
    with _EVENT_FEED_LOCK:
        if now-float(_EVENT_FEED_CACHE.get("ts") or 0)<180:
            return copy.deepcopy(_EVENT_FEED_CACHE.get("items") or [])
    items=[]
    for url in RAIGO_EVENT_FEED_URLS:
        try:
            r=requests.get(url,headers={"User-Agent":"VANO MAPS/164 event-intelligence"},timeout=4)
            r.raise_for_status(); data=r.json()
            rows=data if isinstance(data,list) else (data.get("events") or data.get("items") or data.get("data") or []) if isinstance(data,dict) else []
            for raw in rows[:500]:
                if not isinstance(raw,dict): continue
                try:
                    lat=float(raw.get("lat",raw.get("latitude"))); lon=float(raw.get("lon",raw.get("lng",raw.get("longitude"))))
                except Exception: continue
                start=parse_iso(raw.get("start") or raw.get("start_at") or raw.get("starts_at") or raw.get("start_time"))
                end=parse_iso(raw.get("end") or raw.get("end_at") or raw.get("ends_at") or raw.get("end_time"))
                if not start: continue
                if not end: end=start+timedelta(hours=4)
                now_dt=datetime.now(timezone.utc)
                active=(start-timedelta(hours=2,minutes=15))<=now_dt<=(end+timedelta(hours=1,minutes=45))
                if not active: continue
                items.append({"name":str(raw.get("name") or raw.get("title") or "Evento").strip()[:140],"lat":lat,"lon":lon,"start":start.isoformat(),"end":end.isoformat(),"radius_m":int(clamp(float(raw.get("radius_m") or 1100),400,2500)),"source":str(raw.get("source") or "event-feed")[:80],"confirmed":True})
        except Exception as exc:
            app.logger.debug("Event feed unavailable: %s", type(exc).__name__)
    with _EVENT_FEED_LOCK:
        _EVENT_FEED_CACHE["ts"]=now;_EVENT_FEED_CACHE["items"]=copy.deepcopy(items[:300])
    return items[:300]


def _event_reports_near(reports, lat, lon, radius=1300):
    now=datetime.now(timezone.utc); out=[]
    for row in (reports or []):
        category=str((row.get("category") if isinstance(row,dict) else row["category"]) or "").lower()
        if category not in {"crowd","traffic","road_block","construction","accident"}: continue
        try:
            rlat=float(row.get("latitude") if isinstance(row,dict) else row["latitude"]); rlon=float(row.get("longitude") if isinstance(row,dict) else row["longitude"])
        except Exception: continue
        d=haversine_m(lat,lon,rlat,rlon)
        if d>radius: continue
        created=parse_iso(row.get("created_at") if isinstance(row,dict) else row["created_at"]) or now
        age_h=max(0,(now-created).total_seconds()/3600)
        if age_h>8 and category in {"crowd","traffic"}: continue
        if age_h>24 and category in {"road_block","construction","accident"}: continue
        out.append({"category":category,"distance_m":round(d),"severity":int((row.get("severity") if isinstance(row,dict) else row["severity"]) or 1),"confirmations":int((row.get("confirmations") if isinstance(row,dict) else row["confirmations"]) or 0),"age_h":age_h})
    return out


def _event_traffic_near(route, venue):
    traffic=route_traffic_metrics(route); best=0.0; congested_m=0.0; avoid=[]; nearest=10**9
    vlat,vlon=float(venue["lat"]),float(venue["lon"])
    for seg in (traffic.get("traffic_segments") or []):
        coords=seg.get("coordinates") or []
        if len(coords)<2: continue
        d=min_distance_to_geometry_m(vlat,vlon,coords); nearest=min(nearest,d)
        if d>1500: continue
        proximity=clamp(1.0-d/1700.0,.08,1.0); score=float(seg.get("score") or 0)
        best=max(best,score*(.72+.28*proximity))
        seg_len=max(0,float(seg.get("distance_end_m") or 0)-float(seg.get("distance_start_m") or 0))
        if score>=58:
            congested_m += seg_len*proximity
            mid=coords[len(coords)//2]
            if len(mid)>=2 and d<=1050 and all(haversine_m(float(mid[1]),float(mid[0]),p[1],p[0])>140 for p in avoid):
                avoid.append([float(mid[0]),float(mid[1])])
    for p in (traffic.get("traffic_points") or []):
        try:
            if haversine_m(vlat,vlon,float(p[1]),float(p[0]))<=1250 and all(haversine_m(float(p[1]),float(p[0]),q[1],q[0])>140 for q in avoid): avoid.append([float(p[0]),float(p[1])])
        except Exception: pass
    return {"score":round(best,1),"congested_m":round(congested_m),"avoid_points":avoid[:5],"nearest_traffic_m":round(nearest) if nearest<10**8 else None,"traffic":traffic}


def route_event_disruptions(route, start_lat, start_lon, end_lat, end_lon, reports=None, venues=None):
    """Return corroborated event-pressure zones touching a route corridor."""
    if not RAIRO_EVENT_INTELLIGENCE_ENABLED or not route:
        return []
    coords=((route.get("geometry") or {}).get("coordinates") or [])
    if len(coords)<2: return []
    bounds=_event_bounds_from_geometry(coords,.016)
    if not bounds: return []
    if venues is None:
        venues=event_venues_for_bounds(bounds)
    feed=_event_feed_items();schedule=_scheduled_match_events()
    combined=[dict(x) for x in venues]
    for ev in feed:
        if not (bounds[0]-.02<=ev["lat"]<=bounds[2]+.02 and bounds[1]-.02<=ev["lon"]<=bounds[3]+.02): continue
        match=None
        for v in combined:
            if haversine_m(ev["lat"],ev["lon"],v["lat"],v["lon"])<=850:
                match=v;break
        if match:
            match["confirmed_event"]=True;match["event_name"]=ev["name"];match["event_start"]=ev.get("start");match["event_end"]=ev.get("end");match["radius_m"]=max(float(match.get("radius_m") or 700),float(ev.get("radius_m") or 1100));match["event_source"]=ev.get("source")
        else:
            combined.append({"name":ev["name"],"lat":ev["lat"],"lon":ev["lon"],"kind":"scheduled_event","capacity":0,"radius_m":ev.get("radius_m",1100),"source":ev.get("source","event-feed"),"confirmed_event":True,"event_name":ev["name"],"event_start":ev.get("start"),"event_end":ev.get("end")})
    out=[]
    for venue in combined[:100]:
        vlat,vlon=float(venue["lat"]),float(venue["lon"]); base_radius=float(clamp(float(venue.get("radius_m") or 720),420,1800))
        droute=min_distance_to_geometry_m(vlat,vlon,coords)
        if droute>max(1450,base_radius+500): continue
        start_d=haversine_m(start_lat,start_lon,vlat,vlon); end_d=haversine_m(end_lat,end_lon,vlat,vlon)
        destination_related=end_d<=base_radius+330; origin_related=start_d<=base_radius+260
        scheduled=_scheduled_event_for_venue(venue,schedule)
        if scheduled:
            venue["confirmed_event"]=True;venue["event_name"]=scheduled.get("event_name") or venue.get("name");venue["event_start"]=scheduled.get("start");venue["event_source"]=scheduled.get("source");venue["scheduled_match"]=True
        signal=_event_traffic_near(route,venue); nearby_reports=_event_reports_near(reports or [],vlat,vlon,max(1300,base_radius+400))
        report_score=0.0
        for rep in nearby_reports:
            base={"crowd":30,"traffic":22,"road_block":34,"construction":26,"accident":24}.get(rep["category"],15)
            report_score=max(report_score,base+rep["severity"]*5+min(15,rep["confirmations"]*3)-min(15,rep["age_h"]*2))
        confirmed=bool(venue.get("confirmed_event")); score=max(float(signal["score"]),report_score,82.0 if confirmed else 0.0)
        active=bool(confirmed or score>=58 or (float(signal["score"])>=48 and signal["congested_m"]>=500))
        if not active: continue
        radius=base_radius
        if score>=82: radius=max(radius,1200)
        elif score>=70: radius=max(radius,950)
        expected=int(clamp(80+(max(0,score-50)*8.0)+(signal["congested_m"]/12.0)+(140 if any(r["category"]=="road_block" for r in nearby_reports) else 0),90,900))
        avoid=list(signal["avoid_points"])
        if not avoid:
            ring=min(430,max(240,radius*.36)); dlat=ring/110540.0; dlon=ring/(111320.0*max(.22,math.cos(math.radians(vlat))))
            avoid=[[vlon,vlat],[vlon+dlon,vlat],[vlon-dlon,vlat],[vlon,vlat+dlat],[vlon,vlat-dlat]]
        out.append({"name":str(venue.get("event_name") or venue.get("name") or "Área de evento")[:140],"venue_name":str(venue.get("name") or venue.get("event_name") or "Área de evento")[:140],"lat":vlat,"lon":vlon,"kind":venue.get("kind") or "event_venue","source":venue.get("event_source") or venue.get("source") or "event-pressure","confirmed_event":confirmed,"scheduled_match":bool(venue.get("scheduled_match")),"event_start":venue.get("event_start"),"event_end":venue.get("event_end"),"pressure_score":round(score,1),"radius_m":round(radius),"distance_to_route_m":round(droute),"expected_delay_s":expected,"destination_related":bool(destination_related),"origin_related":bool(origin_related),"traffic_score_nearby":signal["score"],"congested_nearby_m":signal["congested_m"],"reports_nearby":nearby_reports[:6],"avoid_points":avoid[:6]})
    out.sort(key=lambda x:(x["destination_related"],-x["pressure_score"],x["distance_to_route_m"]))
    return out[:6]


def event_exposure_for_route(route, disruptions):
    coords=((route or {}).get("geometry") or {}).get("coordinates") or []
    if len(coords)<2:return {"penalty_s":0,"hits":[]}
    hits=[]; penalty=0
    for ev in disruptions or []:
        if ev.get("destination_related") or ev.get("origin_related"): continue
        d=min_distance_to_geometry_m(float(ev["lat"]),float(ev["lon"]),coords); radius=float(ev.get("radius_m") or 900)
        if d<=radius:
            factor=clamp(1.0-d/max(radius,1),.25,1.0); p=int(float(ev.get("expected_delay_s") or 120)*factor)
            penalty+=p;hits.append({"name":ev.get("name"),"distance_m":round(d),"penalty_s":p,"pressure_score":ev.get("pressure_score")})
    return {"penalty_s":int(clamp(penalty,0,1200)),"hits":hits[:5]}


def build_event_bypass_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,disruptions,depart_at="now",start_bearing=None,start_speed=None,reroute=False,extra_excludes=None):
    active=[x for x in (disruptions or []) if not x.get("destination_related") and not x.get("origin_related")]
    if not active:return []
    points=[];names=[]
    for ev in active[:2]:
        names.append(ev.get("name") or "evento")
        for pt in ev.get("avoid_points") or [[ev["lon"],ev["lat"]]]:
            if all(haversine_m(float(pt[1]),float(pt[0]),q[1],q[0])>110 for q in points):points.append([float(pt[0]),float(pt[1])])
            if len(points)>=12:break
        if len(points)>=12:break
    try:
        found=mapbox_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,depart_at,exclusions=points[:12],alternatives=True,extra_excludes=extra_excludes,start_bearing=start_bearing,start_speed=start_speed,reroute=reroute)
    except Exception:
        return []
    out=[]
    for raw in found[:4]:
        raw["_event_variant"]=True;raw["_event_avoided_points"]=len(points);raw["_event_avoid_names"]=names[:2];raw["_event_pressure_score"]=max(float(x.get("pressure_score") or 0) for x in active)
        out.append(raw)
    return out


def event_candidate_payload(raw, idx, travel_profile, local_hour, user_nav, mode, disruptions):
    bounds=_event_bounds_from_geometry(((raw.get("geometry") or {}).get("coordinates") or []),.012)
    if bounds:
        reports=get_active_reports_for_bounds(*bounds);zones=get_risk_zones_for_bounds(*bounds)
    else: reports=[];zones=[]
    risk=route_risk_metrics(raw,reports,zones,local_hour,travel_profile);traffic=route_traffic_metrics(raw);flow=route_live_flow_metrics(raw);road=route_road_controls(raw)
    professional=professional_route_assessment(raw,risk,road) if user_nav.get("professional_driver") else {"professional_ok":True,"professional_flags":[],"exclusion_violations":[]}
    exposure=event_exposure_for_route(raw,disruptions)
    item={"id":idx,"distance":raw.get("distance",0),"duration":raw.get("duration",0),"duration_min":round(float(raw.get("duration",0))/60,1),"geometry":raw.get("geometry"),"steps":compact_steps(raw),"profile":travel_profile,"event_variant":bool(raw.get("_event_variant")),"event_avoided_points":int(raw.get("_event_avoided_points",0) or 0),"event_avoid_names":raw.get("_event_avoid_names") or [],"event_pressure_score":round(float(raw.get("_event_pressure_score") or 0),1),"event_disruptions":[{k:v for k,v in ev.items() if k!="avoid_points"} for ev in disruptions[:5]],"event_exposure_penalty_s":exposure["penalty_s"],"event_exposure_hits":exposure["hits"],"micro_route":bool(raw.get("_micro_route")),"micro_avoided_points":int(raw.get("_micro_avoided_points",0) or 0),"micro_strategy":raw.get("_micro_strategy") or "","micro_streets":raw.get("_micro_streets") or [],"micro_traffic_relief":round(float(raw.get("_micro_traffic_relief") or 0),1),"routing_profile_used":raw.get("_profile_used","driving-traffic"),"routing_provider":raw.get("_provider","mapbox"),"route_signature":route_signature(raw),"badges":[],**risk,**{k:v for k,v in traffic.items() if k!="traffic_points"},**flow,**road,**professional}
    apply_route_intelligence([item],travel_profile,safety_bias=74 if mode!="fastest" else 60,traffic_bias=88)
    if mode=="fastest":item["fast_eta_only"]=True;item["badges"]=["fastest"]
    elif mode=="safest":item["badges"]=["safest"]
    else:item["badges"]=["smart"]
    return item


def _mapbox_nearby_pois(queries, lat, lon, radius, limit=10):
    """Fallback de POIs usando o Search Box já configurado no VANO MAPS."""
    if not mapbox_ready():
        return []
    proximity = (float(lon), float(lat))
    radius = max(500, float(radius))
    found, seen = [], set()
    for query in queries:
        try:
            results = mapbox_searchbox_forward(query, proximity=proximity, language=preferred_language())
        except Exception:
            continue
        for item in results:
            try:
                plat, plon = float(item["lat"]), float(item["lon"])
                distance = float(item.get("distance_m") or haversine_m(float(lat), float(lon), plat, plon))
            except Exception:
                continue
            if distance > radius * 1.35:
                continue
            key = (round(plat, 5), round(plon, 5), _search_normalize(item.get("name") or item.get("label") or ""))
            if key in seen:
                continue
            seen.add(key)
            copy_item = dict(item)
            copy_item["distance_m"] = round(distance)
            copy_item["query_hint"] = query
            found.append(copy_item)
    found.sort(key=lambda x: float(x.get("distance_m") or 1e12))
    return found[:limit]


def overpass_support_points(lat, lon, radius=1800):
    """Busca pontos de apoio próximos em dados OSM, sem rotulá-los como "seguros".

    São locais potencialmente úteis em uma parada (polícia, hospital, farmácia,
    bombeiros, posto e conveniência). A disponibilidade depende do mapeamento.
    """
    radius = int(clamp(radius, 500, 4000))
    cache_key = (round(float(lat), 3), round(float(lon), 3), int(radius / 250) * 250)
    now = time.time()
    with SAFE_STOPS_LOCK:
        cached = SAFE_STOPS_CACHE.get(cache_key)
        if cached and now - cached[0] < 300:
            return cached[1]
    query = f"""[out:json][timeout:9];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"~"^(police|hospital|clinic|pharmacy|fire_station|fuel)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["shop"="convenience"];
);
out center 80;"""
    data = _overpass_query_json(query, timeout=8)

    labels = {
        "police": ("police", "Polícia", 0),
        "fire_station": ("fire_station", "Bombeiros", 1),
        "hospital": ("hospital", "Hospital", 2),
        "clinic": ("clinic", "Clínica", 3),
        "pharmacy": ("pharmacy", "Farmácia", 4),
        "fuel": ("fuel", "Posto", 5),
        "convenience": ("convenience", "Conveniência", 6),
    }
    items, seen = [], set()
    for el in data.get("elements", []) or []:
        tags = el.get("tags") or {}
        lat_v = el.get("lat")
        lon_v = el.get("lon")
        if lat_v is None or lon_v is None:
            center = el.get("center") or {}
            lat_v, lon_v = center.get("lat"), center.get("lon")
        if lat_v is None or lon_v is None:
            continue
        amenity = tags.get("amenity") or ("convenience" if tags.get("shop") == "convenience" else "")
        if amenity not in labels:
            continue
        kind, generic_label, priority = labels[amenity]
        key = (kind, round(float(lat_v), 5), round(float(lon_v), 5))
        if key in seen:
            continue
        seen.add(key)
        distance = haversine_m(float(lat), float(lon), float(lat_v), float(lon_v))
        name = str(tags.get("name") or tags.get("brand") or generic_label)[:120]
        items.append({
            "id": f"{el.get('type','n')}-{el.get('id','')}",
            "type": kind, "label": generic_label, "name": name,
            "lat": float(lat_v), "lon": float(lon_v), "distance_m": round(distance),
            "priority": priority, "opening_hours": str(tags.get("opening_hours") or "")[:100],
            "source": "openstreetmap",
        })
    if len(items) < 3:
        fallback_terms = ["hospital", "farmácia", "delegacia de polícia", "posto de combustível", "clínica"]
        type_by_term = {
            "hospital": ("hospital", "Hospital", 2),
            "farmácia": ("pharmacy", "Farmácia", 4),
            "delegacia de polícia": ("police", "Polícia", 0),
            "posto de combustível": ("fuel", "Posto", 5),
            "clínica": ("clinic", "Clínica", 3),
        }
        for poi in _mapbox_nearby_pois(fallback_terms, lat, lon, radius, limit=12):
            kind, generic_label, priority = type_by_term.get(poi.get("query_hint"), ("support", "Ponto de apoio", 7))
            key = (kind, round(float(poi["lat"]), 5), round(float(poi["lon"]), 5))
            if key in seen:
                continue
            seen.add(key)
            items.append({
                "id": f"mapbox-{poi.get('mapbox_id') or len(items)}",
                "type": kind, "label": generic_label,
                "name": str(poi.get("name") or generic_label)[:120],
                "lat": float(poi["lat"]), "lon": float(poi["lon"]),
                "distance_m": round(float(poi.get("distance_m") or 0)),
                "priority": priority, "opening_hours": "", "source": "mapbox-searchbox",
            })
    items.sort(key=lambda x: (x["priority"], x["distance_m"]))
    # Garante diversidade: primeiro um exemplar próximo de cada tipo e depois completa.
    diverse, used = [], set()
    for item in items:
        if item["type"] not in used:
            diverse.append(item); used.add(item["type"])
        if len(diverse) >= 8:
            break
    if len(diverse) < 8:
        used_ids = {x["id"] for x in diverse}
        diverse.extend(x for x in sorted(items, key=lambda x: x["distance_m"]) if x["id"] not in used_ids)
    result = diverse[:8]
    with SAFE_STOPS_LOCK:
        SAFE_STOPS_CACHE[cache_key] = (now, result)
        if len(SAFE_STOPS_CACHE) > 400:
            stale = sorted(SAFE_STOPS_CACHE.items(), key=lambda kv: kv[1][0])[:100]
            for key, _ in stale:
                SAFE_STOPS_CACHE.pop(key, None)
    return result


# -----------------------------
# Embed / deployment diagnostics
# -----------------------------

@app.route("/healthz")
def healthz():
    """Render readiness check without calling third-party services.

    The previous health check returned 200 even while `/` crashed because a
    critical helper was missing. This now validates PostgreSQL, the home template
    and provider configuration helpers so Render can reject a broken deploy.
    """
    try:
        get_db().execute("SELECT 1").fetchone()
        get_db().execute("SELECT COUNT(*) FROM auth_sessions").fetchone()
        app.jinja_env.get_template("index.html")
        providers = {
            "mapbox_configured": mapbox_ready(),
            "google_configured": google_ready(),
        }
    except Exception as exc:
        app.logger.exception("healthz readiness failure")
        return jsonify({"ok": False, "service": "vano", "error": type(exc).__name__}), 503
    return jsonify({"ok": True, "service": "vano", "embed": True, **providers}), 200


@app.route("/api/keepalive", methods=["GET", "POST"])
def keepalive_probe():
    """Extremely lightweight GET/POST target used by the backend keep-alive worker."""
    return jsonify({"ok": True, "service": "vano", "ts": int(time.time())}), 200


@app.get("/.well-known/assetlinks.json")
def android_asset_links():
    """Digital Asset Links for the VANO MAPS Trusted Web Activity."""
    payload = [{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "com.vano.maps",
            "sha256_cert_fingerprints": [
                "3E:F0:11:85:08:60:D0:AE:62:9E:8D:93:FB:74:9D:70:6A:3E:C5:0E:DC:38:69:71:C4:A6:13:7A:A3:50:63:46",
                "65:D1:8D:53:B2:5B:D5:D6:0C:CF:59:E0:DC:36:18:1D:2D:19:15:D3:07:69:E7:52:68:B7:CD:94:21:F4:BC:88",
            ],
        },
    }]
    response = app.response_class(
        json.dumps(payload, separators=(",", ":")),
        mimetype="application/json",
    )
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.get("/manifest.webmanifest")
def web_app_manifest():
    response = app.send_static_file("manifest.webmanifest")
    response.headers["Content-Type"] = "application/manifest+json; charset=utf-8"
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.route("/vano-sw.js")
@app.route("/vienna-sw.js")
def raigo_service_worker():
    # /vienna-sw.js remains as a compatibility alias for already-installed clients.
    response = app.send_static_file("vano-sw-v300.js")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["X-VANO-Build"] = VANO_BUILD_ID
    return response


@app.route("/frame-test")
def frame_test():
    """Minimal page used to verify that the reverse proxy is not blocking frames."""
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1119;color:#fff;font:16px system-ui}.box{padding:28px;border:1px solid #24466f;border-radius:18px;background:#101b29;text-align:center}.ok{color:#67e0a6;font-weight:800}</style></head><body><div class='box'><div class='ok'>IFRAME LIBERADO</div><p>Esta resposta veio do Flask.</p></div><script>if(parent!==window)parent.postMessage({type:'vano:frame-test',ok:true},'*');</script></body></html>"""


@app.route("/embed")
def embed_entry():
    """Stable entry point specifically for embedding inside Vértice Web."""
    if current_user():
        return redirect(url_for("map_page"))
    return index()


# -----------------------------
# Pages
# -----------------------------

@app.route("/")
def index():
    # V91 — keep the product entry path lean. The old page counted users and
    # active reports on every visit even though the map no longer renders those
    # values. Avoid that PostgreSQL round-trip and render immediately.
    user = current_user()
    map_style_pref = (user["map_style"] if user and "map_style" in user.keys() else "auto") or "auto"
    # Normalize legacy values without destroying the user's new explicit choice.
    if map_style_pref in {"rairo", "vivid"}:
        map_style_pref = "auto"
    elif map_style_pref in {"standard", "streets"}:
        map_style_pref = "day"
    if map_style_pref not in {"auto", "day", "afternoon", "night", "rain"}:
        map_style_pref = "auto"
    style_lookup = {
        "day": MAPBOX_STYLE_DAY, "afternoon": MAPBOX_STYLE_AFTERNOON,
        "night": MAPBOX_STYLE_NIGHT, "rain": MAPBOX_STYLE_RAIN,
    }
    selected_map_style = style_lookup.get(map_style_pref, MAPBOX_STYLE_DAY)
    map_accent_pref = (user["map_accent"] if user and "map_accent" in user.keys() else "violet") or "violet"
    if map_accent_pref not in MAPBOX_ACCENT_PRESETS:
        map_accent_pref = "violet"
    return render_template(
        "index.html",
        mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "",
        mapbox_style=selected_map_style,
        mapbox_styles={
            "day": MAPBOX_STYLE_DAY,
            "afternoon": MAPBOX_STYLE_AFTERNOON,
            "night": MAPBOX_STYLE_NIGHT,
            "black": MAPBOX_STYLE_BLACK,
            "rain": MAPBOX_STYLE_RAIN,
        },
        map_style_mode=map_style_pref,
        map_accent=map_accent_pref,
        map_accent_colors=MAPBOX_ACCENT_PRESETS[map_accent_pref],
        nav_preferences={
            "avoid_ferries": bool(user and user["avoid_ferries"]),
            "avoid_tolls": bool(user and user["avoid_tolls"]),
            "avoid_unpaved": bool(user and user["avoid_unpaved"]),
        },
        mapbox_ready=mapbox_ready(),
        categories=CATEGORY_META,
        guest_route_limit=GUEST_ROUTE_LIMIT,
        guest_routes_remaining=guest_routes_remaining(),
    )



def _password_reset_email(to_email, reset_url):
    """Send a reset link when SMTP is configured; fail closed without leaking account state."""
    if not (SMTP_HOST and SMTP_FROM):
        app.logger.warning("Password reset requested but SMTP is not configured")
        return False
    msg = EmailMessage()
    msg["Subject"] = "Redefinir sua senha do VANO MAPS"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        "Recebemos um pedido para redefinir sua senha do VANO MAPS.\n\n"
        f"Abra este link (válido por 30 minutos):\n{reset_url}\n\n"
        "Se você não pediu essa alteração, ignore esta mensagem."
    )
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=8) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:
        app.logger.exception("Could not send password reset e-mail")
        return False


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("forgot-password", 5, 900):
            flash("Muitos pedidos em pouco tempo. Aguarde alguns minutos.", "danger")
            return render_template("forgot_password.html"), 429
        email = request.form.get("email", "").strip().lower()
        # Always show the same answer so this endpoint cannot enumerate accounts.
        if EMAIL_RE.match(email) and len(email) <= 180:
            user = get_db().execute("SELECT id,email,is_active FROM users WHERE email=?", (email,)).fetchone()
            if user and user["is_active"]:
                raw_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
                now = datetime.now(timezone.utc)
                expires = (now + timedelta(minutes=30)).replace(microsecond=0).isoformat()
                db = get_db()
                db.execute("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL", (now.replace(microsecond=0).isoformat(), user["id"]))
                db.execute(
                    "INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at,used_at) VALUES(?,?,?,?,NULL)",
                    (user["id"], token_hash, now.replace(microsecond=0).isoformat(), expires),
                )
                db.commit()
                public_origin = PUBLIC_SITE_URL or request.host_url.rstrip("/")
                reset_url = f"{public_origin}{url_for('reset_password', token=raw_token)}"
                _password_reset_email(user["email"], reset_url)
                audit("password_reset_requested", {}, user["id"])
        flash("Se existir uma conta com esse e-mail, enviaremos um link de redefinição.", "success")
        return redirect(url_for("forgot_password"))
    return render_template("forgot_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{30,100}", token or ""):
        abort(404)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = get_db().execute(
        "SELECT prt.*,u.email,u.is_active FROM password_reset_tokens prt JOIN users u ON u.id=prt.user_id WHERE prt.token_hash=?",
        (token_hash,),
    ).fetchone()
    valid = False
    if row and row["used_at"] is None and row["is_active"]:
        expires = parse_iso(row["expires_at"])
        valid = bool(expires and expires > datetime.now(timezone.utc))
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not valid:
            flash("Esse link expirou ou já foi utilizado.", "danger")
            return redirect(url_for("forgot_password"))
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        valid_password, password_error = validate_password_strength(password)
        if password != confirm:
            valid_password, password_error = False, "As senhas digitadas não são iguais."
        if not valid_password:
            flash(password_error, "danger")
            return render_template("reset_password.html", reset_valid=True), 400
        db = get_db()
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(password), row["user_id"]))
        db.execute("UPDATE password_reset_tokens SET used_at=? WHERE id=?", (utcnow_iso(), row["id"]))
        db.execute("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (utcnow_iso(), row["user_id"]))
        db.commit()
        audit("password_reset_completed", {}, row["user_id"])
        flash("Senha atualizada. Entre novamente.", "success")
        return redirect(url_for("login"))
    return render_template("reset_password.html", reset_valid=valid)


@app.route("/share-target")
def share_target():
    """PWA/Android share target: send an address from another app directly to VANO MAPS search."""
    value = (request.args.get("text") or request.args.get("url") or request.args.get("title") or "").strip()
    if len(value) > 240:
        value = value[:240]
    return redirect(url_for("index", q=value) if value else url_for("index"))


@app.route("/api/search-suggestions")
def api_search_suggestions():
    user = current_user()
    if not user:
        return jsonify({"items": []})
    items, seen = [], set()
    for kind, label in (("home", user["home_label"]), ("work", user["work_label"])):
        label = str(label or "").strip()
        if label and label.lower() not in seen:
            seen.add(label.lower()); items.append({"kind": kind, "label": label})
    db = get_db()
    try:
        favorites = db.execute("SELECT id,name,label,latitude,longitude FROM saved_places WHERE user_id=? ORDER BY updated_at DESC LIMIT 8", (user["id"],)).fetchall()
    except Exception:
        favorites = []
    for row in favorites:
        label = str(row["label"] or "").strip()
        if not label or label.lower() in seen: continue
        seen.add(label.lower()); items.append({"kind":"favorite","id":row["id"],"name":row["name"] or label.split(",",1)[0],"label":label,"lat":row["latitude"],"lon":row["longitude"]})
    try:
        now_hour = datetime.now().hour
        raw_history = db.execute("SELECT destination_label,destination_lat,destination_lon,created_at FROM route_history WHERE user_id=? AND destination_label<>'' ORDER BY created_at DESC LIMIT 100", (user["id"],)).fetchall()
        by_now = {}
        for h in raw_history:
            try: dt = parse_iso(h["created_at"]); hh = dt.hour if dt else -10
            except Exception: hh = -10
            delta = min((hh-now_hour)%24, (now_hour-hh)%24) if hh >= 0 else 99
            if delta <= 1:
                key = str(h["destination_label"] or "").strip()
                if key:
                    row = by_now.setdefault(key, {"count":0,"lat":h["destination_lat"],"lon":h["destination_lon"]}); row["count"] += 1
        if by_now:
            label, row = max(by_now.items(), key=lambda kv: kv[1]["count"])
            if row["count"] >= 2 and label.lower() not in seen:
                seen.add(label.lower()); items.append({"kind":"smart","label":label,"lat":row["lat"],"lon":row["lon"],"uses":row["count"]})
    except Exception:
        pass
    rows = db.execute(
        """SELECT destination_label,destination_lat,destination_lon,MAX(created_at) last_used,COUNT(*) uses
           FROM route_history WHERE user_id=? AND destination_label<>''
           GROUP BY destination_label,destination_lat,destination_lon ORDER BY last_used DESC LIMIT 14""",
        (user["id"],),
    ).fetchall()
    for row in rows:
        label = str(row["destination_label"] or "").strip()
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        items.append({"kind":"recent","label":label,"lat":row["destination_lat"],"lon":row["destination_lon"],"uses":int(row["uses"] or 1)})
        if len(items) >= 12:
            break
    return jsonify({"items": items})


@app.route("/api/saved-places", methods=["GET", "POST"])
@login_required
def api_saved_places():
    db = get_db(); uid = session["user_id"]
    if request.method == "GET":
        rows = db.execute("SELECT id,name,label,latitude,longitude,updated_at FROM saved_places WHERE user_id=? ORDER BY updated_at DESC LIMIT 24", (uid,)).fetchall()
        return jsonify({"items":[{"id":r["id"],"name":r["name"],"label":r["label"],"lat":r["latitude"],"lon":r["longitude"],"updated_at":r["updated_at"]} for r in rows]})
    if not validate_csrf(): return jsonify({"ok":False,"error":"Sessão inválida."}), 400
    if not rate_limit("saved-place", 40, 3600): return jsonify({"ok":False,"error":"Muitas alterações em pouco tempo."}), 429
    data = request.get_json(silent=True) or {}
    label = str(data.get("label") or "").strip()[:220]; name = str(data.get("name") or "").strip()[:100]
    try: lat=float(data.get("lat")); lon=float(data.get("lon"))
    except Exception: return jsonify({"ok":False,"error":"Localização inválida."}),400
    if not label or not (-90<=lat<=90 and -180<=lon<=180): return jsonify({"ok":False,"error":"Localização inválida."}),400
    now=utcnow_iso()
    existing=db.execute("SELECT id FROM saved_places WHERE user_id=? AND label=?",(uid,label)).fetchone()
    if existing:
        db.execute("UPDATE saved_places SET name=?,latitude=?,longitude=?,updated_at=? WHERE id=?",(name or label.split(",",1)[0],lat,lon,now,existing["id"])); place_id=existing["id"]
    else:
        count=int(db.execute("SELECT COUNT(*) c FROM saved_places WHERE user_id=?",(uid,)).fetchone()["c"] or 0)
        if count>=24: return jsonify({"ok":False,"error":"Você pode manter até 24 favoritos."}),409
        cur=db.execute("INSERT INTO saved_places(user_id,name,label,latitude,longitude,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",(uid,name or label.split(",",1)[0],label,lat,lon,now,now)); place_id=cur.lastrowid
    db.commit(); audit("saved_place",{"id":place_id})
    return jsonify({"ok":True,"id":place_id,"name":name or label.split(",",1)[0],"label":label,"lat":lat,"lon":lon})


@app.route("/api/saved-places/<int:place_id>", methods=["DELETE"])
@login_required
def api_saved_place_delete(place_id):
    if not validate_csrf(): return jsonify({"ok":False,"error":"Sessão inválida."}),400
    db=get_db(); cur=db.execute("DELETE FROM saved_places WHERE id=? AND user_id=?",(place_id,session["user_id"])); db.commit()
    return jsonify({"ok":True,"deleted":bool(cur.rowcount)})


@app.route("/api/weekly-routine", methods=["GET", "PUT"])
@login_required
def api_weekly_routine():
    """Read or replace the signed-in user's seven-day destination routine.

    weekday uses Python's convention: Monday=0 ... Sunday=6. Empty days are
    intentionally removed so the payload remains compact and easy to sync.
    """
    db = get_db(); uid = session["user_id"]
    if request.method == "GET":
        rows = db.execute(
            "SELECT weekday,label,latitude,longitude,departure_time,enabled,updated_at "
            "FROM weekly_routines WHERE user_id=? ORDER BY weekday",
            (uid,),
        ).fetchall()
        return jsonify({
            "items": [
                {
                    "weekday": int(r["weekday"]),
                    "label": r["label"],
                    "lat": r["latitude"],
                    "lon": r["longitude"],
                    "time": r["departure_time"] or "",
                    "enabled": bool(r["enabled"]),
                    "updated_at": r["updated_at"],
                } for r in rows
            ]
        })

    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("weekly-routine", 80, 3600):
        return jsonify({"ok": False, "error": "Muitas alterações em pouco tempo."}), 429

    data = request.get_json(silent=True) or {}
    raw_days = data.get("days")
    if not isinstance(raw_days, list) or len(raw_days) > 7:
        return jsonify({"ok": False, "error": "Rotina inválida."}), 400

    normalized = {}
    for raw in raw_days:
        if not isinstance(raw, dict):
            return jsonify({"ok": False, "error": "Rotina inválida."}), 400
        try:
            weekday = int(raw.get("weekday"))
        except Exception:
            return jsonify({"ok": False, "error": "Dia da semana inválido."}), 400
        if weekday < 0 or weekday > 6 or weekday in normalized:
            return jsonify({"ok": False, "error": "Dia da semana inválido ou repetido."}), 400

        label = str(raw.get("label") or "").strip()[:220]
        departure_time = str(raw.get("time") or "").strip()[:5]
        enabled = 1 if raw.get("enabled", True) else 0
        if departure_time:
            if len(departure_time) != 5 or departure_time[2] != ":":
                return jsonify({"ok": False, "error": "Horário inválido."}), 400
            try:
                hh, mm = (int(x) for x in departure_time.split(":", 1))
                if not (0 <= hh <= 23 and 0 <= mm <= 59): raise ValueError
            except Exception:
                return jsonify({"ok": False, "error": "Horário inválido."}), 400

        if not label:
            normalized[weekday] = None
            continue
        try:
            lat = float(raw.get("lat")); lon = float(raw.get("lon"))
        except Exception:
            return jsonify({"ok": False, "error": "Escolha um endereço válido em cada dia preenchido."}), 400
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return jsonify({"ok": False, "error": "Localização inválida."}), 400
        normalized[weekday] = {"label": label, "lat": lat, "lon": lon, "time": departure_time, "enabled": enabled}

    now = utcnow_iso()
    for weekday in range(7):
        item = normalized.get(weekday)
        if not item:
            db.execute("DELETE FROM weekly_routines WHERE user_id=? AND weekday=?", (uid, weekday))
            continue
        existing = db.execute("SELECT id FROM weekly_routines WHERE user_id=? AND weekday=?", (uid, weekday)).fetchone()
        if existing:
            db.execute(
                "UPDATE weekly_routines SET label=?,latitude=?,longitude=?,departure_time=?,enabled=?,updated_at=? WHERE id=?",
                (item["label"], item["lat"], item["lon"], item["time"], item["enabled"], now, existing["id"]),
            )
        else:
            db.execute(
                "INSERT INTO weekly_routines(user_id,weekday,label,latitude,longitude,departure_time,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (uid, weekday, item["label"], item["lat"], item["lon"], item["time"], item["enabled"], now, now),
            )
    db.commit()
    audit("weekly_routine_saved", {"configured_days": sum(1 for x in normalized.values() if x)}, uid)
    return jsonify({"ok": True, "configured_days": sum(1 for x in normalized.values() if x)})


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("login", 10, 60):
            flash("Muitas tentativas. Tente novamente em instantes.", "danger")
            return render_template("login.html"), 429

        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not user or not user["is_active"] or not verify_password(user["password_hash"], password):
            flash("E-mail ou senha inválidos.", "danger")
            audit("login_failed", {"email_hash": hashlib.sha256(email.encode()).hexdigest()[:16]}, None)
            return render_template("login.html"), 401

        session.clear()
        session["user_id"] = user["id"]
        session["csrf_token"] = secrets.token_urlsafe(32)
        session.permanent = True
        issue_persistent_login(user["id"])
        record_user_access(user["id"], force=True)
        db = get_db()
        db.execute("UPDATE users SET last_login_at=? WHERE id=?", (utcnow_iso(), user["id"]))
        db.commit()
        audit("login_success", {}, user["id"])
        flash(f"Bem-vindo, {user['name'].split()[0]}!", "success")
        refreshed = current_user()
        if onboarding_needed(refreshed):
            return redirect(url_for("onboarding", next=safe_next_url(request.args.get("next")) or url_for("map_page")))
        return redirect(safe_next_url(request.args.get("next")) or url_for("map_page"))

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("register", 6, 300):
            flash("Muitas tentativas de cadastro. Tente novamente depois.", "danger")
            return render_template("register.html"), 429

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        locale = _normalize_ui_locale(request.form.get("locale") or active_ui_locale()) or active_ui_locale()

        errors = []
        if len(name) < 2 or len(name) > 80:
            errors.append("Informe um nome válido.")
        if not EMAIL_RE.match(email) or len(email) > 180:
            errors.append("Informe um e-mail válido.")
        valid_password, password_error = validate_password_strength(password)
        if not valid_password:
            errors.append(password_error)

        if errors:
            for err in errors:
                flash(err, "danger")
            return render_template("register.html"), 400

        db = get_db()
        try:
            cur = db.execute(
                "INSERT INTO users(name,email,password_hash,role,locale,created_at) VALUES(?,?,?,?,?,?)",
                (name, email, hash_password(password), "user", locale, utcnow_iso()),
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            flash("Já existe uma conta com este e-mail.", "danger")
            return render_template("register.html"), 409

        session.clear()
        session["user_id"] = cur.lastrowid
        session["csrf_token"] = secrets.token_urlsafe(32)
        session.permanent = True
        issue_persistent_login(cur.lastrowid)
        record_user_access(cur.lastrowid, force=True)
        audit("register", {}, cur.lastrowid)
        flash("Conta criada. Agora personalize sua navegação.", "success")
        return redirect(url_for("onboarding", next=safe_next_url(request.args.get("next")) or url_for("map_page")))

    return render_template("register.html")


@app.route("/auth/google")
@app.route("/login/google")
def google_login():
    if not google_ready():
        flash("O login com Google ainda não foi configurado neste servidor.", "warning")
        return redirect(url_for("login"))

    # Mantém o mesmo host do redirect URI antes de criar o state da sessão.
    # Isso evita falhas locais quando o app é aberto em 127.0.0.1 mas o
    # callback autorizado no Google usa localhost (ou vice-versa).
    if GOOGLE_REDIRECT_URI:
        configured = urlparse(GOOGLE_REDIRECT_URI)
        if configured.scheme in {"http", "https"} and configured.netloc:
            current_host = request.host.lower()
            target_host = configured.netloc.lower()
            if current_host != target_host:
                target = f"{configured.scheme}://{configured.netloc}/login/google"
                next_url = safe_next_url(request.args.get("next"))
                if next_url:
                    target += "?" + urlencode({"next": next_url})
                return redirect(target)

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(24)
    session["google_oauth_state"] = state
    session["google_oauth_nonce"] = nonce
    next_url = safe_next_url(request.args.get("next"))
    if next_url:
        session["google_oauth_next"] = next_url

    redirect_uri = google_redirect_uri()
    session["google_oauth_redirect_uri"] = redirect_uri
    # Keep a server-side copy too. This makes Google login reliable even if a
    # partitioned iframe cookie is unavailable after returning from Google.
    persist_google_oauth_state(state, redirect_uri, next_url)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    }
    response = redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    # Dedicated OAuth cookie: unlike the normal embedded session cookie this
    # uses SameSite=Lax so top-level navigation back from Google can carry it.
    response.set_cookie(
        "rairo_oauth_state",
        oauth_cookie_value(state),
        max_age=12 * 60,
        secure=True,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    return response


@app.route("/auth/google/callback")
@app.route("/login/google/callback")
def google_callback():
    if not google_ready():
        abort(404)

    if request.args.get("error"):
        flash("O login com Google foi cancelado ou não pôde ser concluído.", "warning")
        return redirect(url_for("login"))

    returned_state = request.args.get("state", "")
    expected_state = session.pop("google_oauth_state", "")
    session.pop("google_oauth_nonce", None)

    # First validate the normal same-session flow. Independently consume the
    # persisted one-time state so iframe/mobile OAuth also works when the
    # browser did not return the original partitioned session cookie.
    stored_state = consume_google_oauth_state(returned_state)
    session_state_ok = bool(
        returned_state
        and expected_state
        and secrets.compare_digest(returned_state, expected_state)
    )
    cookie_state_ok = oauth_cookie_matches(returned_state)
    fingerprint_ok = bool(
        stored_state
        and stored_state["fingerprint"]
        and secrets.compare_digest(stored_state["fingerprint"], oauth_client_fingerprint())
    )
    if not stored_state or not (session_state_ok or cookie_state_ok or fingerprint_ok):
        audit(
            "google_login_state_mismatch",
            {
                "session_state_present": bool(expected_state),
                "signed_cookie_ok": cookie_state_ok,
                "fingerprint_ok": fingerprint_ok,
            },
        )
        flash("A sessão do login Google expirou. Tente entrar novamente.", "warning")
        return redirect(url_for("login"))

    code = request.args.get("code", "")
    session_redirect_uri = session.pop("google_oauth_redirect_uri", None)
    session_next_url = session.pop("google_oauth_next", None)
    redirect_uri = stored_state["redirect_uri"] or session_redirect_uri or google_redirect_uri()
    next_url = stored_state["next_url"] or session_next_url
    if not code:
        flash("O Google não retornou um código de autenticação válido.", "danger")
        return redirect(url_for("login"))

    try:
        token_response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=12,
        )
        token_response.raise_for_status()
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise RuntimeError("Token de acesso ausente")
        info = google_user_from_token(access_token)
    except Exception as exc:
        provider_status = getattr(getattr(exc, "response", None), "status_code", None)
        provider_error = ""
        try:
            if getattr(exc, "response", None) is not None:
                body = exc.response.json()
                provider_error = str(body.get("error") or "")[:80]
        except Exception:
            pass
        audit(
            "google_login_provider_error",
            {"type": type(exc).__name__, "status": provider_status, "provider_error": provider_error},
        )
        flash("Não foi possível concluir o login com Google agora. Tente novamente.", "danger")
        return redirect(url_for("login"))

    sub = str(info.get("sub") or "").strip()
    email = str(info.get("email") or "").strip().lower()
    email_verified = info.get("email_verified") is True or str(info.get("email_verified")).lower() == "true"
    name = str(info.get("name") or info.get("given_name") or email.split("@")[0]).strip()[:80]
    avatar = str(info.get("picture") or "").strip()[:500]
    if not sub or not EMAIL_RE.match(email) or not email_verified:
        audit("google_login_invalid_identity")
        flash("A conta Google precisa disponibilizar um e-mail verificado.", "danger")
        return redirect(url_for("login"))

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE google_sub=?", (sub,)).fetchone()
    if not user:
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()

    if user and not user["is_active"]:
        flash("Esta conta está desativada.", "danger")
        return redirect(url_for("login"))

    created_new = False
    try:
        if user:
            existing_sub = user["google_sub"]
            if existing_sub and existing_sub != sub:
                raise RuntimeError("Conta Google divergente")
            provider = "google" if user["auth_provider"] == "google" else "hybrid"
            role = "admin" if is_admin_email(email) else user["role"]
            db.execute(
                "UPDATE users SET google_sub=?, avatar_url=?, auth_provider=?, last_login_at=?, role=? WHERE id=?",
                (sub, avatar, provider, utcnow_iso(), role, user["id"]),
            )
            user_id = user["id"]
        else:
            cur = db.execute(
                "INSERT INTO users(name,email,password_hash,role,locale,created_at,last_login_at,google_sub,avatar_url,auth_provider) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (name, email, f"google_only${secrets.token_hex(32)}", role_for_email(email), preferred_language(), utcnow_iso(), utcnow_iso(), sub, avatar, "google"),
            )
            user_id = cur.lastrowid
            created_new = True
        db.commit()
    except Exception:
        db.rollback()
        audit("google_login_link_error")
        flash("Não foi possível vincular sua conta Google ao Vano Maps.", "danger")
        return redirect(url_for("login"))

    session.clear()
    session["user_id"] = user_id
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    issue_persistent_login(user_id)
    record_user_access(user_id, force=True)
    audit("google_login_success", {}, user_id)
    flash(f"Bem-vindo, {name.split()[0]}!", "success")
    refreshed = current_user()
    if created_new or onboarding_needed(refreshed):
        return redirect(url_for("onboarding", next=safe_next_url(next_url) or url_for("index")))
    return redirect(safe_next_url(next_url) or url_for("index"))


@app.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    user = current_user()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        try:
            age = int(request.form.get("age", ""))
        except (TypeError, ValueError):
            age = 0
        # V311: sex/gender is not required by routing or eligibility. New
        # onboarding flows therefore do not collect it; preserve an existing
        # value only for backwards compatibility with older accounts.
        sex = str(user["sex"] or "prefer_not_say").strip().lower() or "prefer_not_say"
        driver_raw = str(request.form.get("is_app_driver", "")).strip().lower()
        route_preference = str(request.form.get("route_preference", "balanced")).strip().lower()
        night_mode = 1 if request.form.get("night_safety_mode") == "1" else 0
        distance_unit = str(request.form.get("distance_unit", user["distance_unit"] or "km")).strip().lower()
        emergency_name = str(request.form.get("emergency_name", "")).strip()[:80]
        emergency_phone = re.sub(r"[^0-9+() .-]", "", str(request.form.get("emergency_phone", "")).strip())[:40]
        allowed_sex = {"female", "male", "intersex_other", "prefer_not_say"}
        if sex not in allowed_sex:
            sex = "prefer_not_say"
        errors=[]
        if age < 13 or age > 100:
            errors.append("Informe uma idade válida entre 13 e 100 anos.")
        if driver_raw not in {"yes", "no"}:
            errors.append("Informe se você dirige por aplicativo.")
        if route_preference not in {"balanced", "safety_first", "fast_first"}:
            errors.append("Escolha uma preferência de rota válida.")
        if distance_unit not in {"km", "mi"}:
            errors.append("Escolha uma unidade de distância válida.")
        if errors:
            for message in errors:
                flash(message, "danger")
            return render_template("onboarding.html", user=user), 400
        db=get_db()
        # Cadastro enxuto: dados do veículo ficam opcionais no Perfil e a presença
        # no mapa não é ativada durante a criação da conta.
        db.execute(
            """UPDATE users SET age=?,sex=?,is_app_driver=?,night_safety_mode=?,route_preference=?,distance_unit=?,emergency_name=?,emergency_phone=?,onboarding_completed_at=?,presence_visible=? WHERE id=?""",
            (age, sex, 1 if driver_raw == "yes" else 0, night_mode, route_preference, distance_unit, emergency_name, emergency_phone, utcnow_iso(), 0, user["id"]),
        )
        db.execute("DELETE FROM nearby_presence WHERE user_id=?", (user["id"],))
        db.commit()
        audit("profile_onboarding_complete", {
            "app_driver": driver_raw == "yes", "night_safety": bool(night_mode), "route_preference": route_preference
        }, user["id"])
        flash("Perfil de navegação configurado.", "success")
        return redirect(safe_next_url(request.args.get("next")) or url_for("map_page"))
    return render_template("onboarding.html", user=user)


@app.route("/logout", methods=["POST"])
def logout():
    if not validate_csrf():
        abort(400)
    uid = session.get("user_id")
    audit("logout", {}, uid)
    revoke_current_persistent_login()
    session.clear()
    # Return to the entry screen so logout has an unambiguous visual result.
    # Explicit cookie expiry complements Flask's session clearing and the
    # after_request remembered-cookie cleanup on restrictive mobile browsers.
    response = redirect(url_for("login", logged_out="1"))
    response.delete_cookie(REMEMBER_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="Lax")
    response.delete_cookie(REMEMBER_EMBED_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="None", partitioned=True)
    response.delete_cookie(app.config.get("SESSION_COOKIE_NAME", "session"), path="/")
    return response


@app.route("/map")
def map_page():
    # A navegação principal agora vive na home mobile-first.
    return redirect(url_for("index"))


@app.route("/report", methods=["GET", "POST"])
@login_required
def report_page():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("report", 8, 3600):
            flash("Limite temporário de denúncias atingido.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 429

        category = request.form.get("category", "other")
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        address = request.form.get("address", "").strip()
        try:
            severity = int(request.form.get("severity", "3"))
            lat = float(request.form.get("latitude", ""))
            lon = float(request.form.get("longitude", ""))
        except ValueError:
            flash("Localização inválida.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400

        if category not in CATEGORY_META:
            category = "other"
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            flash("Coordenadas fora do intervalo válido.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400
        if not (4 <= len(title) <= 100):
            flash("O título deve ter entre 4 e 100 caracteres.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400
        if len(description) > 600 or len(address) > 220:
            flash("Texto muito longo.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400

        road_hit = snap_alert_to_nearest_road(lat, lon)
        if not road_hit:
            flash("Não foi possível fixar o alerta em uma via próxima. Tente novamente.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 503
        lat, lon = road_hit["lat"], road_hit["lon"]
        if road_hit.get("road_name"):
            address = road_hit["road_name"]

        severity = clamp(severity, 1, 5)
        author_weight = report_author_weight(session.get("user_id"))
        severity = max(1, int(round(severity * author_weight)))
        expires_at = (datetime.now(timezone.utc) + timedelta(days=14)).replace(microsecond=0).isoformat()
        db = get_db()
        db.execute(
            """
            INSERT INTO reports(user_id,category,title,description,severity,latitude,longitude,address,status,created_at,expires_at,road_snapped,snap_distance_m,road_name)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (session["user_id"], category, title, description, severity, lat, lon, address, "active", utcnow_iso(), expires_at, 1, round(road_hit["distance_m"], 1), road_hit.get("road_name") or ""),
        )
        db.commit()
        audit("report_created", {"category": category, "severity": severity, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1)})
        record_activity("alert", {"label": "road-snap:full", "target": "report", "snap_distance_m": round(road_hit["distance_m"], 1)}, status_code=201, method="EVENT", path="/report", endpoint="report_page")
        flash("Alerta publicado. Obrigado por ajudar a comunidade.", "success")
        return redirect(url_for("alerts_page"))

    return render_template("report.html", categories=CATEGORY_META)


@app.route("/alerts")
@login_required
def alerts_page():
    db = get_db()
    reports = db.execute(
        """
        SELECT r.*, u.name reporter_name
        FROM reports r JOIN users u ON u.id=r.user_id
        WHERE r.status='active' AND (r.expires_at IS NULL OR r.expires_at > ?)
        ORDER BY r.created_at DESC LIMIT 100
        """,
        (utcnow_iso(),),
    ).fetchall()
    return render_template("alerts.html", reports=reports, categories=CATEGORY_META)


@app.route("/alerts/<int:report_id>/confirm", methods=["POST"])
@login_required
def confirm_report(report_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    report = db.execute("SELECT id,status FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        abort(404)
    try:
        db.execute(
            "INSERT INTO report_confirmations(report_id,user_id,created_at) VALUES(?,?,?)",
            (report_id, session["user_id"], utcnow_iso()),
        )
        db.execute("UPDATE reports SET confirmations=confirmations+1 WHERE id=?", (report_id,))
        db.commit()
        invalidate_route_context("reports")
        flash("Alerta confirmado.", "success")
    except IntegrityError:
        db.rollback()
        flash("Você já confirmou este alerta.", "info")
    return redirect(url_for("alerts_page"))


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    db = get_db()
    user = current_user()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        locale = _normalize_ui_locale(request.form.get("locale") or active_ui_locale()) or active_ui_locale()
        if locale not in SUPPORTED_UI_LOCALES:
            locale = active_ui_locale()
        distance_unit = (request.form.get("distance_unit") or "km").strip()
        if distance_unit not in {"km", "mi"}:
            distance_unit = "km"
        visibility = (request.form.get("presence_visible") or "0") == "1"
        # Presença é opt-in e só pode ser publicada por motoristas adultos.
        # A posição servida aos demais é sempre quantizada/aproximada.
        can_publish_presence = bool(user and int(user["is_app_driver"] or 0) == 1 and int(user["age"] or 0) >= 18 and user["presence_terms_accepted_at"])
        presence_visible = 1 if visibility and can_publish_presence else 0
        networks = [x.strip()[:40] for x in request.form.getlist("fuel_networks") if x.strip()][:12]
        map_style = (request.form.get("map_style") or "auto").strip().lower()
        if map_style not in {"auto", "day", "afternoon", "night", "rain"}:
            map_style = "auto"
        map_accent = (request.form.get("map_accent") or "violet").strip().lower()
        if map_accent not in MAPBOX_ACCENT_PRESETS:
            map_accent = "violet"
        avoid_ferries = 1 if request.form.get("avoid_ferries") == "1" else 0
        avoid_tolls = 1 if request.form.get("avoid_tolls") == "1" else 0
        avoid_unpaved = 1 if request.form.get("avoid_unpaved") == "1" else 0
        emergency_name = (request.form.get("emergency_name") or "").strip()[:80]
        emergency_phone = re.sub(r"[^0-9+() -]", "", (request.form.get("emergency_phone") or "").strip())[:30]
        db.execute(
            """UPDATE users SET locale=?,distance_unit=?,vehicle_make=?,vehicle_model=?,vehicle_plate=?,vehicle_year=?,preferred_fuel_networks=?,home_label=?,work_label=?,presence_visible=?,emergency_name=?,emergency_phone=?,map_style=?,map_accent=?,avoid_ferries=?,avoid_tolls=?,avoid_unpaved=? WHERE id=?""",
            (
                locale, distance_unit,
                (request.form.get("vehicle_make") or "").strip()[:60],
                (request.form.get("vehicle_model") or "").strip()[:80],
                (request.form.get("vehicle_plate") or "").strip().upper()[:16],
                (request.form.get("vehicle_year") or "").strip()[:8],
                json.dumps(networks, ensure_ascii=False),
                (request.form.get("home_label") or "").strip()[:220],
                (request.form.get("work_label") or "").strip()[:220],
                presence_visible, emergency_name, emergency_phone, map_style, map_accent,
                avoid_ferries, avoid_tolls, avoid_unpaved, session["user_id"],
            ),
        )
        if not presence_visible:
            db.execute("DELETE FROM nearby_presence WHERE user_id=?", (session["user_id"],))
        db.commit()
        flash("Preferências salvas.", "success")
        return redirect(url_for("profile") + "#settings")

    recent = db.execute(
        "SELECT * FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 8",
        (session["user_id"],),
    ).fetchall()
    mine = db.execute(
        "SELECT * FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 8",
        (session["user_id"],),
    ).fetchall()
    user = current_user()
    try:
        fuel_networks = json.loads(user["preferred_fuel_networks"] or "[]") if user else []
    except Exception:
        fuel_networks = []
    try:
        created = datetime.fromisoformat(str(user["created_at"]).replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        membership_days = max(0, (datetime.now(timezone.utc) - created).days)
    except Exception:
        membership_days = 0
    linked_accounts = db.execute(
        """SELECT tl.id,tl.relation,tl.created_at,u.id AS user_id,u.name,u.email,u.avatar_url
           FROM trusted_links tl JOIN users u ON u.id=tl.trusted_user_id
           WHERE tl.owner_user_id=? ORDER BY tl.created_at DESC""",
        (session["user_id"],),
    ).fetchall()
    # IDs são monotônicos na tabela users; 1–5000 representam os primeiros
    # cadastros e mantêm o selo mesmo que contas antigas sejam removidas.
    try:
        is_pioneer = 1 <= int(user["id"]) <= 5000
    except (TypeError, ValueError, KeyError):
        is_pioneer = False
    return render_template("profile.html", recent=recent, mine=mine, categories=CATEGORY_META, fuel_networks=fuel_networks, membership_days=membership_days, linked_accounts=linked_accounts, is_pioneer=is_pioneer)



@app.route("/api/family-invite", methods=["POST"])
@login_required
def api_family_invite():
    if not validate_csrf():
        abort(400)
    db = get_db()
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    expires = (now + timedelta(days=7)).replace(microsecond=0).isoformat()
    db.execute("DELETE FROM family_invites WHERE inviter_user_id=? AND accepted_at IS NULL", (session["user_id"],))
    db.execute(
        "INSERT INTO family_invites(token,inviter_user_id,relation,created_at,expires_at) VALUES(?,?,?,?,?)",
        (token, session["user_id"], "responsavel", now.replace(microsecond=0).isoformat(), expires),
    )
    db.commit()
    return jsonify({"ok": True, "url": url_for("family_invite", token=token, _external=True), "expires_at": expires})


@app.route("/family/invite/<token>", methods=["GET", "POST"])
def family_invite(token):
    db = get_db()
    invite = db.execute(
        "SELECT fi.*,u.name AS inviter_name,u.email AS inviter_email,u.age AS inviter_age FROM family_invites fi JOIN users u ON u.id=fi.inviter_user_id WHERE fi.token=?",
        (token,),
    ).fetchone()
    if not invite:
        return render_template("error.html", code=404, message="Convite não encontrado."), 404
    try:
        expired = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except Exception:
        expired = True
    if expired or invite["accepted_at"]:
        return render_template("family_invite.html", invite=invite, expired=True)
    if request.method == "POST":
        user = current_user()
        if not user:
            return redirect(url_for("login", next=request.path))
        if not validate_csrf():
            abort(400)
        if int(user["id"]) == int(invite["inviter_user_id"]):
            flash("Use outra conta para aceitar seu próprio convite.", "warning")
            return redirect(request.path)
        if user["age"] is not None and int(user["age"] or 0) < 18:
            flash("A conta responsável precisa ser de uma pessoa adulta.", "warning")
            return redirect(request.path)
        now = utcnow_iso()
        db.execute(
            """INSERT INTO trusted_links(owner_user_id,trusted_user_id,relation,created_at)
               VALUES(?,?,?,?) ON CONFLICT(owner_user_id,trusted_user_id) DO NOTHING""",
            (invite["inviter_user_id"], user["id"], invite["relation"] or "responsavel", now),
        )
        db.execute(
            "UPDATE family_invites SET accepted_at=?,accepted_by_user_id=? WHERE id=?",
            (now, user["id"], invite["id"]),
        )
        db.execute(
            "INSERT INTO app_notifications(user_id,source_user_id,kind,title,body,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
            (invite["inviter_user_id"], user["id"], "family", "Conta vinculada", f"{user['name']} aceitou seu convite de vínculo.", "{}", now),
        )
        db.commit()
        flash("Conta vinculada com sucesso.", "success")
        return redirect(url_for("profile") + "#family")
    return render_template("family_invite.html", invite=invite, expired=False)


@app.route("/api/family-link/<int:link_id>/remove", methods=["POST"])
@login_required
def api_family_link_remove(link_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    db.execute("DELETE FROM trusted_links WHERE id=? AND owner_user_id=?", (link_id, session["user_id"]))
    db.commit()
    flash("Vínculo removido.", "success")
    return redirect(url_for("profile") + "#family")


@app.route("/notifications")
@login_required
def notifications_page():
    db = get_db()
    items = db.execute(
        "SELECT n.*,u.name AS source_name,u.avatar_url AS source_avatar FROM app_notifications n LEFT JOIN users u ON u.id=n.source_user_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 80",
        (session["user_id"],),
    ).fetchall()
    db.execute("UPDATE app_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?", (utcnow_iso(), session["user_id"]))
    db.commit()
    return render_template("notifications.html", notifications=items)


@app.route("/notifications/<int:notification_id>/location")
@login_required
def notification_location(notification_id):
    row = get_db().execute(
        "SELECT payload_json FROM app_notifications WHERE id=? AND user_id=?",
        (notification_id, session["user_id"]),
    ).fetchone()
    if not row:
        abort(404)
    try:
        data = json.loads(row["payload_json"] or "{}")
        lat, lon = float(data.get("lat")), float(data.get("lon"))
    except Exception:
        abort(404)
    return redirect(f"https://www.google.com/maps?q={lat:.6f},{lon:.6f}")


@app.route("/api/notifications/unread")
@login_required
def api_notifications_unread():
    row = get_db().execute(
        "SELECT COUNT(*) AS n FROM app_notifications WHERE user_id=? AND read_at IS NULL",
        (session["user_id"],),
    ).fetchone()
    return jsonify({"ok": True, "unread": int(row["n"] or 0)})


@app.route("/api/sos", methods=["POST"])
@login_required
def api_sos():
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    try:
        lat = float(payload.get("lat")); lon = float(payload.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "Posição inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Posição inválida."}), 400
    user = current_user()
    db = get_db()
    links = db.execute(
        "SELECT tl.trusted_user_id,u.name,u.email FROM trusted_links tl JOIN users u ON u.id=tl.trusted_user_id WHERE tl.owner_user_id=? AND u.is_active=1",
        (session["user_id"],),
    ).fetchall()
    now = utcnow_iso()
    destination = str(payload.get("destination") or "")[:180]
    notification_payload = json.dumps({"lat": round(lat, 6), "lon": round(lon, 6), "destination": destination}, ensure_ascii=False)
    for linked in links:
        db.execute(
            "INSERT INTO app_notifications(user_id,source_user_id,kind,title,body,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
            (linked["trusted_user_id"], user["id"], "sos", f"SOS de {user['name']}", "A pessoa vinculada acionou o SOS no Vano Maps. Abra para ver a posição compartilhada.", notification_payload, now),
        )
    db.commit()
    audit("sos_internal_notify", {"linked_count": len(links)}, user["id"] if user else None)
    return jsonify({"ok": True, "notified": len(links)})


def legal_identity_context():
    """Public legal identity with VANO-first env names and legacy fallbacks."""
    return {
        "legal_name": str(os.environ.get("VANO_LEGAL_NAME") or os.environ.get("RAIGO_LEGAL_NAME") or "VANO MAPS").strip()[:180],
        "legal_cnpj": str(os.environ.get("VANO_LEGAL_CNPJ") or os.environ.get("RAIGO_LEGAL_CNPJ") or "").strip()[:32],
        "privacy_email": str(os.environ.get("VANO_PRIVACY_EMAIL") or os.environ.get("RAIGO_PRIVACY_EMAIL") or "").strip()[:220],
        "activity_log_retention_days": ACTIVITY_LOG_RETENTION_DAYS,
    }


@app.route("/help")
def help_page():
    return render_template("help.html")


@app.route("/about")
def about():
    return render_template("about.html", **legal_identity_context())


@app.route("/sobre")
def sobre():
    # Institutional route intentionally kept out of the main navigation for now.
    return render_template("sobre.html", **legal_identity_context())


def _serve_root_seo_file(filename, mimetype):
    path = os.path.join(BASE_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            content = fh.read()
    except OSError:
        abort(404)
    public_origin = PUBLIC_SITE_URL or request.host_url.rstrip("/")
    content = content.replace("__PUBLIC_SITE_URL__", public_origin)
    response = app.response_class(content, mimetype=mimetype)
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.route("/robots.txt")
def robots_txt():
    return _serve_root_seo_file("robots.txt", "text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    return _serve_root_seo_file("sitemap.xml", "application/xml")


@app.route("/politica-de-privacidade")
@app.route("/privacy")
def privacy_policy():
    """Página legal exigida pelo rodapé/base.html.

    Mantém o endpoint `privacy_policy` para evitar BuildError em produção
    quando o template chama url_for('privacy_policy').
    """
    recent_privacy_requests = []
    if session.get("user_id"):
        try:
            recent_privacy_requests = get_db().execute(
                "SELECT protocol,request_type,status,created_at,updated_at FROM privacy_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
                (session.get("user_id"),),
            ).fetchall()
        except Exception:
            recent_privacy_requests = []
    return render_template("privacy_policy.html", privacy_request_types=globals().get("PRIVACY_REQUEST_TYPES", {}), recent_privacy_requests=recent_privacy_requests, **legal_identity_context())


@app.route("/termos-de-uso")
@app.route("/terms")
def terms_of_use():
    """Página legal exigida pelo rodapé/base.html."""
    return render_template("terms_of_use.html", **legal_identity_context())


@app.route("/o-que-e-vano-maps")
def what_is_vano():
    return render_template("seo_o_que_e_vano.html")


@app.route("/rotas-para-evitar-transito")
def seo_avoid_traffic():
    return render_template("seo_evitar_transito.html")


@app.route("/alternativa-ao-waze")
def seo_waze_alternative():
    return render_template("seo_alternativa_waze.html")


@app.route("/benchmark-de-rotas")
def route_benchmark_page():
    return render_template("benchmark_de_rotas.html")


@app.route("/excluir-conta")
def account_delete_page():
    return render_template("account_delete_page.html")


@app.route("/account/delete", methods=["POST"])
@login_required
def account_delete():
    if not validate_csrf():
        abort(400)
    if not rate_limit("account-delete", 4, 900):
        flash("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    user = current_user()
    confirmation = str(request.form.get("confirmation") or "").strip().upper()
    password = request.form.get("password", "")
    if confirmation != "EXCLUIR":
        flash("Digite EXCLUIR para confirmar a exclusão permanente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    if str(user["auth_provider"] or "password") == "password" and not verify_password(user["password_hash"], password):
        flash("Senha atual incorreta.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    uid = int(user["id"])
    db = get_db()
    try:
        # Preserve only legally/operationally necessary records through existing
        # ON DELETE SET NULL constraints. Account-linked personal rows cascade.
        db.execute("DELETE FROM users WHERE id=?", (uid,))
        db.commit()
    except Exception:
        db.rollback()
        app.logger.exception("Account deletion failed")
        flash("Não foi possível excluir sua conta agora. Tente novamente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    session.clear()
    response = redirect(url_for("index"))
    response.delete_cookie(REMEMBER_COOKIE_NAME, path="/")
    flash("Sua conta foi excluída permanentemente.", "success")
    return response


PRIVACY_REQUEST_TYPES = {
    "access": "Acesso aos meus dados",
    "correction": "Correção de dados",
    "deletion": "Exclusão / anonimização",
    "portability": "Portabilidade",
    "sharing": "Informações sobre compartilhamento",
    "objection": "Oposição a tratamento",
    "consent": "Revogação de consentimento",
    "other": "Outro pedido de privacidade",
}


@app.route("/privacy/request", methods=["POST"])
@login_required
def privacy_request_create():
    if not validate_csrf():
        abort(400)
    if not rate_limit("privacy-request", 5, 3600):
        flash("Muitos pedidos em pouco tempo. Aguarde antes de enviar novamente.", "danger")
        return redirect(url_for("privacy_policy"))
    user = current_user()
    request_type = str(request.form.get("request_type") or "other").strip().lower()
    if request_type not in PRIVACY_REQUEST_TYPES:
        request_type = "other"
    message = re.sub(r"\s+", " ", str(request.form.get("message") or "").strip())[:1200]
    now = utcnow_iso()
    protocol = "PRV-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    db = get_db()
    # Token is random enough for a human protocol; retry once on the extremely
    # unlikely event of a collision.
    for _ in range(2):
        try:
            db.execute(
                """INSERT INTO privacy_requests(protocol,user_id,email,request_type,message,status,created_at,updated_at)
                   VALUES(?,?,?,?,?,'pending',?,?)""",
                (protocol, user["id"], str(user["email"] or "")[:220], request_type, message, now, now),
            )
            db.commit()
            break
        except IntegrityError:
            db.rollback(); protocol = "PRV-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(4).upper()
    else:
        flash("Não foi possível gerar o protocolo agora. Tente novamente.", "danger")
        return redirect(url_for("privacy_policy"))
    audit("privacy_request_created", {"protocol": protocol, "request_type": request_type}, user["id"] if user else None)
    flash(f"Pedido recebido. Seu protocolo é {protocol}.", "success")
    return redirect(url_for("privacy_policy") + "#direitos")


@app.route("/admin/privacy")
@admin_required
def admin_privacy_requests():
    rows = get_db().execute(
        """SELECT p.*,COALESCE(u.name,'Conta removida') user_name
           FROM privacy_requests p LEFT JOIN users u ON u.id=p.user_id
           ORDER BY CASE p.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, p.created_at DESC
           LIMIT 500"""
    ).fetchall()
    return render_template("admin_privacy.html", rows=rows, request_types=PRIVACY_REQUEST_TYPES)


@app.route("/admin/privacy/<int:request_id>/status", methods=["POST"])
@admin_required
def admin_privacy_request_status(request_id):
    if not validate_csrf():
        abort(400)
    status = str(request.form.get("status") or "pending").strip()
    if status not in {"pending", "in_progress", "completed", "rejected"}:
        abort(400)
    note = str(request.form.get("admin_note") or "").strip()[:1200]
    db = get_db()
    row = db.execute("SELECT protocol FROM privacy_requests WHERE id=?", (request_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("UPDATE privacy_requests SET status=?,admin_note=?,updated_at=? WHERE id=?", (status, note, utcnow_iso(), request_id))
    db.commit()
    audit("privacy_request_status", {"protocol": row["protocol"], "status": status})
    flash("Pedido de privacidade atualizado.", "success")
    return redirect(url_for("admin_privacy_requests"))

# -----------------------------
# Admin
# -----------------------------

@app.route("/api/admin/simulation/authorize", methods=["POST"])
@admin_required
def api_admin_simulation_authorize():
    if not validate_csrf():
        abort(400)
    user = current_user()
    audit("admin_navigation_simulation", {"source": "map"}, user["id"] if user else None)
    return jsonify({"ok": True, "authorized": True, "mode": "local-route-simulation"})



FINANCE_CATEGORIES = [
    "Infraestrutura", "Servidores / Nodes", "Mapas / APIs", "Marketing", "Domínios e hospedagem",
    "Ferramentas / SaaS", "Impostos e taxas", "Prestadores", "Equipe", "Receita operacional", "Outros",
]
FINANCE_COST_CENTERS = ["Operação", "Infraestrutura", "Produto", "Marketing", "Administrativo", "Financeiro"]


def _finance_money_to_cents(value):
    raw = str(value or "").strip().replace("R$", "").replace(" ", "")
    if not raw:
        raise ValueError("Informe um valor.")
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        amount = Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Valor financeiro inválido.")
    if amount <= 0 or amount > Decimal("999999999.99"):
        raise ValueError("O valor precisa ser maior que zero e dentro do limite permitido.")
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def _finance_brl(cents):
    try:
        value = Decimal(int(cents or 0)) / Decimal(100)
    except Exception:
        value = Decimal(0)
    txt = f"{value:,.2f}"
    return "R$ " + txt.replace(",", "X").replace(".", ",").replace("X", ".")


app.jinja_env.filters["brl"] = _finance_brl


def _finance_audit(db, action, object_type, object_id=None, snapshot=None, actor_id=None):
    actor = actor_id or session.get("user_id")
    created_at = utcnow_iso()
    payload = json.dumps(snapshot or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    envelope = json.dumps({
        "actor_user_id": actor, "action": str(action)[:80], "object_type": str(object_type)[:40],
        "object_id": object_id, "snapshot": snapshot or {}, "created_at": created_at,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(envelope.encode("utf-8")).hexdigest()
    db.execute(
        """INSERT INTO finance_audit_logs(actor_user_id,action,object_type,object_id,snapshot_json,snapshot_sha256,created_at)
           VALUES(?,?,?,?,?,?,?)""",
        (actor, str(action)[:80], str(object_type)[:40], object_id, payload, digest, created_at),
    )


def _finance_default_account(db):
    row = db.execute("SELECT * FROM finance_accounts ORDER BY active DESC,id ASC LIMIT 1").fetchone()
    if row:
        return row
    now = utcnow_iso()
    created = db.execute(
        """INSERT INTO finance_accounts(name,institution,account_type,currency,opening_balance_cents,active,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?) RETURNING id""",
        ("Caixa VANO MAPS", "", "cash", "BRL", 0, 1, session.get("user_id"), now, now),
    ).fetchone()
    account_id = int(created["id"])
    row = db.execute("SELECT * FROM finance_accounts WHERE id=?", (account_id,)).fetchone()
    _finance_audit(db, "account_created", "account", account_id, dict(row))
    db.commit()
    return row


def _finance_accounts_with_balance(db):
    return db.execute(
        """SELECT a.*,
                  (a.opening_balance_cents + COALESCE(x.delta_cents,0)) AS balance_cents
           FROM finance_accounts a
           LEFT JOIN (
             SELECT account_id,
                    SUM(CASE WHEN status='posted' AND kind='income' THEN amount_cents
                             WHEN status='posted' AND kind='expense' THEN -amount_cents ELSE 0 END) AS delta_cents
             FROM finance_entries GROUP BY account_id
           ) x ON x.account_id=a.id
           ORDER BY a.active DESC,a.id ASC"""
    ).fetchall()


def _finance_monthly_equivalent(commitment):
    amount = int(commitment.get("amount_cents") or 0)
    cadence = str(commitment.get("cadence") or "monthly")
    if cadence == "weekly":
        return round(amount * 52 / 12)
    if cadence == "annual":
        return round(amount / 12)
    if cadence == "one_off":
        due = str(commitment.get("next_due_on") or "")[:7]
        return amount if due == datetime.now(timezone.utc).strftime("%Y-%m") else 0
    return amount


@app.route("/admin/finance")
@admin_required
def admin_finance():
    db = get_db()
    _finance_default_account(db)
    accounts = [dict(r) for r in _finance_accounts_with_balance(db)]
    now = datetime.now(timezone.utc)
    month_prefix = now.strftime("%Y-%m")
    totals = db.execute(
        """SELECT
             COALESCE(SUM(CASE WHEN status='posted' AND kind='income' THEN amount_cents ELSE 0 END),0) income_total,
             COALESCE(SUM(CASE WHEN status='posted' AND kind='expense' THEN amount_cents ELSE 0 END),0) expense_total,
             COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) pending_count
           FROM finance_entries WHERE occurred_on LIKE ?""",
        (month_prefix + "%",),
    ).fetchone()
    cash_balance = sum(int(a.get("balance_cents") or 0) for a in accounts if int(a.get("active") or 0) == 1)
    commitments = [dict(r) for r in db.execute(
        """SELECT c.*,u.name created_by_name FROM finance_commitments c
           LEFT JOIN users u ON u.id=c.created_by ORDER BY c.active DESC,c.next_due_on ASC NULLS LAST,c.id DESC LIMIT 120"""
    ).fetchall()]
    declared_monthly = sum(_finance_monthly_equivalent(c) for c in commitments if int(c.get("active") or 0) == 1)
    entries = db.execute(
        """SELECT e.*,a.name account_name,u.name created_by_name,pu.name posted_by_name,vu.name voided_by_name
           FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id
           LEFT JOIN users u ON u.id=e.created_by
           LEFT JOIN users pu ON pu.id=e.posted_by
           LEFT JOIN users vu ON vu.id=e.voided_by
           ORDER BY e.occurred_on DESC,e.id DESC LIMIT 160"""
    ).fetchall()
    category_rows = db.execute(
        """SELECT category,COALESCE(SUM(amount_cents),0) total_cents
           FROM finance_entries WHERE status='posted' AND kind='expense' AND occurred_on LIKE ?
           GROUP BY category ORDER BY total_cents DESC LIMIT 8""",
        (month_prefix + "%",),
    ).fetchall()
    audit_rows = db.execute(
        """SELECT f.*,u.name actor_name FROM finance_audit_logs f
           LEFT JOIN users u ON u.id=f.actor_user_id ORDER BY f.id DESC LIMIT 80"""
    ).fetchall()
    return render_template(
        "admin_finance.html", accounts=accounts, entries=entries, commitments=commitments,
        finance_totals={
            "cash_balance_cents": cash_balance,
            "income_month_cents": int(totals["income_total"] or 0),
            "expense_month_cents": int(totals["expense_total"] or 0),
            "net_month_cents": int(totals["income_total"] or 0) - int(totals["expense_total"] or 0),
            "pending_count": int(totals["pending_count"] or 0),
            "declared_monthly_cents": int(declared_monthly),
        },
        category_rows=category_rows, audit_rows=audit_rows, finance_categories=FINANCE_CATEGORIES,
        finance_cost_centers=FINANCE_COST_CENTERS, month_label=now.strftime("%m/%Y"),
    )


@app.route("/admin/finance/accounts", methods=["POST"])
@admin_required
def admin_finance_account_create():
    if not validate_csrf():
        abort(400)
    name = (request.form.get("name") or "").strip()[:80]
    institution = (request.form.get("institution") or "").strip()[:80]
    account_type = (request.form.get("account_type") or "cash").strip()
    if account_type not in {"cash","checking","savings","wallet","reserve"}:
        account_type = "cash"
    if len(name) < 2:
        flash("Informe o nome da conta/caixa.", "danger")
        return redirect(url_for("admin_finance"))
    try:
        opening = _finance_money_to_cents(request.form.get("opening_balance") or "0.01") if str(request.form.get("opening_balance") or "").strip() not in {"", "0", "0,00", "0.00"} else 0
    except ValueError as exc:
        flash(str(exc), "danger"); return redirect(url_for("admin_finance"))
    db = get_db(); now = utcnow_iso()
    row = db.execute(
        """INSERT INTO finance_accounts(name,institution,account_type,currency,opening_balance_cents,active,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?) RETURNING id""",
        (name,institution,account_type,"BRL",opening,1,session.get("user_id"),now,now),
    ).fetchone()
    account_id = int(row["id"])
    snapshot = dict(db.execute("SELECT * FROM finance_accounts WHERE id=?", (account_id,)).fetchone())
    _finance_audit(db,"account_created","account",account_id,snapshot); db.commit()
    audit("finance_account_created", {"account_id": account_id, "name": name})
    flash("Conta financeira criada.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries", methods=["POST"])
@admin_required
def admin_finance_entry_create():
    if not validate_csrf(): abort(400)
    kind = (request.form.get("kind") or "expense").strip()
    status = (request.form.get("status") or "posted").strip()
    if kind not in {"income","expense"}: kind = "expense"
    if status not in {"pending","posted"}: status = "posted"
    try:
        account_id = int(request.form.get("account_id") or 0)
        amount_cents = _finance_money_to_cents(request.form.get("amount"))
    except (ValueError, TypeError) as exc:
        flash(str(exc) if isinstance(exc, ValueError) else "Dados financeiros inválidos.", "danger")
        return redirect(url_for("admin_finance"))
    description = (request.form.get("description") or "").strip()[:180]
    if len(description) < 3:
        flash("Descreva o lançamento.", "danger"); return redirect(url_for("admin_finance"))
    occurred_on = (request.form.get("occurred_on") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", occurred_on):
        occurred_on = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db=get_db()
    account = db.execute("SELECT id FROM finance_accounts WHERE id=? AND active=1", (account_id,)).fetchone()
    if not account:
        flash("Conta financeira inválida ou inativa.", "danger"); return redirect(url_for("admin_finance"))
    now=utcnow_iso(); actor=session.get("user_id")
    row=db.execute(
        """INSERT INTO finance_entries(account_id,kind,status,amount_cents,category,description,counterparty,cost_center,payment_method,document_ref,notes,occurred_on,created_by,created_at,posted_at,posted_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (account_id,kind,status,amount_cents,(request.form.get("category") or "Geral").strip()[:80],description,
         (request.form.get("counterparty") or "").strip()[:120],(request.form.get("cost_center") or "Operação").strip()[:80],
         (request.form.get("payment_method") or "").strip()[:60],(request.form.get("document_ref") or "").strip()[:100],
         (request.form.get("notes") or "").strip()[:600],occurred_on,actor,now,now if status=="posted" else None,actor if status=="posted" else None),
    ).fetchone()
    entry_id=int(row["id"]); snapshot=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone())
    _finance_audit(db,"entry_created","entry",entry_id,snapshot); db.commit()
    audit("finance_entry_created", {"entry_id":entry_id,"kind":kind,"status":status,"amount_cents":amount_cents})
    flash("Lançamento financeiro registrado.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries/<int:entry_id>/post", methods=["POST"])
@admin_required
def admin_finance_entry_post(entry_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()
    if not row: abort(404)
    if row["status"] != "pending":
        flash("Esse lançamento não está pendente.", "warning"); return redirect(url_for("admin_finance"))
    now=utcnow_iso(); db.execute("UPDATE finance_entries SET status='posted',posted_at=?,posted_by=? WHERE id=?",(now,session.get("user_id"),entry_id))
    snapshot=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()); _finance_audit(db,"entry_posted","entry",entry_id,snapshot); db.commit()
    audit("finance_entry_posted", {"entry_id":entry_id}); flash("Lançamento confirmado no caixa.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries/<int:entry_id>/void", methods=["POST"])
@admin_required
def admin_finance_entry_void(entry_id):
    if not validate_csrf(): abort(400)
    reason=(request.form.get("reason") or "Correção administrativa").strip()[:240]
    db=get_db(); row=db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()
    if not row: abort(404)
    if row["status"] == "voided":
        flash("Lançamento já estornado.", "warning"); return redirect(url_for("admin_finance"))
    before=dict(row); now=utcnow_iso()
    db.execute("UPDATE finance_entries SET status='voided',voided_at=?,voided_by=?,void_reason=? WHERE id=?",(now,session.get("user_id"),reason,entry_id))
    after=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone())
    _finance_audit(db,"entry_voided","entry",entry_id,{"before":before,"after":after}); db.commit()
    audit("finance_entry_voided", {"entry_id":entry_id,"reason":reason}); flash("Lançamento estornado sem apagar o histórico.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/commitments", methods=["POST"])
@admin_required
def admin_finance_commitment_create():
    if not validate_csrf(): abort(400)
    name=(request.form.get("name") or "").strip()[:120]
    if len(name)<2:
        flash("Informe o nome do custo.","danger"); return redirect(url_for("admin_finance"))
    try: amount=_finance_money_to_cents(request.form.get("amount"))
    except ValueError as exc: flash(str(exc),"danger"); return redirect(url_for("admin_finance"))
    cadence=(request.form.get("cadence") or "monthly").strip()
    if cadence not in {"weekly","monthly","annual","one_off"}: cadence="monthly"
    due=(request.form.get("next_due_on") or "").strip()[:10] or None
    if due and not re.fullmatch(r"\d{4}-\d{2}-\d{2}",due): due=None
    db=get_db(); now=utcnow_iso(); actor=session.get("user_id")
    row=db.execute(
        """INSERT INTO finance_commitments(name,category,supplier,amount_cents,cadence,next_due_on,active,notes,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (name,(request.form.get("category") or "Infraestrutura").strip()[:80],(request.form.get("supplier") or "").strip()[:120],amount,cadence,due,1,(request.form.get("notes") or "").strip()[:500],actor,now,now),
    ).fetchone()
    cid=int(row["id"]); snap=dict(db.execute("SELECT * FROM finance_commitments WHERE id=?",(cid,)).fetchone()); _finance_audit(db,"commitment_created","commitment",cid,snap); db.commit()
    audit("finance_commitment_created", {"commitment_id":cid,"amount_cents":amount,"cadence":cadence}); flash("Custo declarado e auditável.","success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/commitments/<int:commitment_id>/toggle", methods=["POST"])
@admin_required
def admin_finance_commitment_toggle(commitment_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT * FROM finance_commitments WHERE id=?",(commitment_id,)).fetchone()
    if not row: abort(404)
    active=0 if int(row["active"] or 0) else 1; now=utcnow_iso()
    db.execute("UPDATE finance_commitments SET active=?,updated_at=? WHERE id=?",(active,now,commitment_id))
    snap=dict(db.execute("SELECT * FROM finance_commitments WHERE id=?",(commitment_id,)).fetchone()); _finance_audit(db,"commitment_toggled","commitment",commitment_id,snap); db.commit()
    audit("finance_commitment_toggled", {"commitment_id":commitment_id,"active":bool(active)}); return redirect(url_for("admin_finance"))


@app.route("/admin/finance/export.csv")
@admin_required
def admin_finance_export_csv():
    rows=get_db().execute(
        """SELECT e.id,e.occurred_on,e.kind,e.status,e.amount_cents,e.category,e.description,e.counterparty,e.cost_center,e.payment_method,e.document_ref,a.name account_name,e.created_at,e.posted_at,e.voided_at,e.void_reason
           FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id ORDER BY e.occurred_on DESC,e.id DESC"""
    ).fetchall()
    out=io.StringIO(); writer=csv.writer(out); writer.writerow(["id","data","tipo","status","valor_brl","categoria","descricao","contraparte","centro_custo","pagamento","documento","conta","criado_em","postado_em","estornado_em","motivo_estorno"])
    for r in rows:
        writer.writerow([r["id"],r["occurred_on"],r["kind"],r["status"],f"{int(r['amount_cents'] or 0)/100:.2f}",r["category"],r["description"],r["counterparty"],r["cost_center"],r["payment_method"],r["document_ref"],r["account_name"],r["created_at"],r["posted_at"],r["voided_at"],r["void_reason"]])
    response=app.response_class(out.getvalue(),mimetype="text/csv; charset=utf-8"); response.headers["Content-Disposition"]="attachment; filename=rairo-financeiro.csv"; return response


@app.route("/admin/finance/audit.csv")
@admin_required
def admin_finance_audit_export_csv():
    rows=get_db().execute(
        """SELECT f.id,f.created_at,f.actor_user_id,u.name actor_name,f.action,f.object_type,f.object_id,f.snapshot_sha256,f.snapshot_json
           FROM finance_audit_logs f LEFT JOIN users u ON u.id=f.actor_user_id ORDER BY f.id DESC"""
    ).fetchall()
    out=io.StringIO(); writer=csv.writer(out); writer.writerow(["id","criado_em","ator_id","ator","acao","objeto_tipo","objeto_id","sha256_evento","snapshot_json"])
    for r in rows:
        writer.writerow([r["id"],r["created_at"],r["actor_user_id"],r["actor_name"] or "Sistema",r["action"],r["object_type"],r["object_id"],r["snapshot_sha256"],r["snapshot_json"]])
    response=app.response_class(out.getvalue(),mimetype="text/csv; charset=utf-8"); response.headers["Content-Disposition"]="attachment; filename=rairo-financeiro-auditoria.csv"; return response


def _admin_dispatch_overview(hours=24):
    _ensure_node_dispatch_log_table()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, int(hours)))).isoformat()
    db = get_db()
    row = db.execute(
        """SELECT
             COUNT(*) FILTER (WHERE node_index > 0) AS node_attempts,
             COUNT(*) FILTER (WHERE node_index > 0 AND success=1) AS node_successes,
             COUNT(*) FILTER (WHERE node_index > 0 AND success=0) AS node_failures,
             COUNT(DISTINCT user_id) FILTER (WHERE node_index > 0 AND user_id IS NOT NULL) AS unique_users,
             COUNT(*) FILTER (WHERE node_index=0) AS local_fallbacks,
             COALESCE(AVG(latency_ms) FILTER (WHERE node_index > 0 AND success=1),0) AS avg_latency_ms
           FROM rairo_node_dispatch_logs WHERE created_at>=?""",
        (cutoff,),
    ).fetchone()
    attempts = int(row["node_attempts"] or 0) if row else 0
    successes = int(row["node_successes"] or 0) if row else 0
    return {
        "attempts": attempts,
        "successes": successes,
        "failures": int(row["node_failures"] or 0) if row else 0,
        "unique_users": int(row["unique_users"] or 0) if row else 0,
        "local_fallbacks": int(row["local_fallbacks"] or 0) if row else 0,
        "avg_latency_ms": round(float(row["avg_latency_ms"] or 0), 1) if row else 0,
        "success_pct": round(100 * successes / max(1, attempts), 1) if attempts else 0,
    }


def _admin_node_logs(node_index, limit=200):
    _ensure_node_dispatch_log_table()
    limit = max(1, min(500, int(limit or 200)))
    return get_db().execute(
        """SELECT l.id,l.node_index,l.node_name,l.user_id,l.request_id,l.mode,l.profile,l.prefetch,
                  l.http_status,l.success,l.latency_ms,l.error,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM rairo_node_dispatch_logs l
           LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index=?
           ORDER BY l.id DESC LIMIT ?""",
        (int(node_index), limit),
    ).fetchall()


def _admin_node_log_stats(node_index, hours=24):
    _ensure_node_dispatch_log_table()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, int(hours)))).isoformat()
    db = get_db()
    row = db.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE success=1) AS successes,
                  COUNT(*) FILTER (WHERE success=0) AS failures,
                  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users,
                  COUNT(*) FILTER (WHERE prefetch=1) AS prefetches,
                  COALESCE(AVG(latency_ms) FILTER (WHERE success=1),0) AS avg_latency_ms,
                  COALESCE(MAX(latency_ms),0) AS max_latency_ms
           FROM rairo_node_dispatch_logs WHERE node_index=? AND created_at>=?""",
        (int(node_index), cutoff),
    ).fetchone()
    total = int(row["total"] or 0) if row else 0
    successes = int(row["successes"] or 0) if row else 0
    latencies = [int(r["latency_ms"] or 0) for r in db.execute(
        "SELECT latency_ms FROM rairo_node_dispatch_logs WHERE node_index=? AND success=1 AND created_at>=? ORDER BY latency_ms",
        (int(node_index), cutoff),
    ).fetchall()]
    p95 = latencies[min(len(latencies)-1, max(0, math.ceil(len(latencies)*0.95)-1))] if latencies else 0
    return {
        "total": total,
        "successes": successes,
        "failures": int(row["failures"] or 0) if row else 0,
        "unique_users": int(row["unique_users"] or 0) if row else 0,
        "prefetches": int(row["prefetches"] or 0) if row else 0,
        "avg_latency_ms": round(float(row["avg_latency_ms"] or 0), 1) if row else 0,
        "max_latency_ms": int(row["max_latency_ms"] or 0) if row else 0,
        "p95_latency_ms": int(p95),
        "success_pct": round(100 * successes / max(1,total), 1) if total else 0,
    }


def _admin_single_node_snapshot(node_index, refresh=False):
    cfg = rairo_node_config(node_index)
    if not cfg.get("configured"):
        return _test_node_metrics(cfg, 0)
    cached = None
    with RAIRO_NODE_STATUS_LOCK:
        cached = RAIRO_NODE_STATUS_CACHE.get(cfg["id"])
    if not refresh and cached and time.time() - float(cached.get("ts",0)) < RAIRO_NODE_STATUS_TTL:
        return dict(cached["payload"])
    payload = _probe_configured_node(cfg, 0)
    with RAIRO_NODE_STATUS_LOCK:
        RAIRO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": dict(payload)}
    return payload


@app.route("/admin/benchmark")
@admin_required
def admin_benchmark():
    """Internal route lab. Browser calls /api/route with prefetch=1 so tests do not pollute route history."""
    return render_template(
        "admin_benchmark.html",
        mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "",
        mapbox_style=MAPBOX_STYLE_NIGHT or MAPBOX_STYLE_DAY,
    )


@app.route("/admin")
@admin_required
def admin_dashboard():
    db = get_db()
    now = datetime.now(timezone.utc)
    cutoff_7d = (now - timedelta(days=7)).isoformat()
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    stats = db.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM users) users,
          (SELECT COUNT(*) FROM users WHERE created_at >= ?) users_7d,
          (SELECT COUNT(*) FROM reports WHERE status='active') active_reports,
          (SELECT COUNT(*) FROM reports WHERE created_at >= ?) reports_7d,
          (SELECT COUNT(*) FROM route_history) routes,
          (SELECT COUNT(*) FROM route_history WHERE created_at >= ?) routes_today,
          (SELECT COUNT(*) FROM route_history WHERE created_at >= ?) routes_24h,
          (SELECT COALESCE(SUM(distance_m),0) FROM route_history) distance_total_m,
          (SELECT COALESCE(AVG(distance_m),0) FROM route_history WHERE created_at >= ?) avg_distance_24h_m,
          (SELECT COALESCE(AVG(duration_s),0) FROM route_history WHERE created_at >= ?) avg_duration_24h_s,
          (SELECT COUNT(*) FROM route_feedback WHERE rating='good' AND created_at >= ?) feedback_good_7d,
          (SELECT COUNT(*) FROM route_feedback WHERE rating='improve' AND created_at >= ?) feedback_improve_7d
        """,
        (cutoff_7d, cutoff_7d, day_start, cutoff_24h, cutoff_24h, cutoff_24h, cutoff_7d, cutoff_7d),
    ).fetchone()
    reports = db.execute(
        "SELECT r.*,u.name reporter_name,u.email reporter_email FROM reports r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 10"
    ).fetchall()
    product_rows = db.execute(
        """SELECT user_id,event_type,status_code,duration_ms,metadata,created_at,ip_address,user_agent,path FROM request_activity_logs
           WHERE created_at>=? ORDER BY id DESC LIMIT 16000""",
        (cutoff_24h,),
    ).fetchall()
    product_metrics = {
        "searches_24h": 0, "search_no_results_24h": 0, "navigation_starts_24h": 0, "navigation_complete_24h": 0,
        "reroutes_24h": 0, "event_detours_24h": 0, "alternative_prompts_24h": 0, "alternative_accepts_24h": 0, "alternative_auto_24h": 0,
        "traffic_worsening_24h": 0, "alerts_24h": 0, "alert_confirmations_24h": 0, "radar_warnings_24h": 0,
        "gps_weak_24h": 0, "gps_poor_24h": 0, "offline_events_24h": 0, "errors_24h": 0,
        "request_p50_ms": 0, "request_p95_ms": 0, "request_p99_ms": 0, "search_p95_ms": 0, "route_p95_ms": 0,
        "route_request_failures_24h": 0, "route_request_success_24h": 0, "privacy_pending": 0,
        "sessions_24h": 0, "reroutes_per_trip": 0.0, "false_reroutes_24h": 0, "suggested_saving_avg_min": 0.0,
        "eta_shift_avg_s": 0, "client_errors_24h": 0, "ios_errors_24h": 0, "android_errors_24h": 0, "desktop_errors_24h": 0,
        "retention_d1_pct": 0, "retention_d7_pct": 0, "retention_d30_pct": 0, "alert_not_there_24h": 0,
        "road_snaps_24h": 0, "alert_syncs_24h": 0, "nearby_notice_24h": 0,
        "search_p50_ms": 0, "search_p99_ms": 0, "route_p50_ms": 0, "route_p99_ms": 0,
    }
    request_durations, search_durations, route_durations, eta_shifts, suggested_savings = [], [], [], [], []
    session_keys = set()
    def _label_ms(value, prefix):
        try:
            raw = str(value or "")
            if not raw.startswith(prefix): return None
            return max(0, int(raw[len(prefix):].split("ms", 1)[0]))
        except Exception:
            return None
    for row in product_rows:
        et = str(row["event_type"] or "")
        try: meta = json.loads(row["metadata"] or "{}")
        except Exception: meta = {}
        label = str(meta.get("label") or "")
        try:
            dt = parse_iso(row["created_at"]); bucket = int(dt.timestamp()//1800) if dt else 0
        except Exception:
            bucket = 0
        ident = f"u:{row['user_id']}" if row["user_id"] else f"ip:{str(row['ip_address'] or 'unknown')[:64]}"
        if bucket: session_keys.add((ident,bucket))
        if et == "search" and label.startswith("results:"): product_metrics["searches_24h"] += 1
        if et == "search" and label.startswith("no-results:"): product_metrics["search_no_results_24h"] += 1
        if et == "route" and label == "navigation-start": product_metrics["navigation_starts_24h"] += 1
        if et == "route" and label.startswith("navigation-complete:"): product_metrics["navigation_complete_24h"] += 1
        if et == "route" and label in {"reroute-manual","reroute-auto"}:
            product_metrics["reroutes_24h"] += 1
        if et == "route" and label == "reroute-same-corridor":
            product_metrics["false_reroutes_24h"] += 1
        if et == "route" and label == "event-detour-applied": product_metrics["event_detours_24h"] += 1
        if et == "route" and label.startswith("alternative-prompt:"):
            product_metrics["alternative_prompts_24h"] += 1
            try: suggested_savings.append(float(label.split(":",1)[1].rstrip("m")))
            except Exception: pass
        if et == "route" and (label == "alternative-accepted" or label.startswith("alternative-manual:")): product_metrics["alternative_accepts_24h"] += 1
        if et == "route" and label.startswith("alternative-auto:"): product_metrics["alternative_auto_24h"] += 1
        if et == "traffic" and label.startswith("worsening:"): product_metrics["traffic_worsening_24h"] += 1
        if et == "alert" and label.startswith("quick-alert:"): product_metrics["alerts_24h"] += 1
        if et == "alert" and label.startswith("not-there:"): product_metrics["alert_not_there_24h"] += 1
        if et == "alert" and label.startswith("road-snap:"): product_metrics["road_snaps_24h"] += 1
        if et == "alert" and label.startswith("map-sync:"): product_metrics["alert_syncs_24h"] += 1
        if et == "ui" and label.startswith("nearby-users-notice:"): product_metrics["nearby_notice_24h"] += 1
        if et == "safety" and label.startswith("speed-camera-"): product_metrics["radar_warnings_24h"] += 1
        if et == "gps" and label == "quality:weak": product_metrics["gps_weak_24h"] += 1
        if et == "gps" and label == "quality:poor": product_metrics["gps_poor_24h"] += 1
        if et == "connectivity" and label == "offline": product_metrics["offline_events_24h"] += 1
        if et == "performance":
            if label.startswith("client-error:"):
                product_metrics["client_errors_24h"] += 1
                ua = str(row["user_agent"] or "").lower()
                if any(x in ua for x in ("iphone","ipad","ipod")): product_metrics["ios_errors_24h"] += 1
                elif "android" in ua: product_metrics["android_errors_24h"] += 1
                else: product_metrics["desktop_errors_24h"] += 1
            if label.startswith("eta-shift:"):
                try: eta_shifts.append(max(0,int(label.split(":",1)[1].split("s",1)[0])))
                except Exception: pass
            ms = _label_ms(label, "search-latency:")
            if ms is not None: search_durations.append(ms)
            ms = _label_ms(label, "route-latency:")
            if ms is not None: route_durations.append(ms)
        if et == "request":
            code = int(row["status_code"] or 0)
            if code >= 400: product_metrics["errors_24h"] += 1
            dur = int(row["duration_ms"] or 0)
            if dur >= 0: request_durations.append(dur)
    # Request rows expose path outside metadata in the table query below only in newer logs;
    # derive route success/failure with a compact dedicated SQL count for accuracy.
    try:
        route_req = db.execute("""SELECT
              SUM(CASE WHEN status_code BETWEEN 200 AND 399 THEN 1 ELSE 0 END) ok,
              SUM(CASE WHEN status_code>=400 THEN 1 ELSE 0 END) fail
            FROM request_activity_logs WHERE created_at>=? AND event_type='request' AND (path LIKE '/api/route%' OR path LIKE '/v1/route%')""", (cutoff_24h,)).fetchone()
        product_metrics["route_request_success_24h"] = int((route_req["ok"] if route_req else 0) or 0)
        product_metrics["route_request_failures_24h"] = int((route_req["fail"] if route_req else 0) or 0)
    except Exception:
        pass
    def _pct(values, q):
        if not values: return 0
        values = sorted(values); idx = min(len(values)-1, max(0, int(round((len(values)-1)*q))))
        return int(values[idx])
    product_metrics["request_p50_ms"] = _pct(request_durations, .50)
    product_metrics["request_p95_ms"] = _pct(request_durations, .95)
    product_metrics["request_p99_ms"] = _pct(request_durations, .99)
    product_metrics["search_p50_ms"] = _pct(search_durations, .50)
    product_metrics["search_p95_ms"] = _pct(search_durations, .95)
    product_metrics["search_p99_ms"] = _pct(search_durations, .99)
    product_metrics["route_p50_ms"] = _pct(route_durations, .50)
    product_metrics["route_p95_ms"] = _pct(route_durations, .95)
    product_metrics["route_p99_ms"] = _pct(route_durations, .99)
    product_metrics["sessions_24h"] = len(session_keys)
    product_metrics["reroutes_per_trip"] = round(product_metrics["reroutes_24h"] / max(1, product_metrics["navigation_starts_24h"]), 2)
    product_metrics["suggested_saving_avg_min"] = round(sum(suggested_savings)/len(suggested_savings), 1) if suggested_savings else 0.0
    product_metrics["eta_shift_avg_s"] = int(round(sum(eta_shifts)/len(eta_shifts))) if eta_shifts else 0
    try:
        product_metrics["alert_confirmations_24h"] = int(db.execute("SELECT COUNT(*) c FROM report_confirmations WHERE created_at>=?", (cutoff_24h,)).fetchone()["c"] or 0)
    except Exception:
        product_metrics["alert_confirmations_24h"] = 0
    try:
        product_metrics["privacy_pending"] = int(db.execute("SELECT COUNT(*) c FROM privacy_requests WHERE status IN ('pending','in_progress')").fetchone()["c"] or 0)
    except Exception:
        product_metrics["privacy_pending"] = 0
    # Cohort retention uses only account id + timestamps; no destination text or coordinates.
    try:
        cutoff_45 = (datetime.now(timezone.utc)-timedelta(days=45)).replace(microsecond=0).isoformat()
        cohort_users = db.execute("SELECT id,created_at FROM users WHERE created_at>=?", (cutoff_45,)).fetchall()
        act_rows = db.execute("SELECT user_id,created_at FROM request_activity_logs WHERE user_id IS NOT NULL AND created_at>=?", (cutoff_45,)).fetchall()
        act_by_user = {}
        for a in act_rows:
            try: act_by_user.setdefault(int(a["user_id"]), []).append(parse_iso(a["created_at"]))
            except Exception: pass
        now_dt = datetime.now(timezone.utc)
        for days, key in ((1,"retention_d1_pct"),(7,"retention_d7_pct"),(30,"retention_d30_pct")):
            eligible=returned=0
            for u in cohort_users:
                created=parse_iso(u["created_at"]);
                if not created or now_dt-created < timedelta(days=days+1): continue
                eligible += 1; lo=created+timedelta(days=days); hi=lo+timedelta(days=1)
                if any(t and lo<=t<hi for t in act_by_user.get(int(u["id"]), [])): returned += 1
            product_metrics[key] = int(round(returned*100/eligible)) if eligible else 0
    except Exception:
        pass
    recent_routes = db.execute(
        """SELECT rh.id,rh.origin_label,rh.destination_label,rh.mode,rh.distance_m,rh.duration_s,rh.safety_score,rh.created_at,
                  COALESCE(u.name,'Visitante') user_name
           FROM route_history rh LEFT JOIN users u ON u.id=rh.user_id
           ORDER BY rh.created_at DESC LIMIT 8"""
    ).fetchall()
    dispatch_ops = _admin_dispatch_overview(24)
    recent_dispatch_failures = db.execute(
        """SELECT l.*,COALESCE(u.name,'Visitante') AS user_name
           FROM rairo_node_dispatch_logs l LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index>0 AND l.success=0 ORDER BY l.id DESC LIMIT 8"""
    ).fetchall()
    recent_audit = db.execute(
        """SELECT a.id,a.action,a.metadata,a.created_at,COALESCE(u.name,'Sistema') AS user_name
           FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 8"""
    ).fetchall()
    infra = admin_node_snapshot(refresh=False)
    windows = _active_user_windows()
    try:
        presence_cutoff = (now - timedelta(minutes=3)).isoformat()
        presence_3m = int(db.execute("SELECT COUNT(*) c FROM nearby_presence WHERE updated_at>=?", (presence_cutoff,)).fetchone()["c"] or 0)
    except Exception:
        presence_3m = 0
    extra = {
        **windows,
        "active_users_15m": windows["active_15m"],
        "simultaneous_now": windows["active_now_5m"],
        "simultaneous_capacity": infra["summary"]["capacity"],
        "simultaneous_used": min(windows["active_now_5m"], infra["summary"]["capacity"]),
        "simultaneous_available": max(0, infra["summary"]["capacity"] - min(windows["active_now_5m"], infra["summary"]["capacity"])),
        "simultaneous_occupancy_pct": round((100 * min(windows["active_now_5m"], infra["summary"]["capacity"]) / max(1, infra["summary"]["capacity"])), 1) if infra["summary"]["capacity"] else 0,
        "simultaneous_overflow": max(0, windows["active_now_5m"] - infra["summary"]["capacity"]),
        "total_distance_km": round(float(stats["distance_total_m"] or 0) / 1000, 1),
        "avg_distance_24h_km": round(float(stats["avg_distance_24h_m"] or 0) / 1000, 1),
        "avg_duration_24h_min": round(float(stats["avg_duration_24h_s"] or 0) / 60, 1),
        "feedback_good_pct": round(100 * int(stats["feedback_good_7d"] or 0) / max(1, int(stats["feedback_good_7d"] or 0) + int(stats["feedback_improve_7d"] or 0))),
        "distributed_enabled": bool(RAIRO_DISTRIBUTED_ROUTING_ENABLED),
        "central_secret_configured": bool(CENTRAL_API_SECRET),
        "configured_nodes": int(infra["summary"]["configured_nodes"]),
        "healthy_nodes": int(infra["summary"]["healthy_nodes"]),
        "presence_3m": presence_3m,
    }
    return render_template(
        "admin.html", stats=stats, extra=extra, reports=reports, recent_routes=recent_routes,
        infra=infra, categories=CATEGORY_META, dispatch_ops=dispatch_ops, product_metrics=product_metrics,
        recent_dispatch_failures=recent_dispatch_failures, recent_audit=recent_audit,
    )


@app.route("/api/admin/servers/status")
@admin_required
def api_admin_servers_status():
    refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes", "on"}
    return jsonify(admin_node_snapshot(refresh=refresh))


@app.route("/api/admin/servers/<int:node_index>/config", methods=["GET", "POST"])
@admin_required
def api_admin_server_config(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node fora do intervalo configurado."}), 404
    if request.method == "GET":
        cfg = rairo_node_config(node_index)
        return jsonify({"ok": True, "config": cfg, "central_secret_configured": bool(CENTRAL_API_SECRET)})
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada. Atualize a página e tente novamente."}), 400
    payload = request.get_json(silent=True) or {}
    try:
        cfg = save_rairo_node_config(node_index, payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Could not save node configuration")
        return jsonify({"ok": False, "error": "Não foi possível salvar a configuração do node.", "detail": type(exc).__name__}), 500
    audit("admin_node_config_update", {"node": node_index, "url_configured": bool(cfg.get("url")), "enabled": bool(cfg.get("enabled")), "capacity": cfg.get("capacity")}, session.get("user_id"))
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/admin/servers/<int:node_index>/test", methods=["POST"])
@admin_required
def api_admin_server_test(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node fora do intervalo configurado."}), 404
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 400
    cfg = rairo_node_config(node_index)
    if not cfg.get("configured"):
        return jsonify({"ok": False, "error": "Configure a URL do node antes de testar.", "node": _test_node_metrics(cfg, 0)}), 400
    payload = _probe_configured_node(cfg, 0)
    with RAIRO_NODE_STATUS_LOCK:
        RAIRO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": dict(payload)}
    return jsonify({"ok": bool(payload.get("healthy")), "node": payload}), 200 if payload.get("healthy") else 502


@app.route("/admin/servers/<int:node_index>")
@admin_required
def admin_server_detail(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        abort(404)
    cfg = rairo_node_config(node_index)
    status = _admin_single_node_snapshot(node_index, refresh=False)
    logs = _admin_node_logs(node_index, 250)
    stats = _admin_node_log_stats(node_index, 24)
    return render_template("admin_server_detail.html", node=cfg, status=status, logs=logs, node_stats=stats)


@app.route("/api/admin/servers/<int:node_index>/details")
@admin_required
def api_admin_server_details(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node inválido."}), 404
    refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes", "on"}
    limit = max(1, min(500, int(request.args.get("limit", 120) or 120)))
    cfg = rairo_node_config(node_index)
    status = _admin_single_node_snapshot(node_index, refresh=refresh)
    logs = [dict(r) for r in _admin_node_logs(node_index, limit)]
    stats = _admin_node_log_stats(node_index, 24)
    return jsonify({"ok": True, "config": cfg, "status": status, "logs": logs, "stats": stats})


@app.route("/api/admin/servers/<int:node_index>/logs/clear", methods=["POST"])
@admin_required
def api_admin_server_logs_clear(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node inválido."}), 404
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 400
    _ensure_node_dispatch_log_table()
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS n FROM rairo_node_dispatch_logs WHERE node_index=?", (node_index,)).fetchone()
    count = int(row["n"] or 0) if row else 0
    db.execute("DELETE FROM rairo_node_dispatch_logs WHERE node_index=?", (node_index,))
    db.commit()
    audit("admin_node_logs_clear", {"node": node_index, "deleted": count}, session.get("user_id"))
    return jsonify({"ok": True, "deleted": count})


@app.route("/admin/servers/<int:node_index>/logs.csv")
@admin_required
def admin_server_logs_csv(node_index):
    if node_index < 1 or node_index > RAIRO_NODE_COUNT:
        abort(404)
    _ensure_node_dispatch_log_table()
    rows = get_db().execute(
        """SELECT l.id,l.node_index,l.node_name,l.user_id,l.request_id,l.mode,l.profile,l.prefetch,l.http_status,l.success,l.latency_ms,l.error,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM rairo_node_dispatch_logs l LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index=? ORDER BY l.id DESC LIMIT 10000""", (node_index,)
    ).fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "data", "usuario", "email", "request_id", "modo", "perfil", "prefetch", "http", "sucesso", "latencia_ms", "erro"])
    for row in rows:
        writer.writerow([
            row["id"], row["created_at"], row["user_name"], row["user_email"], row["request_id"], row["mode"], row["profile"],
            "sim" if row["prefetch"] else "nao", row["http_status"] or "", "sim" if row["success"] else "nao", row["latency_ms"], row["error"],
        ])
    response = app.response_class(output.getvalue(), mimetype="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="rairo-node-{node_index:02d}-logs.csv"'
    return response


@app.route("/admin/audit")
@admin_required
def admin_audit_logs():
    db = get_db()
    rows = db.execute(
        """SELECT a.id,a.action,a.metadata,a.created_at,COALESCE(u.name,'Sistema') AS user_name,COALESCE(u.email,'') AS user_email
           FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 400"""
    ).fetchall()
    activity_rows = db.execute(
        """SELECT l.id,l.event_type,l.method,l.path,l.endpoint,l.status_code,l.ip_address,l.user_agent,l.referrer,l.metadata,l.duration_ms,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM request_activity_logs l LEFT JOIN users u ON u.id=l.user_id
           ORDER BY l.id DESC LIMIT 1200"""
    ).fetchall()
    normalized_activity = []
    for row in activity_rows:
        item = dict(row)
        browser, os_name, device_type = _user_agent_summary(item.get("user_agent"))
        try:
            meta_obj = json.loads(item.get("metadata") or "{}")
            if not isinstance(meta_obj, dict):
                meta_obj = {}
        except Exception:
            meta_obj = {}
        label = str(meta_obj.get("label") or meta_obj.get("element_id") or meta_obj.get("target") or "").strip()
        if item.get("event_type") == "request":
            detail = str(item.get("endpoint") or item.get("path") or "Requisição")
        else:
            detail = label or str(item.get("endpoint") or item.get("path") or "Evento")
        item.update({
            "browser": browser, "os_name": os_name, "device_type": device_type,
            "metadata_obj": meta_obj, "detail": detail[:180],
        })
        normalized_activity.append(item)
    activity_stats = {
        "total": len(normalized_activity),
        "clicks": sum(1 for x in normalized_activity if x.get("event_type") == "click"),
        "unique_ips": len({x.get("ip_address") for x in normalized_activity if x.get("ip_address") and x.get("ip_address") != "unknown"}),
        "errors": sum(1 for x in normalized_activity if int(x.get("status_code") or 0) >= 400),
    }
    return render_template("admin_audit.html", audit_rows=rows, activity_rows=normalized_activity, activity_stats=activity_stats)


@app.route("/admin/users")
@admin_required
def admin_users():
    users = get_db().execute(
        "SELECT id,name,email,role,locale,is_active,created_at,last_login_at FROM users ORDER BY created_at DESC LIMIT 300"
    ).fetchall()
    return render_template("admin_users.html", users=users)


@app.route("/api/admin/users/<int:user_id>")
@admin_required
def api_admin_user_detail(user_id):
    """Admin-only compact user detail payload used by the 'Saber mais' modal."""
    db = get_db()
    user = db.execute(
        """SELECT id,name,email,role,locale,is_active,created_at,last_login_at,auth_provider,
                  age,sex,is_app_driver,route_preference,distance_unit,presence_visible,
                  map_style,map_accent,avoid_ferries,avoid_tolls,avoid_unpaved
           FROM users WHERE id=?""",
        (user_id,),
    ).fetchone()
    if not user:
        return jsonify({"error": "Usuário não encontrado."}), 404
    routes = db.execute(
        """SELECT id,origin_label,destination_label,mode,distance_m,duration_s,safety_score,created_at
           FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 10""",
        (user_id,),
    ).fetchall()
    alerts = db.execute(
        """SELECT id,category,title,address,latitude,longitude,status,confirmations,created_at
           FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 10""",
        (user_id,),
    ).fetchall()
    accesses = db.execute(
        """SELECT id,ip_address,user_agent,first_seen_at,last_seen_at,request_count
           FROM user_access_log WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 12""",
        (user_id,),
    ).fetchall()
    counts = db.execute(
        """SELECT
             (SELECT COUNT(*) FROM route_history WHERE user_id=?) AS route_count,
             (SELECT COUNT(*) FROM reports WHERE user_id=?) AS alert_count""",
        (user_id, user_id),
    ).fetchone()
    return jsonify({
        "user": dict(user),
        "routes": [dict(x) for x in routes],
        "alerts": [{**dict(x), "category_label": CATEGORY_META.get(x["category"], CATEGORY_META["other"])["label"]} for x in alerts],
        "accesses": [{
            "id": int(x["id"]),
            "browser": _user_agent_summary(x["user_agent"])[0],
            "os_name": _user_agent_summary(x["user_agent"])[1],
            "device_type": _user_agent_summary(x["user_agent"])[2],
            "ip_address": x["ip_address"],
            "created_at": x["first_seen_at"],
            "last_used_at": x["last_seen_at"],
            "request_count": int(x["request_count"] or 0),
        } for x in accesses],
        "last_ip": accesses[0]["ip_address"] if accesses else None,
        "counts": dict(counts) if counts else {"route_count": 0, "alert_count": 0},
    })


@app.route("/admin/reports")
@admin_required
def admin_reports():
    reports = get_db().execute(
        "SELECT r.*,u.name reporter_name,u.email reporter_email FROM reports r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300"
    ).fetchall()
    return render_template("admin_reports.html", reports=reports, categories=CATEGORY_META)


@app.route("/admin/reports/<int:report_id>/status", methods=["POST"])
@admin_required
def admin_report_status(report_id):
    if not validate_csrf():
        abort(400)
    status = request.form.get("status")
    if status not in {"active", "resolved", "rejected"}:
        abort(400)
    db = get_db()
    db.execute("UPDATE reports SET status=? WHERE id=?", (status, report_id))
    db.commit()
    audit("admin_report_status", {"report_id": report_id, "status": status})
    flash("Status do alerta atualizado.", "success")
    return redirect(url_for("admin_reports"))


@app.route("/admin/users/<int:user_id>/toggle", methods=["POST"])
@admin_required
def admin_user_toggle(user_id):
    if not validate_csrf():
        abort(400)
    if user_id == session.get("user_id"):
        flash("Você não pode desativar sua própria conta por aqui.", "warning")
        return redirect(url_for("admin_users"))
    db = get_db()
    row = db.execute("SELECT is_active FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("UPDATE users SET is_active=? WHERE id=?", (0 if row["is_active"] else 1, user_id))
    db.commit()
    audit("admin_user_toggle", {"target_user_id": user_id})
    flash("Usuário atualizado.", "success")
    return redirect(url_for("admin_users"))

@app.route("/admin/risk-zones", methods=["GET", "POST"])
@admin_required
def admin_risk_zones():
    db = get_db()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        neighborhood = request.form.get("neighborhood", "").strip()[:100]
        city = request.form.get("city", "São Paulo").strip()[:100]
        state = request.form.get("state", "SP").strip()[:40]
        reason = request.form.get("reason", "").strip()[:160]
        source_url = request.form.get("source_url", "").strip()[:500]
        block_routes = 1 if request.form.get("block_routes") in {"1","true","on","yes"} else 0
        try:
            danger_level = int(clamp(int(request.form.get("danger_level", 3)), 1, 5))
            radius = float(clamp(float(request.form.get("radius_m", 900)), 150, 5000))
        except (TypeError, ValueError):
            danger_level, radius = 3, 900
        if not neighborhood or not city or not reason:
            flash("Informe bairro, cidade e o motivo/fonte do risco.", "danger")
            return redirect(url_for("admin_risk_zones"))
        if not mapbox_ready():
            flash("Configure a infraestrutura de mapas para localizar o bairro automaticamente.", "danger")
            return redirect(url_for("admin_risk_zones"))
        try:
            query = ", ".join(x for x in [neighborhood, city, state, "Brasil"] if x)
            found = mapbox_forward_geocode(query, language="pt-BR")
        except Exception as exc:
            app.logger.warning("Admin neighborhood geocode failed: %s", exc)
            found = []
        if not found:
            flash("Não consegui localizar esse bairro. Revise bairro/cidade/estado.", "danger")
            return redirect(url_for("admin_risk_zones"))
        best = found[0]
        lat, lon = float(best["lat"]), float(best["lon"])
        # Existing Safety Engine uses a maximum safety level. Danger 5 => cap 0.
        level_cap = int(clamp(5-danger_level, 0, 4))
        confidence = .92 if block_routes else .84
        now = utcnow_iso()
        db.execute(
            """INSERT INTO risk_zones(name,risk_type,latitude,longitude,radius_m,level_cap,confidence,
                                      source,source_url,start_hour,end_hour,neighborhood,city,state,danger_level,
                                      block_routes,active,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"{neighborhood} · {city}", "admin_neighborhood_risk", lat, lon, radius, level_cap, confidence,
             reason, source_url, None, None, neighborhood, city, state, danger_level, block_routes, 1, now, now),
        )
        db.commit()
        audit("admin_risk_zone_create", {"neighborhood": neighborhood, "city": city, "danger_level": danger_level, "block_routes": bool(block_routes)})
        flash("Bairro/área cadastrado e aplicado ao motor de rotas.", "success")
        return redirect(url_for("admin_risk_zones"))
    zones = db.execute("SELECT * FROM risk_zones ORDER BY active DESC, block_routes DESC, danger_level DESC, updated_at DESC, id DESC LIMIT 500").fetchall()
    return render_template("admin_risk_zones.html", zones=zones)


@app.route("/admin/risk-zones/<int:zone_id>/update", methods=["POST"])
@admin_required
def admin_risk_zone_update(zone_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    row = db.execute("SELECT id FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row:
        abort(404)
    try:
        danger_level = int(clamp(int(request.form.get("danger_level", 3)), 1, 5))
        radius = float(clamp(float(request.form.get("radius_m", 900)), 150, 5000))
    except (TypeError, ValueError):
        return jsonify({"error":"Valores inválidos."}), 400
    block_routes = 1 if request.form.get("block_routes") in {"1","true","on","yes"} else 0
    level_cap = int(clamp(5-danger_level, 0, 4))
    db.execute(
        "UPDATE risk_zones SET danger_level=?,level_cap=?,radius_m=?,block_routes=?,updated_at=? WHERE id=?",
        (danger_level, level_cap, radius, block_routes, utcnow_iso(), zone_id),
    )
    db.commit()
    audit("admin_risk_zone_update", {"zone_id": zone_id, "danger_level": danger_level, "block_routes": bool(block_routes)})
    flash("Política da área atualizada.", "success")
    return redirect(url_for("admin_risk_zones"))


@app.route("/admin/risk-zones/<int:zone_id>/toggle", methods=["POST"])
@admin_required
def admin_risk_zone_toggle(zone_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT active FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row: abort(404)
    db.execute("UPDATE risk_zones SET active=?,updated_at=? WHERE id=?", (0 if row["active"] else 1, utcnow_iso(), zone_id)); db.commit()
    audit("admin_risk_zone_toggle", {"zone_id": zone_id}); flash("Área atualizada.", "success")
    return redirect(url_for("admin_risk_zones"))



@app.route("/admin/risk-zones/<int:zone_id>/delete", methods=["POST"])
@admin_required
def admin_risk_zone_delete(zone_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    row = db.execute("SELECT id,name FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("DELETE FROM risk_zones WHERE id=?", (zone_id,))
    db.commit()
    audit("admin_risk_zone_delete", {"zone_id": zone_id, "name": row["name"]})
    flash("Zona removida.", "success")
    return redirect(url_for("admin_risk_zones"))

# -----------------------------
# API
# -----------------------------

@app.route("/api/presence", methods=["POST"])
def api_presence_update():
    user = current_user()
    if not user:
        return jsonify({"ok": True, "published": False, "reason": "login"})
    if not validate_csrf():
        abort(400)
    if not (int(user["presence_visible"] or 0) == 1 and int(user["is_app_driver"] or 0) == 1 and int(user["age"] or 0) >= 18 and user["presence_terms_accepted_at"]):
        get_db().execute("DELETE FROM nearby_presence WHERE user_id=?", (user["id"],))
        get_db().commit()
        return jsonify({"ok": True, "published": False, "reason": "private"})
    data = request.get_json(silent=True) or {}
    try:
        lat, lon = float(data.get("lat")), float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    # Aproximadamente 100 m por célula em latitude. Nunca persistimos o GPS exato.
    qlat, qlon = round(lat, 3), round(lon, 3)
    db = get_db()
    db.execute(
        """INSERT INTO nearby_presence(user_id,cell_lat,cell_lon,updated_at) VALUES(?,?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET cell_lat=excluded.cell_lat,cell_lon=excluded.cell_lon,updated_at=excluded.updated_at""",
        (user["id"], qlat, qlon, utcnow_iso()),
    )
    db.commit()
    return jsonify({"ok": True, "published": True})


@app.route("/api/nearby-drivers")
def api_nearby_drivers():
    viewer = current_user()
    if not viewer:
        return jsonify({"drivers": []})
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"drivers": []})
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    db = get_db()
    rows = db.execute(
        """SELECT p.user_id,p.cell_lat,p.cell_lon,p.updated_at
           FROM nearby_presence p JOIN users u ON u.id=p.user_id
           WHERE p.updated_at>=? AND u.is_active=1 AND u.is_app_driver=1 AND u.presence_visible=1 AND u.presence_terms_accepted_at IS NOT NULL AND u.id<>?
           LIMIT 120""",
        (cutoff, viewer["id"]),
    ).fetchall()
    out = []
    for row in rows:
        d = haversine_m(lat, lon, float(row["cell_lat"]), float(row["cell_lon"]))
        if d <= 1500:
            out.append({"id": f"driver-{row['user_id']}", "lat": row["cell_lat"], "lon": row["cell_lon"], "distance_m": round(d), "label": "Motorista próximo"})
    out.sort(key=lambda x: x["distance_m"])
    return jsonify({"drivers": out[:40], "privacy": "Posições aproximadas; somente motoristas adultos que ativaram presença."})


@app.route("/api/nearby-users-summary")
def api_nearby_users_summary():
    """Return only an aggregate nearby-presence count for the map notice.

    Presence rows are already approximate (~100 m cells) and opt-in. This
    endpoint deliberately exposes no user ids or coordinates, so guests can
    see honest nearby activity without receiving another person's position.
    """
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"count": 0})
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"count": 0})

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    viewer = current_user()
    params = [cutoff]
    exclude_sql = ""
    if viewer:
        exclude_sql = " AND u.id<>?"
        params.append(viewer["id"])

    rows = get_db().execute(
        f"""SELECT p.cell_lat,p.cell_lon
            FROM nearby_presence p JOIN users u ON u.id=p.user_id
            WHERE p.updated_at>=? AND u.is_active=1 AND u.is_app_driver=1
              AND u.presence_visible=1 AND u.presence_terms_accepted_at IS NOT NULL
              {exclude_sql}
            LIMIT 160""",
        tuple(params),
    ).fetchall()
    count = sum(
        1 for row in rows
        if haversine_m(lat, lon, float(row["cell_lat"]), float(row["cell_lon"])) <= 1500
    )
    return jsonify({
        "count": min(count, 120),
        "radius_m": 1500,
        "fresh_for_minutes": 3,
        "privacy": "Contagem agregada de presenças aproximadas e voluntárias; nenhuma posição é retornada.",
    })


@app.route("/api/recent-destinations")
def api_recent_destinations():
    user = current_user()
    if not user:
        return jsonify({"results": []})
    # Rank by recency + frequency + hour-of-day affinity instead of returning a
    # purely chronological list. This keeps the quick-destination surface useful
    # without storing any extra location history beyond the existing route rows.
    rows = get_db().execute(
        """
        SELECT destination_label, destination_lat, destination_lon, created_at
        FROM route_history
        WHERE user_id=? AND destination_label<>''
        ORDER BY created_at DESC
        LIMIT 120
        """,
        (user["id"],),
    ).fetchall()
    now = datetime.now()
    buckets = {}
    for row in rows:
        label = str(row["destination_label"] or "").strip()
        if not label:
            continue
        key = (label, round(float(row["destination_lat"] or 0), 5), round(float(row["destination_lon"] or 0), 5))
        item = buckets.setdefault(key, {
            "label": label,
            "lat": row["destination_lat"],
            "lon": row["destination_lon"],
            "uses": 0,
            "latest": None,
            "hour_hits": 0,
        })
        item["uses"] += 1
        dt = parse_iso(row["created_at"])
        if dt:
            if item["latest"] is None or dt > item["latest"]:
                item["latest"] = dt
            hour_delta = min((dt.hour - now.hour) % 24, (now.hour - dt.hour) % 24)
            if hour_delta <= 1:
                item["hour_hits"] += 1
    ranked = []
    for item in buckets.values():
        latest = item.pop("latest", None)
        age_h = max(0.0, (now - latest.replace(tzinfo=None)).total_seconds() / 3600.0) if latest else 9999.0
        recency = max(0.0, 34.0 - min(34.0, age_h / 5.0))
        frequency = min(42.0, item["uses"] * 5.5)
        hour_affinity = min(24.0, item.pop("hour_hits", 0) * 8.0)
        item["smart_score"] = round(recency + frequency + hour_affinity, 1)
        item["reason"] = "Bom para este horário" if hour_affinity >= 8 else ("Destino frequente" if item["uses"] >= 3 else "Usado recentemente")
        ranked.append(item)
    ranked.sort(key=lambda x: (-x["smart_score"], -x["uses"], x["label"].lower()))
    return jsonify({"results": ranked[:6]})


@app.route("/api/geocode")
def api_geocode():
    if not rate_limit("geocode", 90, 60):
        return jsonify({"error": "Muitas buscas. Aguarde um pouco."}), 429
    q = request.args.get("q", "").strip()
    if len(q) < 3 or len(q) > 240:
        return jsonify({"error": "Digite um endereço, cidade ou CEP válido."}), 400
    proximity = None
    try:
        if request.args.get("proximity_lat") and request.args.get("proximity_lon"):
            plat = float(request.args["proximity_lat"]); plon = float(request.args["proximity_lon"])
            if -90 <= plat <= 90 and -180 <= plon <= 180:
                proximity = (plon, plat)
    except ValueError:
        proximity = None
    try:
        results = smart_location_search(q, proximity=proximity)
        providers = sorted({str(x.get("source") or "mapbox") for x in results})
        return jsonify({"results": results, "provider": "+".join(providers) or "search", "query": parse_brazil_location_query(q)})
    except Exception as exc:
        return jsonify({"error": "Busca de endereço temporariamente indisponível.", "detail": str(exc)}), 502


@app.route("/api/reverse")
def api_reverse():
    if not rate_limit("reverse", 45, 60):
        return jsonify({"error": "Muitas buscas."}), 429
    try:
        lat = float(request.args.get("lat", "")); lon = float(request.args.get("lon", ""))
    except ValueError:
        return jsonify({"error": "Coordenadas inválidas."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    try:
        return jsonify({"label": mapbox_reverse_geocode(lon, lat), "provider": "mapbox"})
    except Exception as exc:
        return jsonify({"label": f"{lat:.5f}, {lon:.5f}", "warning": str(exc)})


@app.route("/api/snap-road", methods=["POST"])
@login_required
def api_snap_road():
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("snap-road", 50, 60):
        return jsonify({"ok": False, "error": "Muitas tentativas de ajuste de via."}), 429
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get("lat")); lon = float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400
    hit = snap_alert_to_nearest_road(lat, lon)
    if not hit:
        return jsonify({"ok": False, "error": "Nenhuma via dirigível encontrada próxima deste ponto."}), 404
    return jsonify({"ok": True, **hit})


@app.route("/api/alerts/quick", methods=["POST"])
def api_alert_quick():
    """Create a compact map alert and always return JSON to the map client."""
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Entre na sua conta para enviar um alerta."}), 401
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada. Atualize a página e tente novamente."}), 400
    if not rate_limit("quick-alert", 8, 300):
        return jsonify({"ok": False, "error": "Muitos alertas em pouco tempo. Aguarde alguns minutos."}), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "Dados do alerta inválidos."}), 400

    category = str(data.get("category") or "other").strip()
    if category not in CATEGORY_META:
        category = "other"
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400

    # Fast path while navigating: the client may send the point already projected
    # onto the active route geometry. We only accept it when it stays close to the
    # raw GPS fix, so a stale/bad client cannot move an alert far away.
    road_hit = None
    snap_source = str(data.get("snap_source") or "").strip().lower()
    if snap_source == "active-route":
        try:
            hint_lat = float(data.get("snap_lat"))
            hint_lon = float(data.get("snap_lon"))
            accuracy = float(data.get("accuracy") or 35.0)
            hint_distance = haversine_m(lat, lon, hint_lat, hint_lon)
            hint_limit = max(45.0, min(160.0, max(6.0, accuracy) * 2.2))
            if -90 <= hint_lat <= 90 and -180 <= hint_lon <= 180 and hint_distance <= hint_limit:
                road_hit = {
                    "lat": hint_lat, "lon": hint_lon, "distance_m": hint_distance,
                    "road_name": "", "highway": "route", "osm_way_id": "",
                    "source": "active-route",
                }
        except (TypeError, ValueError):
            road_hit = None
    if road_hit is None:
        road_hit = snap_alert_to_nearest_road(lat, lon)
    if not road_hit:
        return jsonify({"ok": False, "error": "Não foi possível fixar o alerta em uma via próxima. Tente novamente."}), 503
    lat, lon = road_hit["lat"], road_hit["lon"]

    severity_by_category = {
        "robbery": 5, "harassment": 4, "poor_lighting": 3, "accident": 4, "traffic": 3,
        "road_block": 4, "blitz": 2, "speed_camera": 2, "road_hazard": 3, "pothole": 3,
        "stopped_vehicle": 3, "object_on_road": 4, "broken_signal": 3, "flood": 4,
        "construction": 3, "crowd": 2, "other": 3,
    }
    ttl_hours = {"robbery": 4, "harassment": 6, "poor_lighting": 48, "traffic": 4, "blitz": 4, "speed_camera": 8, "road_block": 12, "accident": 16, "flood": 18, "road_hazard": 16, "pothole": 36, "stopped_vehicle": 6, "object_on_road": 8, "broken_signal": 12, "construction": 24, "crowd": 8}
    severity = severity_by_category.get(category, 3)
    severity = max(1, int(round(severity * report_author_weight(user["id"]))))
    label = CATEGORY_META.get(category, CATEGORY_META["other"])["label"]
    now = datetime.now(timezone.utc)
    created_at = now.replace(microsecond=0).isoformat()
    expires_at = (now + timedelta(hours=ttl_hours.get(category, 8))).replace(microsecond=0).isoformat()
    db = get_db()

    # Same user + same category + almost same point in the last 90 seconds = reuse it.
    cutoff = (now - timedelta(seconds=90)).replace(microsecond=0).isoformat()
    recent = db.execute(
        """SELECT id,latitude,longitude FROM reports
           WHERE user_id=? AND category=? AND status='active' AND created_at>=?
           ORDER BY created_at DESC LIMIT 8""",
        (user["id"], category, cutoff),
    ).fetchall()
    for row in recent:
        if haversine_m(lat, lon, float(row["latitude"]), float(row["longitude"])) <= 120:
            return jsonify({"ok": True, "duplicate": True, "id": row["id"], "category": category, "category_label": label, "severity": severity, "lat": float(row["latitude"]), "lon": float(row["longitude"]), "created_at": created_at, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1), "road_name": road_hit.get("road_name") or "", "snap_source": road_hit.get("source") or ""})

    cur = db.execute(
        """INSERT INTO reports(user_id,category,title,description,severity,latitude,longitude,address,status,created_at,expires_at,road_snapped,snap_distance_m,road_name)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user["id"], category, label, "", severity, lat, lon, road_hit.get("road_name") or "", "active", created_at, expires_at, 1, round(road_hit["distance_m"], 1), road_hit.get("road_name") or ""),
    )
    db.commit()
    report_id = cur.lastrowid
    invalidate_route_context("reports")
    audit("quick_alert_created", {"report_id": report_id, "category": category, "severity": severity, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1)})
    record_activity("alert", {"label": "road-snap:quick", "target": "quick-alert", "snap_distance_m": round(road_hit["distance_m"], 1)}, status_code=201, method="EVENT", path="/api/alerts/quick", endpoint="api_alert_quick")
    return jsonify({
        "ok": True, "duplicate": False, "id": report_id, "category": category,
        "category_label": label, "severity": severity, "lat": lat, "lon": lon,
        "created_at": created_at, "expires_at": expires_at, "road_snapped": True,
        "snap_distance_m": round(road_hit["distance_m"], 1), "road_name": road_hit.get("road_name") or "",
        "snap_source": road_hit.get("source") or "",
    }), 201


@app.route("/api/alerts/<int:report_id>/confirm", methods=["POST"])
@login_required
def api_confirm_alert(report_id):
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    db = get_db()
    report = db.execute("SELECT id,status FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        return jsonify({"ok": False, "error": "Alerta não está mais ativo."}), 404
    already = False
    try:
        db.execute("INSERT INTO report_confirmations(report_id,user_id,created_at) VALUES(?,?,?)", (report_id, session["user_id"], utcnow_iso()))
        db.execute("UPDATE reports SET confirmations=confirmations+1 WHERE id=?", (report_id,))
        db.commit()
        invalidate_route_context("reports")
    except IntegrityError:
        db.rollback(); already = True
    row = db.execute("SELECT confirmations FROM reports WHERE id=?", (report_id,)).fetchone()
    audit("map_alert_confirmed", {"report_id": report_id, "already": already})
    return jsonify({"ok": True, "already_confirmed": already, "confirmations": int(row["confirmations"] or 0) if row else 0})


@app.route("/api/alerts/<int:report_id>/not-there", methods=["POST"])
@login_required
def api_alert_not_there(report_id):
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("alert-not-there", 40, 3600):
        return jsonify({"ok": False, "error": "Aguarde antes de avaliar mais alertas."}), 429
    db = get_db()
    report = db.execute("SELECT id,status,confirmations FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        return jsonify({"ok": False, "error": "Alerta não está mais ativo."}), 404
    already = False
    try:
        db.execute("INSERT INTO report_absence_votes(report_id,user_id,created_at) VALUES(?,?,?)", (report_id, session["user_id"], utcnow_iso()))
        db.commit()
        invalidate_route_context("reports")
    except IntegrityError:
        db.rollback(); already = True
    row = db.execute("SELECT COUNT(*) c FROM report_absence_votes WHERE report_id=?", (report_id,)).fetchone()
    votes = int(row["c"] or 0)
    confirmations = int(report["confirmations"] or 0)
    resolved = bool(votes >= 5 or (votes >= 3 and confirmations <= 1))
    if resolved:
        db.execute("UPDATE reports SET status='resolved' WHERE id=? AND status='active'", (report_id,)); db.commit(); invalidate_route_context("reports")
    audit("map_alert_not_there", {"report_id": report_id, "votes": votes, "resolved": resolved, "already": already})
    return jsonify({"ok": True, "already_voted": already, "absence_votes": votes, "resolved": resolved})


@app.route("/api/alerts")
def api_alerts():
    try:
        min_lat = float(request.args.get("min_lat", -90))
        min_lon = float(request.args.get("min_lon", -180))
        max_lat = float(request.args.get("max_lat", 90))
        max_lon = float(request.args.get("max_lon", 180))
    except ValueError:
        return jsonify({"error": "Limites inválidos."}), 400

    rows = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    snap_updates = _resnap_visible_report_rows(rows, limit=6)
    items = []
    now = datetime.now(timezone.utc)
    for r in rows:
        try:
            created = datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00")); age_h = max(0.0, (now-created).total_seconds()/3600.0)
        except Exception:
            age_h = 24.0
        confirmations = int(r["confirmations"] or 0)
        absence_votes = int(r.get("absence_votes") or 0)
        confidence = int(clamp(48 + confirmations*12 - absence_votes*15 - min(28, age_h*2.2), 5, 99))
        snapped = snap_updates.get(int(r["id"])) if snap_updates else None
        # Never render a legacy raw-GPS report off-road. If an older row cannot
        # be snapped right now, it stays hidden until a road projection succeeds.
        if not snapped and int(_row_value(r, "road_snapped", 0) or 0) != 1:
            continue
        alert_lat = snapped["lat"] if snapped else r["latitude"]
        alert_lon = snapped["lon"] if snapped else r["longitude"]
        items.append({
            "id": r["id"], "category": r["category"], "category_label": CATEGORY_META.get(r["category"], CATEGORY_META["other"])["label"],
            "title": r["title"], "description": r["description"], "severity": r["severity"],
            "lat": alert_lat, "lon": alert_lon, "address": (snapped.get("road_name") if snapped else (_row_value(r, "road_name", "") or r["address"])),
            "road_snapped": bool(snapped or int(_row_value(r, "road_snapped", 0) or 0)),
            "created_at": r["created_at"], "confirmations": confirmations, "absence_votes": absence_votes, "confidence": confidence,
        })
    response = jsonify({"alerts": items, "generated_at": utcnow_iso()})
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response



@app.route("/api/weather-now")
def api_weather_now():
    """Small, cached weather endpoint used only to choose the environmental map style."""
    if not rate_limit("weather-now", 30, 60):
        return jsonify({"available": False, "error": "rate_limited"}), 429
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"available": False, "error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"available": False, "error": "Localização inválida."}), 400
    weather = open_meteo_current(lat, lon)
    code = int(weather.get("weather_code") or 0) if weather.get("available") else 0
    wet_codes = {51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99}
    rainy = bool(
        weather.get("available") and (
            float(weather.get("precipitation_mm") or 0) > 0.05
            or float(weather.get("rain_mm") or 0) > 0.05
            or float(weather.get("showers_mm") or 0) > 0.05
            or code in wet_codes
        )
    )
    return jsonify({
        "available": bool(weather.get("available")),
        "rainy": rainy,
        "is_day": weather.get("is_day"),
        "weather_code": weather.get("weather_code"),
        "precipitation_mm": weather.get("precipitation_mm"),
        "temperature_c": weather.get("temperature_c"),
        "time": weather.get("time"),
    })


@app.route("/api/live-context")
def api_live_context():
    if not rate_limit("live-context", 24, 60):
        return jsonify({"error": "Muitas atualizações do contexto ao vivo. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 900))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    radius = int(clamp(radius, 450, 1800))
    with ThreadPoolExecutor(max_workers=2) as pool:
        weather_future = pool.submit(open_meteo_current, lat, lon)
        road_future = pool.submit(overpass_live_road_context, lat, lon, min(radius, 1300))
        weather = weather_future.result()
        road = road_future.result()
    community = community_context(lat, lon, radius)
    flow = query_live_flow(lat, lon, min(3200, radius * 2))
    important = sorted(
        [*road, *community],
        key=lambda x: (-int(x.get("severity") or 0), haversine_m(lat, lon, float(x.get("lat") or lat), float(x.get("lon") or lon)))
    )[:100]
    return jsonify({
        "updated_at": utcnow_iso(),
        "weather": weather,
        "road_context": road,
        "community": community,
        "live_flow": flow,
        "important": important,
        "sources": [
            {"id": "open-meteo", "kind": "weather", "credential": "none", "freshness": "current-model"},
            {"id": "openstreetmap-overpass", "kind": "road-map", "credential": "none", "freshness": "mapped"},
            {"id": "rairo-community", "kind": "user-reports", "credential": "internal", "freshness": "recent"},
            {"id": "rairo-live-flow", "kind": "anonymous-speed-aggregate", "credential": "internal", "freshness": "20-min"},
        ],
        "disclaimer": "Tempo e tráfego são estimativas. Dados OSM são mapeados e podem não refletir mudanças momentâneas; alertas comunitários precisam de confirmação.",
    })



def overpass_parking_nearby(lat, lon, radius=1400):
    """Busca estacionamentos mapeados perto do destino usando OpenStreetMap."""
    radius = int(clamp(radius, 350, 2500))
    key = (round(float(lat), 3), round(float(lon), 3), int(radius / 250) * 250)
    now = time.time()
    with PARKING_LOCK:
        cached = PARKING_CACHE.get(key)
        if cached and now - cached[0] < 600:
            return copy.deepcopy(cached[1])
    query = f'''[out:json][timeout:10];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"="parking"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"="parking_entrance"];
);
out center tags 90;'''
    elements = (_overpass_query_json(query, timeout=9).get("elements") or [])
    items, seen = [], set()
    for el in elements:
        center = _element_center(el)
        if not center:
            continue
        plat, plon = center
        tags = el.get("tags") or {}
        straight = haversine_m(float(lat), float(lon), plat, plon)
        if straight > radius * 1.1:
            continue
        name = str(tags.get("name") or tags.get("operator") or "Estacionamento")[:100]
        access = str(tags.get("access") or "")[:30]
        fee = str(tags.get("fee") or "")[:20]
        capacity = tags.get("capacity")
        parking_type = str(tags.get("parking") or tags.get("parking_space") or "")[:40]
        k = (round(plat, 5), round(plon, 5), name.lower())
        if k in seen:
            continue
        seen.add(k)
        items.append({
            "id": f"osm-{el.get('type','x')}-{el.get('id','')}",
            "name": name,
            "lat": float(plat), "lon": float(plon),
            "distance_straight_m": round(straight),
            "access": access, "fee": fee, "capacity": capacity,
            "parking_type": parking_type, "source": "openstreetmap",
        })
    if len(items) < 3:
        for poi in _mapbox_nearby_pois(["estacionamento", "parking"], lat, lon, radius, limit=12):
            plat, plon = float(poi["lat"]), float(poi["lon"])
            name = str(poi.get("name") or "Estacionamento")[:100]
            k = (round(plat, 5), round(plon, 5), name.lower())
            if k in seen:
                continue
            seen.add(k)
            items.append({
                "id": f"mapbox-{poi.get('mapbox_id') or len(items)}", "name": name,
                "lat": plat, "lon": plon,
                "distance_straight_m": round(float(poi.get("distance_m") or haversine_m(float(lat), float(lon), plat, plon))),
                "access": "", "fee": "", "capacity": None, "parking_type": "",
                "source": "mapbox-searchbox",
            })
    items.sort(key=lambda x: x["distance_straight_m"])
    result = items[:10]
    with PARKING_LOCK:
        PARKING_CACHE[key] = (now, copy.deepcopy(result))
        if len(PARKING_CACHE) > 500:
            stale = sorted(PARKING_CACHE.items(), key=lambda kv: kv[1][0])[:120]
            for ck, _ in stale:
                PARKING_CACHE.pop(ck, None)
    return result


def parking_with_walk_eta(dest_lat, dest_lon, radius=1400, limit=4):
    candidates = overpass_parking_nearby(dest_lat, dest_lon, radius)[: max(5, limit + 2)]
    if not candidates:
        return []

    def enrich(item):
        out = dict(item)
        try:
            routes = mapbox_routes(
                item["lon"], item["lat"], float(dest_lon), float(dest_lat),
                travel_profile="walking", alternatives=False,
            )
            route = routes[0] if routes else None
            if route:
                out["walk_seconds"] = round(float(route.get("duration") or 0))
                out["walk_minutes"] = max(1, round(float(route.get("duration") or 0) / 60))
                out["walk_distance_m"] = round(float(route.get("distance") or 0))
        except Exception:
            pass
        if not out.get("walk_minutes"):
            out["walk_distance_m"] = int(out.get("distance_straight_m") or 0)
            out["walk_minutes"] = max(1, round(out["walk_distance_m"] / 82.0))
            out["walk_estimated"] = True
        return out

    with ThreadPoolExecutor(max_workers=min(4, len(candidates))) as pool:
        enriched = list(pool.map(enrich, candidates))
    enriched.sort(key=lambda x: (int(x.get("walk_minutes") or 999), int(x.get("walk_distance_m") or 999999)))
    return enriched[:limit]


@app.route("/api/parking-nearby")
def api_parking_nearby():
    if not rate_limit("parking-nearby", 20, 60):
        return jsonify({"error": "Muitas buscas de estacionamento. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 1400))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Destino inválido."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Destino inválido."}), 400
    items = parking_with_walk_eta(lat, lon, radius=radius, limit=4)
    return jsonify({
        "items": items,
        "source": "openstreetmap/mapbox-poi+mapbox-walking",
        "coverage": "mapped-data",
        "disclaimer": "Estacionamentos usam dados mapeados do OpenStreetMap e, quando necessário, POIs do provedor de mapas. O tempo a pé usa o serviço de rotas quando disponível; não informa vagas livres em tempo real.",
    })

@app.route("/api/live-flow/probe", methods=["POST"])
def api_live_flow_probe():
    if not rate_limit("live-flow-probe", 12, 60):
        return jsonify({"ok": True, "stored": False, "reason": "rate"})
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    if str(payload.get("profile") or "") != "driving":
        return jsonify({"ok": True, "stored": False, "reason": "profile"})
    try:
        lat = float(payload["lat"]); lon = float(payload["lon"])
        speed_kmh = float(payload.get("speed_kmh", 0))
        accuracy = float(payload.get("accuracy", 999))
        heading = payload.get("heading")
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Amostra inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or not (0 <= speed_kmh <= 180) or accuracy > 80:
        return jsonify({"ok": True, "stored": False, "reason": "quality"})
    cell_lat, cell_lon = store_flow_probe(lat, lon, speed_kmh, heading)
    return jsonify({
        "ok": True, "stored": True,
        "privacy": "A coordenada exata não é armazenada; somente uma célula aproximada e um identificador efêmero sem user_id.",
        "cell": [cell_lon, cell_lat],
    })

@app.route("/api/road-awareness")
def api_road_awareness():
    if not rate_limit("road-awareness", 45, 60):
        return jsonify({"error": "Muitas consultas de sinalização. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 320))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    items = overpass_road_awareness(lat, lon, radius)
    return jsonify({
        "items": items,
        "coverage": "mapped-data",
        "disclaimer": "A sinalização depende da cobertura cartográfica disponível e pode estar incompleta ou desatualizada.",
    })


@app.route("/api/support-points")
def api_support_points():
    if not rate_limit("support-points", 18, 60):
        return jsonify({"error": "Muitas buscas de pontos de apoio. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 1800))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    items = overpass_support_points(lat, lon, radius)
    return jsonify({
        "items": items,
        "coverage": "mapped-data",
        "disclaimer": "São pontos de apoio mapeados, não uma garantia de segurança, funcionamento ou atendimento.",
    })


@app.route("/api/share-route", methods=["POST"])
def create_shared_route():
    if not rate_limit("share_route", 18, 60):
        return jsonify({"error": "Muitos links criados. Aguarde um instante."}), 429
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    route = payload.get("route") or {}
    geometry = route.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if geometry.get("type") != "LineString" or len(coords) < 2 or len(coords) > 30000:
        return jsonify({"error": "Rota inválida para compartilhamento."}), 400
    try:
        origin = payload.get("origin") or {}; destination = payload.get("destination") or {}
        olat, olon = float(origin["lat"]), float(origin["lon"])
        dlat, dlon = float(destination["lat"]), float(destination["lon"])
    except Exception:
        return jsonify({"error": "Origem ou destino inválidos."}), 400
    if not (-90 <= olat <= 90 and -90 <= dlat <= 90 and -180 <= olon <= 180 and -180 <= dlon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    profile = str(payload.get("profile") or route.get("profile") or "walking")[:20]
    if profile not in {"walking", "cycling", "driving", "motorcycle"}: profile = "walking"
    mode = str(payload.get("mode") or "safest")[:20]
    if mode not in {"safest", "fastest", "quietest", "smart"}: mode = "safest"
    # Mantém somente campos necessários para exibir e reutilizar a rota.
    safe_route = {
        "id": 0,
        "distance": float(route.get("distance") or 0),
        "duration": float(route.get("duration") or 0),
        "duration_min": float(route.get("duration_min") or (float(route.get("duration") or 0)/60.0)),
        "geometry": {"type": "LineString", "coordinates": coords},
        "steps": (route.get("steps") or [])[:700],
        "profile": profile,
        "safety_score": float(route.get("safety_score") or 0),
        "safety_level": int(clamp(float(route.get("safety_level") or 3), 0, 5)),
        "safety_level_label": str(route.get("safety_level_label") or "Estimativa")[:80],
        "traffic_score": float(route.get("traffic_score") or 0),
        "traffic_level": str(route.get("traffic_level") or "—")[:40],
        "nearby_alerts": (route.get("nearby_alerts") or [])[:40],
        "risk_zones": (route.get("risk_zones") or [])[:30],
        "road_controls": (route.get("road_controls") or [])[:500],
        "road_controls_count": int(route.get("road_controls_count") or 0),
        "micro_route": bool(route.get("micro_route")),
        "micro_avoided_points": int(route.get("micro_avoided_points") or 0),
        "badges": list(route.get("badges") or [])[:6],
        "routing_provider": str(route.get("routing_provider") or "")[:80],
        "shared": True,
    }
    token = secrets.token_urlsafe(22)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=30)).replace(microsecond=0).isoformat()
    db = get_db()
    db.execute("""
        INSERT INTO shared_routes(token,creator_user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,profile,mode,route_json,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (token, session.get("user_id"), str(origin.get("label") or "Origem")[:180], str(destination.get("label") or "Destino")[:180], olat, olon, dlat, dlon, profile, mode, json.dumps(safe_route, separators=(",", ":")), now.replace(microsecond=0).isoformat(), expires))
    db.commit()
    url = request.host_url.rstrip("/") + url_for("shared_route_view", token=token)
    return jsonify({"url": url, "token": token, "expires_at": expires})


def get_shared_route_or_404(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token or ""):
        abort(404)
    row = get_db().execute("SELECT * FROM shared_routes WHERE token=?", (token,)).fetchone()
    if not row:
        abort(404)
    try:
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc): abort(404)
    except ValueError:
        abort(404)
    return row


@app.route("/route/share/<token>")
def shared_route_view(token):
    row = get_shared_route_or_404(token)
    try: route = json.loads(row["route_json"])
    except Exception: abort(404)
    return render_template("shared_route.html", share=row, route=route, mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "", mapbox_style=MAPBOX_STYLE, mapbox_style_night=MAPBOX_STYLE_NIGHT, mapbox_ready=mapbox_ready())


@app.route("/api/shared-route/<token>")
def shared_route_api(token):
    row = get_shared_route_or_404(token)
    try: route = json.loads(row["route_json"])
    except Exception: abort(404)
    return jsonify({
        "token": token, "route": route, "profile": row["profile"], "mode": row["mode"],
        "origin": {"lat": row["origin_lat"], "lon": row["origin_lon"], "label": row["origin_label"]},
        "destination": {"lat": row["destination_lat"], "lon": row["destination_lon"], "label": row["destination_label"]},
    })


@app.route("/route/share/<token>/use")
def use_shared_route(token):
    row = get_shared_route_or_404(token)
    if not session.get("user_id"):
        return redirect(url_for("login", next=url_for("use_shared_route", token=token)))
    db = get_db()
    db.execute("UPDATE shared_routes SET uses_count=uses_count+1 WHERE id=?", (row["id"],))
    try:
        route = json.loads(row["route_json"])
        db.execute("""
            INSERT INTO route_history(user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,mode,distance_m,duration_s,safety_score,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (session.get("user_id"), row["origin_label"], row["destination_label"], row["origin_lat"], row["origin_lon"], row["destination_lat"], row["destination_lon"], row["mode"], float(route.get("distance") or 0), float(route.get("duration") or 0), float(route.get("safety_score") or 0), utcnow_iso()))
    except Exception:
        pass
    db.commit()
    return redirect(url_for("index", shared=token))



@app.route("/api/event-route-check", methods=["POST"])
def event_route_check():
    """Proactively detect event pressure and propose a real road detour.

    Venue presence alone never triggers a detour. The engine requires live traffic,
    recent crowd/road reports, or a configured active event feed. This keeps a
    stadium on an ordinary day from changing the route.
    """
    if not validate_csrf():
        abort(400)
    if not RAIRO_EVENT_INTELLIGENCE_ENABLED:
        return jsonify({"active":False,"enabled":False,"events":[],"recommend":False})
    if not rate_limit("event_route_check", 10, 60):
        return jsonify({"error":"Checagens de evento muito frequentes."}),429
    payload=request.get_json(silent=True) or {}
    try:
        slat=float(payload["current_lat"]);slon=float(payload["current_lon"]);elat=float(payload["destination_lat"]);elon=float(payload["destination_lon"])
    except Exception:
        return jsonify({"error":"Posição atual ou destino inválidos."}),400
    if not (-90<=slat<=90 and -90<=elat<=90 and -180<=slon<=180 and -180<=elon<=180):
        return jsonify({"error":"Coordenadas inválidas."}),400
    direct_km=haversine_m(slat,slon,elat,elon)/1000.0
    if direct_km>RAIGO_EVENT_SCAN_MAX_KM:
        return jsonify({"active":False,"events":[],"recommend":False,"skipped":"long_distance"})
    profile=str(payload.get("profile") or "driving").strip().lower()
    if profile not in {"driving","motorcycle"}:
        return jsonify({"active":False,"events":[],"recommend":False,"skipped":"non_motorized"})
    mode=str(payload.get("route_mode") or "smart").strip().lower()
    if mode not in {"fastest","safest","smart"}:mode="smart"
    try:
        local_hour=int(payload.get("local_hour",datetime.now().hour));local_hour=local_hour if 0<=local_hour<=23 else None
        current_level=int(clamp(float(payload.get("current_safety_level",3) if payload.get("current_safety_level") is not None else 3),0,5))
    except Exception:
        local_hour,current_level=None,3
    start_bearing=sanitize_start_bearing(payload.get("heading"));start_speed=sanitize_start_speed(payload.get("speed"))
    points=[]
    for raw in (payload.get("route_points") or [])[:8]:
        try:
            lon,lat=float(raw[0]),float(raw[1])
            if -180<=lon<=180 and -90<=lat<=90:
                if not points or haversine_m(lat,lon,points[-1][1],points[-1][0])>15:points.append([lon,lat])
        except Exception:continue
    if not points or haversine_m(slat,slon,points[0][1],points[0][0])>120:points.insert(0,[slon,slat])
    if haversine_m(elat,elon,points[-1][1],points[-1][0])>120:points.append([elon,elat])
    # mapbox_routes_via uses a bounded number of shaping points, so trim evenly.
    if len(points)>8:
        points=[points[round(i*(len(points)-1)/7)] for i in range(8)]
    user_nav=navigation_profile(session.get("user_id"),local_hour,profile)
    extra_excludes=["unpaved"] if (profile=="motorcycle" or user_nav.get("professional_driver")) else None
    try:
        baseline=mapbox_routes_via(points,"now",start_bearing=start_bearing,start_speed=start_speed,reroute=True)
    except Exception:
        try:
            base=mapbox_routes(slon,slat,elon,elat,profile,"now",alternatives=False,extra_excludes=extra_excludes,start_bearing=start_bearing,start_speed=start_speed,reroute=True)
            baseline=base[0] if base else None
        except Exception as exc:
            return jsonify({"error":"Não foi possível verificar o corredor do evento agora.","detail":str(exc)}),502
    if not baseline:
        return jsonify({"active":False,"events":[],"recommend":False})
    bounds=_event_bounds_from_geometry(((baseline.get("geometry") or {}).get("coordinates") or []),.018)
    reports=get_active_reports_for_bounds(*bounds) if bounds else []
    disruptions=route_event_disruptions(baseline,slat,slon,elat,elon,reports=reports)
    clean_events=[{k:v for k,v in ev.items() if k!="avoid_points"} for ev in disruptions]
    if not disruptions:
        return jsonify({"active":False,"events":[],"recommend":False,"message":"Nenhuma pressão de evento relevante foi detectada no corredor."})
    destination_events=[ev for ev in disruptions if ev.get("destination_related")]
    avoidable=[ev for ev in disruptions if not ev.get("destination_related") and not ev.get("origin_related")]
    if not avoidable:
        main=destination_events[0] if destination_events else disruptions[0]
        return jsonify({"active":True,"events":clean_events,"destination_event":bool(destination_events),"recommend":False,"message":f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}. Os acessos finais podem mudar."})
    bypass=build_event_bypass_routes(slon,slat,elon,elat,profile,avoidable,"now",start_bearing=start_bearing,start_speed=start_speed,reroute=True,extra_excludes=extra_excludes)
    base_exp=event_exposure_for_route(baseline,avoidable);base_s=float(baseline.get("duration") or 0);base_effective=base_s+float(base_exp.get("penalty_s") or 0)
    if not bypass:
        return jsonify({"active":True,"events":clean_events,"destination_event":False,"recommend":False,"baseline_duration":base_s,"event_delay_buffer_s":base_exp.get("penalty_s",0),"message":"Movimento de evento detectado, mas nenhuma alternativa confiável ficou disponível agora."})
    ranked=[]
    for raw in bypass:
        exp=event_exposure_for_route(raw,avoidable);duration=float(raw.get("duration") or 10**12);effective=duration+float(exp.get("penalty_s") or 0)
        ranked.append((effective,duration,int(exp.get("penalty_s") or 0),raw,exp))
    ranked.sort(key=lambda x:(x[0],x[1]))
    best_effective,best_s,best_penalty,best_raw,best_exp=ranked[0]
    pressure=max(float(ev.get("pressure_score") or 0) for ev in avoidable)
    effective_saving=max(0.0,base_effective-best_effective);provider_saving=base_s-best_s
    actually_avoids=best_penalty<=max(20,int(base_exp.get("penalty_s") or 0)*.25)
    detour_ok=best_s<=base_s*1.22+45
    recommend=bool(actually_avoids and detour_ok and (effective_saving>=45 or (pressure>=76 and best_s<=base_s+150)))
    candidate=None;auto_apply=False
    if recommend:
        candidate=event_candidate_payload(best_raw,9001,profile,local_hour,user_nav,mode,avoidable)
        candidate["event_variant"]=True;candidate["event_disruptions"]=clean_events;candidate["event_delay_buffer_min"]=round(float(base_exp.get("penalty_s") or 0)/60.0,1);candidate["event_effective_gain_min"]=round(effective_saving/60.0,1)
        safety_ok=(mode=="fastest" or current_level<=1 or int(candidate.get("safety_level") or 0)>=max(1,current_level-1))
        auto_apply=bool(safety_ok and pressure>=68 and (effective_saving>=75 or pressure>=80) and best_s<=base_s*1.18+30)
    main=avoidable[0]
    return jsonify({
        "active":True,"events":clean_events,"destination_event":False,"recommend":recommend,"auto_apply":auto_apply,
        "baseline_duration":round(base_s,1),"baseline_effective_duration":round(base_effective,1),"event_delay_buffer_s":int(base_exp.get("penalty_s") or 0),
        "suggested_duration":round(best_s,1),"suggested_effective_duration":round(best_effective,1),"saving_seconds":round(provider_saving),"effective_saving_seconds":round(effective_saving),"effective_saving_minutes":round(effective_saving/60.0,1),
        "suggestion":{"route":candidate,"kind":"event_detour"} if candidate else None,
        "message":(f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}. O VANO MAPS encontrou um contorno melhor." if recommend else f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}; a rota atual ainda é a melhor opção confiável."),
    })


@app.route("/api/traffic-recommendation", methods=["POST"])
def traffic_recommendation():
    if not validate_csrf():
        abort(400)
    if not rate_limit("traffic_recommendation", 20, 60):
        return jsonify({"error": "Atualização de trânsito em intervalo muito curto."}), 429
    payload = request.get_json(silent=True) or {}
    try:
        clat, clon = float(payload["current_lat"]), float(payload["current_lon"])
        dlat, dlon = float(payload["destination_lat"]), float(payload["destination_lon"])
    except Exception:
        return jsonify({"error": "Posição atual ou destino inválidos."}), 400
    if not (-90 <= clat <= 90 and -90 <= dlat <= 90 and -180 <= clon <= 180 and -180 <= dlon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    try:
        current_level = int(clamp(float(payload.get("current_safety_level", 3)), 0, 5))
        local_hour = int(payload.get("local_hour", datetime.now().hour))
        local_hour = local_hour if 0 <= local_hour <= 23 else None
    except Exception:
        current_level, local_hour = 3, None
    route_mode = str(payload.get("route_mode") or "safest").strip().lower()
    fast_eta_only = route_mode == "fastest"
    travel_profile = str(payload.get("profile") or "driving").strip().lower()
    if travel_profile not in {"driving", "motorcycle"}:
        travel_profile = "driving"
    start_bearing = sanitize_start_bearing(payload.get("heading"))
    start_speed = sanitize_start_speed(payload.get("speed"))
    user_nav = navigation_profile(session.get("user_id"), local_hour, travel_profile)
    route_extra_excludes = ["unpaved"] if (travel_profile == "motorcycle" or user_nav["professional_driver"]) else None
    pro_exclusions, pro_exclusion_reasons = (([], []) if fast_eta_only else (professional_exclusion_points(clat, clon, dlat, dlon, local_hour) if user_nav["professional_driver"] else ([], [])))
    future = []
    for point in (payload.get("future_points") or [])[:4]:
        try:
            lon, lat = float(point[0]), float(point[1])
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                future.append([lon, lat])
        except Exception:
            continue
    forced_points = [[clon, clat]] + future + [[dlon, dlat]]
    if fast_eta_only:
        try:
            # Fresh Mapbox traffic-aware alternatives from the current GPS position,
            # expanded by Vano Maps with nearby block/corridor micro-variants.
            baseline_raw = mapbox_routes_via(forced_points, "now", start_bearing=start_bearing, start_speed=start_speed, reroute=True)
            base_routes = mapbox_routes(clon, clat, dlon, dlat, travel_profile, "now", alternatives=True, extra_excludes=route_extra_excludes, start_bearing=start_bearing, start_speed=start_speed, reroute=True)
            if not base_routes:
                raise RuntimeError("Nenhuma rota de trânsito disponível")
            base_routes = ensure_adaptive_route_pool(base_routes, clon, clat, dlon, dlat, "now", target=6, budget=6)
            dense_micro = build_dense_micro_route_pool(base_routes, clon, clat, dlon, dlat, "now", budget=10)
            micro = build_fast_micro_routes(base_routes + dense_micro, clon, clat, dlon, dlat, "now")
            raw_candidates = select_diverse_routes(base_routes + dense_micro + micro, max_routes=13, max_overlap=.985, sort_key=lambda r: float(r.get("duration", 10**12)))
            raw_candidates, _live_direction_guard = apply_start_direction_guard(raw_candidates, start_bearing, start_speed)
            candidates = [fast_route_payload(raw, idx, travel_profile) for idx, raw in enumerate(raw_candidates)]
            baseline = fast_route_payload(baseline_raw, 999, travel_profile)
            best = min(candidates, key=lambda r: float(r.get("duration", 10**12))) if candidates else baseline
            base_s = float(baseline.get("duration") or 0)
            best_s = float(best.get("duration") or base_s)
            saving = max(0.0, base_s - best_s)
            traffic_detected = bool(float(baseline.get("traffic_score") or 0) >= 35 or int(baseline.get("severe_segments") or 0) > 0)
            # V167: avoid route churn. A faster route is only surfaced when the
            # improvement is meaningful enough to be perceived by the driver.
            threshold = 180.0
            recommend = bool(best and route_overlap_ratio(best, baseline) < .95 and saving >= threshold)
            previous_score = payload.get("previous_traffic_score")
            previous_delay = payload.get("previous_delay_min")
            try: score_delta = float(baseline.get("traffic_score") or 0) - float(previous_score) if previous_score is not None else 0.0
            except Exception: score_delta = 0.0
            try: delay_delta = float(baseline.get("traffic_delay_min") or 0) - float(previous_delay) if previous_delay is not None else 0.0
            except Exception: delay_delta = 0.0
            traffic_worsening = bool(previous_score is not None and (score_delta >= 8 or delay_delta >= 1.2))
            return jsonify({
                "traffic_detected": traffic_detected, "mapped_road_detected": False,
                "traffic_level": baseline.get("traffic_level", "Sem dados"),
                "traffic_score": baseline.get("traffic_score", 0),
                "congested_distance_km": baseline.get("congested_distance_km", 0),
                "hotspots": (baseline.get("traffic_corridors") or [])[:8],
                "traffic_delay_min": baseline.get("traffic_delay_min", 0),
                "baseline_duration": base_s, "recommend": recommend,
                "saving_seconds": round(saving), "saving_minutes": max(1, round(saving/60)) if recommend else 0,
                "traffic_worsening": traffic_worsening, "traffic_score_delta": round(score_delta,1), "traffic_delay_delta_min": round(delay_delta,1),
                "fast_eta_only": True,
                "auto_apply": bool(recommend and saving >= 300 and best and best.get("micro_route")),
                "suggestion": {"route": best, "kind": "micro" if best and best.get("micro_route") else "alternative"} if recommend else None,
                "message": (f"Rota mais rápida encontrada: economiza cerca de {max(1,round(saving/60))} min." if recommend else ("Trânsito detectado; nenhuma alternativa ficou realmente mais rápida agora." if traffic_detected else "Fluxo sem ganho de ETA relevante em outra rota.")),
            })
        except Exception as exc:
            return jsonify({"error": "Não foi possível atualizar a rota rápida agora.", "detail": str(exc)}), 502

    try:
        baseline = mapbox_routes_via(forced_points, "now", start_bearing=start_bearing, start_speed=start_speed, reroute=True) if len(forced_points) >= 2 else mapbox_routes(clon, clat, dlon, dlat, travel_profile, "now", alternatives=False, extra_excludes=route_extra_excludes, start_bearing=start_bearing, start_speed=start_speed, reroute=True)[0]
        alternatives = mapbox_routes(
            clon, clat, dlon, dlat, travel_profile, "now",
            exclusions=pro_exclusions if user_nav["professional_driver"] else None,
            alternatives=True, extra_excludes=route_extra_excludes,
            start_bearing=start_bearing, start_speed=start_speed, reroute=True,
        )
        alternatives = ensure_adaptive_route_pool(
            alternatives, clon, clat, dlon, dlat, "now", target=6, budget=6,
            base_exclusions=(pro_exclusions if user_nav["professional_driver"] else None),
            extra_excludes=route_extra_excludes,
        )
        alternatives.extend(build_dense_micro_route_pool(
            [baseline] + alternatives, clon, clat, dlon, dlat, "now", budget=10,
            base_exclusions=(pro_exclusions if user_nav["professional_driver"] else None),
            extra_excludes=route_extra_excludes,
        ))
        exact_live = {}
        for candidate in alternatives:
            sig = route_signature(candidate) or f"anon-{id(candidate)}"
            old_candidate = exact_live.get(sig)
            if old_candidate is None or float(candidate.get("duration") or 10**12) < float(old_candidate.get("duration") or 10**12):
                exact_live[sig] = candidate
        alternatives = sorted(exact_live.values(), key=lambda r: float(r.get("duration") or 10**12))[:14]
        alternatives, _live_direction_guard = apply_start_direction_guard(alternatives, start_bearing, start_speed)
        base_traffic = route_traffic_metrics(baseline)
        # Vano Maps Live Road: além dos gargalos do provedor, tenta contornar apenas
        # obstáculos viários mapeados (obra/barreira/trecho com água) encontrados
        # pelo próprio servidor. Não aceita pontos arbitrários do cliente e não
        # consulta/expõe fiscalização policial.
        mapped_context = overpass_live_road_context(clat, clon, 1200)
        base_geometry = ((baseline or {}).get("geometry") or {}).get("coordinates") or []
        mapped_avoid = []
        for item in mapped_context:
            if not item.get("avoid_candidate") or int(item.get("severity") or 0) < 4:
                continue
            try:
                ilat, ilon = float(item["lat"]), float(item["lon"])
            except Exception:
                continue
            if base_geometry and min_distance_to_geometry_m(ilat, ilon, base_geometry) <= 85:
                mapped_avoid.append([ilon, ilat])
            if len(mapped_avoid) >= 3:
                break
        avoid_points = list(base_traffic.get("traffic_points") or [])[:4]
        for point in mapped_avoid:
            if all(haversine_m(point[1], point[0], p[1], p[0]) > 90 for p in avoid_points):
                avoid_points.append(point)
        if avoid_points:
            try:
                merged_avoid = list(pro_exclusions if user_nav["professional_driver"] else []) + list(avoid_points[:6])
                micro = mapbox_routes(
                    clon, clat, dlon, dlat, travel_profile, "now", merged_avoid[:18], alternatives=False,
                    extra_excludes=route_extra_excludes,
                )
                if micro:
                    micro[0]["_micro_route"] = True
                    micro[0]["_micro_avoided_points"] = min(6, len(avoid_points))
                    micro[0]["_live_road_avoided"] = len(mapped_avoid)
                    alternatives.append(micro[0])
            except Exception:
                pass
    except Exception as exc:
        return jsonify({"error": "Não foi possível atualizar o trânsito agora.", "detail": str(exc)}), 502

    candidates_raw = [baseline] + alternatives[:11]
    all_coords = []
    for r in candidates_raw:
        all_coords.extend((r.get("geometry") or {}).get("coordinates") or [])
    if all_coords:
        lons=[float(c[0]) for c in all_coords if len(c)>=2]; lats=[float(c[1]) for c in all_coords if len(c)>=2]
        pad=.01; min_lat,max_lat=min(lats)-pad,max(lats)+pad; min_lon,max_lon=min(lons)-pad,max(lons)+pad
        reports=get_active_reports_for_bounds(min_lat,min_lon,max_lat,max_lon)
        zones=get_risk_zones_for_bounds(min_lat,min_lon,max_lat,max_lon)
    else:
        reports=[]; zones=[]

    def enrich_live(raw, idx):
        risk=route_risk_metrics(raw,reports,zones,local_hour,travel_profile)
        traffic=route_traffic_metrics(raw)
        flow=route_live_flow_metrics(raw)
        if int(flow.get("live_flow_cells") or 0) > 0:
            provider=float(traffic.get("traffic_score") or 0); live=float(flow.get("live_flow_score") or 0)
            conf=float(flow.get("live_flow_confidence") or 0)/100.0; blend=min(.34,.10+conf*.24)
            combined=provider*(1-blend)+live*blend if provider>0 else live
            traffic["traffic_score_provider"]=round(provider,1)
            traffic["traffic_score"]=round(clamp(combined,0,100),1)
            traffic["traffic_level"]=traffic_level_from_score(traffic["traffic_score"])
        road=route_road_controls(raw)
        professional=professional_route_assessment(raw,risk,road) if user_nav["professional_driver"] else {"professional_ok":True,"professional_flags":[],"exclusion_violations":[]}
        return {
            "id": idx, "distance": raw.get("distance",0), "duration": raw.get("duration",0), "duration_min": round(float(raw.get("duration",0))/60,1),
            "geometry": raw.get("geometry"), "steps": compact_steps(raw), "profile":travel_profile,
            "micro_route": bool(raw.get("_micro_route")), "micro_avoided_points": int(raw.get("_micro_avoided_points",0) or 0),
            "micro_strategy": raw.get("_micro_strategy") or "", "micro_streets": raw.get("_micro_streets") or [],
            "micro_traffic_relief": round(float(raw.get("_micro_traffic_relief") or 0), 1),
            "live_road_avoided": int(raw.get("_live_road_avoided",0) or 0),
            "routing_profile_used": raw.get("_profile_used", "driving-traffic"), "routing_provider": raw.get("_provider", "mapbox"), "route_signature": route_signature(raw),
            **risk, **{k:v for k,v in traffic.items() if k != "traffic_points"}, **flow, **road, **professional,
        }
    base = enrich_live(baseline, 0)
    options=[]
    seen={base["route_signature"]}
    for idx, raw in enumerate(alternatives[:11], start=1):
        item=enrich_live(raw,idx)
        if item["route_signature"] and item["route_signature"] in seen: continue
        seen.add(item["route_signature"]); options.append(item)

    # Segurança é a trava principal. Entre alternativas seguras, o mesmo motor Vano Maps X2
    # equilibra ETA, trânsito, exposição e confiança, em vez de usar só uma soma fixa.
    live_safety_bias = clamp(76 + user_nav["safety_delta"], 0, 100)
    live_traffic_bias = clamp(84 + user_nav["traffic_delta"], 0, 100)
    apply_route_intelligence([base] + options, "driving", safety_bias=live_safety_bias, traffic_bias=live_traffic_bias)
    safety_floor=max(0, max(current_level, int(base.get("safety_level", current_level))))
    base_s=float(base.get("duration") or 0)
    safe_options=[r for r in options if (r.get("professional_ok",True) or not user_nav["professional_driver"]) and int(r.get("safety_level",0)) >= safety_floor and float(r.get("duration") or 1e12) <= max(base_s*(1.12 if user_nav["night_active"] else 1.08), base_s+(150 if user_nav["night_active"] else 90))]
    best=max(safe_options, key=lambda r:(float(r.get("rairo_score",0)), -float(r.get("duration",1e12)))) if safe_options else None
    base_traffic_score = float(base.get("traffic_score") or 0)
    if base_traffic_score >= 40:
        live_micro = [r for r in safe_options if r.get("micro_route") and (float(r.get("traffic_score") or 0) <= base_traffic_score - 6 or float(r.get("micro_traffic_relief") or 0) >= 5)]
        if live_micro:
            best=max(live_micro,key=lambda r:(float(r.get("rairo_score",0))+min(18.0,max(0.0,base_traffic_score-float(r.get("traffic_score") or 0))*.45),-float(r.get("duration",1e12))))
    saving=max(0, base_s-float(best.get("duration") or base_s)) if best else 0
    # V167: route-change hysteresis. The UI only offers a change from ~3 min,
    # and automatic changes require a stronger ~5 min benefit unless there is a
    # confirmed closure. This reduces ping-pong between two similar corridors.
    threshold=180.0
    traffic_detected=bool(float(base.get("traffic_score",0)) >= 42 or int(base.get("severe_segments",0)) > 0)
    severe_traffic=bool(float(base.get("traffic_score",0)) >= 74 or int(base.get("severe_segments",0)) >= 2)
    closure_detected=bool(int(base.get("closures_count",0) or 0)>0)
    mapped_road_detected=bool(locals().get("mapped_avoid"))
    # Se houver obstáculo viário mapeado sobre o corredor, uma alternativa pode ser
    # oferecida mesmo sem congestionamento, mas continua presa à trava de segurança
    # e a um detour pequeno. Como OSM não é um feed instantâneo, a UI informa isso.
    road_benefit=bool(best and int(best.get("live_road_avoided",0) or 0)>0 and float(best.get("duration") or 1e12) <= base_s*1.08)
    recommend=bool(best and ((traffic_detected and saving >= threshold) or (severe_traffic and saving >= threshold) or (closure_detected and saving >= 60.0) or (mapped_road_detected and road_benefit and saving >= threshold)))
    previous_score = payload.get("previous_traffic_score")
    previous_delay = payload.get("previous_delay_min")
    try: score_delta = float(base.get("traffic_score") or 0) - float(previous_score) if previous_score is not None else 0.0
    except Exception: score_delta = 0.0
    try: delay_delta = float(base.get("traffic_delay_min") or 0) - float(previous_delay) if previous_delay is not None else 0.0
    except Exception: delay_delta = 0.0
    traffic_worsening = bool(previous_score is not None and (score_delta >= 8 or delay_delta >= 1.2))
    auto_apply=bool(recommend and best and best.get("micro_route") and saving>=300.0 and (traffic_worsening or severe_traffic or closure_detected))
    return jsonify({
        "traffic_detected": traffic_detected,
        "severe_traffic": severe_traffic,
        "closure_detected": closure_detected,
        "mapped_road_detected": mapped_road_detected,
        "mapped_road_items": [
            {"type":x.get("type"),"label":x.get("label"),"lat":x.get("lat"),"lon":x.get("lon"),"severity":x.get("severity"),"freshness":x.get("freshness")}
            for x in (locals().get("mapped_context") or []) if x.get("avoid_candidate")
        ][:8],
        "traffic_level": base.get("traffic_level","Sem dados"),
        "traffic_score": base.get("traffic_score",0),
        "congested_distance_km": base.get("congested_distance_km",0),
        "hotspots": (base.get("traffic_corridors") or [])[:8],
        "traffic_delay_min": base.get("traffic_delay_min",0),
        "baseline_duration": base_s,
        "recommend": recommend,
        "auto_apply": auto_apply,
        "traffic_worsening": traffic_worsening,
        "traffic_score_delta": round(score_delta, 1),
        "traffic_delay_delta_min": round(delay_delta, 1),
        "micro_candidates_checked": sum(1 for r in options if r.get("micro_route")),
        "saving_seconds": round(saving),
        "saving_minutes": max(1, round(saving/60)) if recommend else 0,
        "profile_mode": {"professional_driver": bool(user_nav["professional_driver"]), "night_safety_active": bool(user_nav["night_active"]), "hard_exclusions_count": len(pro_exclusions), "reasons": pro_exclusion_reasons},
        "suggestion": {"route": best, "kind": "micro" if best and best.get("micro_route") else "alternative"} if recommend else None,
        "message": (f"Há uma alternativa segura para melhorar o corredor à frente." if recommend and mapped_road_detected and not traffic_detected else (f"Trânsito {str(base.get('traffic_level','')).lower()} à frente. Há uma alternativa segura que economiza cerca de {max(1,round(saving/60))} min." if recommend else (f"Trânsito {str(base.get('traffic_level','')).lower()} detectado; nenhuma alternativa segura melhora o tempo o suficiente." if traffic_detected else ("Há contexto viário mapeado no corredor; nenhuma troca foi aplicada automaticamente." if mapped_road_detected else "Fluxo sem gargalo relevante à frente.")))),
    })


def get_live_trip_or_404(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token or ""):
        abort(404)
    row = get_db().execute("SELECT * FROM live_trips WHERE token=?", (token,)).fetchone()
    if not row:
        abort(404)
    expires = parse_iso(row["expires_at"])
    if not expires or expires < datetime.now(timezone.utc):
        abort(404)
    return row


@app.route("/api/live-trip", methods=["POST"])
@login_required
def create_live_trip():
    if not validate_csrf():
        abort(400)
    if not rate_limit("live_trip_create", 8, 3600):
        return jsonify({"error": "Muitos compartilhamentos ao vivo criados."}), 429
    payload = request.get_json(silent=True) or {}
    destination_label = str(payload.get("destination_label") or "Destino")[:180]
    try:
        safety_level = int(clamp(float(payload.get("safety_level", 3)), 0, 5))
    except Exception:
        safety_level = 3
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires = (now + timedelta(hours=6)).isoformat()
    db = get_db()
    db.execute("""
        INSERT INTO live_trips(token,creator_user_id,destination_label,safety_level,created_at,updated_at,expires_at,active)
        VALUES(?,?,?,?,?,?,?,1)
    """, (token, session["user_id"], destination_label, safety_level, now.isoformat(), now.isoformat(), expires))
    db.commit()
    audit("live_trip_created", {"destination": destination_label})
    url = request.host_url.rstrip("/") + url_for("live_trip_view", token=token)
    return jsonify({"token": token, "url": url, "expires_at": expires})


@app.route("/api/live-trip/<token>/update", methods=["POST"])
@login_required
def update_live_trip(token):
    if not validate_csrf():
        abort(400)
    if not rate_limit("live_trip_update", 150, 60):
        return jsonify({"error": "Atualizações rápidas demais."}), 429
    row = get_live_trip_or_404(token)
    if int(row["creator_user_id"]) != int(session["user_id"]):
        abort(403)
    payload = request.get_json(silent=True) or {}
    try:
        lat, lon = float(payload["lat"]), float(payload["lon"])
        accuracy = clamp(float(payload.get("accuracy") or 0), 0, 5000)
        speed = clamp(float(payload.get("speed") or 0), 0, 120)
        heading = float(payload.get("heading")) if payload.get("heading") is not None else None
        progress = clamp(float(payload.get("progress") or 0), 0, 1)
        safety_level = int(clamp(float(payload.get("safety_level", row["safety_level"])), 0, 5))
    except Exception:
        return jsonify({"error": "Posição inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Posição inválida."}), 400
    now = utcnow_iso()
    db = get_db()
    db.execute("""
        UPDATE live_trips SET last_lat=?,last_lon=?,last_accuracy=?,last_speed=?,last_heading=?,route_progress=?,safety_level=?,updated_at=?
        WHERE id=? AND active=1
    """, (lat, lon, accuracy, speed, heading, progress, safety_level, now, row["id"]))
    db.commit()
    return jsonify({"ok": True, "updated_at": now})


@app.route("/api/live-trip/<token>/stop", methods=["POST"])
@login_required
def stop_live_trip(token):
    if not validate_csrf():
        abort(400)
    row = get_live_trip_or_404(token)
    if int(row["creator_user_id"]) != int(session["user_id"]):
        abort(403)
    db = get_db(); db.execute("UPDATE live_trips SET active=0,updated_at=? WHERE id=?", (utcnow_iso(), row["id"])); db.commit()
    audit("live_trip_stopped", {"token_prefix": token[:6]})
    return jsonify({"ok": True})


@app.route("/api/live-trip/<token>")
def live_trip_api(token):
    row = get_live_trip_or_404(token)
    return jsonify({
        "active": bool(row["active"]), "destination_label": row["destination_label"],
        "lat": row["last_lat"], "lon": row["last_lon"], "accuracy": row["last_accuracy"],
        "speed": row["last_speed"], "heading": row["last_heading"], "progress": row["route_progress"],
        "safety_level": row["safety_level"], "updated_at": row["updated_at"], "expires_at": row["expires_at"],
    })


@app.route("/live/<token>")
def live_trip_view(token):
    row = get_live_trip_or_404(token)
    return render_template("live_trip.html", token=token, destination_label=row["destination_label"], mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "", mapbox_style=MAPBOX_STYLE, mapbox_style_night=MAPBOX_STYLE_NIGHT, mapbox_ready=mapbox_ready())


@app.route("/api/telemetry/event", methods=["POST"])
def api_telemetry_event():
    if not validate_csrf():
        abort(400)
    if not rate_limit("telemetry", 240, 60):
        return ("", 429)
    payload = request.get_json(silent=True) or {}
    event_type = str(payload.get("event_type") or "click").strip().lower()
    if event_type not in {"click", "navigation", "ui", "visibility", "search", "route", "alert", "safety", "performance", "gps", "connectivity", "traffic"}:
        event_type = "ui"
    metadata = {
        "target": str(payload.get("target") or "")[:80],
        "element_id": str(payload.get("element_id") or "")[:120],
        "classes": str(payload.get("classes") or "")[:240],
        "label": str(payload.get("label") or "")[:100],
        "href": str(payload.get("href") or "")[:300],
        "page": str(payload.get("page") or request.path)[:300],
    }
    record_activity(event_type, metadata, status_code=204, method="EVENT", path=metadata["page"], endpoint="browser_event")
    return ("", 204)




@app.route("/api/route-feedback", methods=["POST"])
def route_feedback():
    if not validate_csrf():
        abort(400)
    if not rate_limit("route_feedback", 20, 3600):
        return jsonify({"error": "Muitos feedbacks em pouco tempo."}), 429
    payload = request.get_json(silent=True) or {}
    rating = str(payload.get("rating") or "").strip().lower()
    if rating not in {"good", "improve"}:
        return jsonify({"error": "Feedback inválido."}), 400
    mode = str(payload.get("mode") or "safest").strip().lower()
    if mode not in {"fastest", "safest", "smart", "quietest"}:
        mode = "safest"
    profile = str(payload.get("profile") or "walking").strip().lower()
    if profile not in {"walking", "cycling", "driving", "motorcycle"}:
        profile = "walking"
    try:
        progress = clamp(float(payload.get("progress") or 0), 0, 1)
        duration_s = clamp(float(payload.get("duration_s") or 0), 0, 7 * 24 * 3600)
        distance_m = clamp(float(payload.get("distance_m") or 0), 0, 2_000_000)
    except Exception:
        progress, duration_s, distance_m = 0, 0, 0
    signature = str(payload.get("route_signature") or "")[:180]
    db = get_db()
    db.execute(
        """INSERT INTO route_feedback(user_id,route_signature,rating,mode,profile,progress,duration_s,distance_m,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (session.get("user_id"), signature, rating, mode, profile, progress, duration_s, distance_m, utcnow_iso()),
    )
    db.commit()
    return jsonify({"ok": True})


def _heavy_route_central_fallback(slat, slon, elat, elon, travel_profile, mode, depart_at,
                                  avoid_ferries=False, avoid_tolls=False, avoid_unpaved=False,
                                  start_bearing=None, start_speed=None, reroute_request=False,
                                  remote_meta=None):
    """Low-cost emergency route when every worker failed.

    This deliberately avoids micro-route generation, Safety Engine expansion and
    broad DB corridor scans. The Central performs one base provider calculation
    so a Route Node incident degrades route quality instead of taking the service
    down. It is not used while any worker is successfully serving the request.
    """
    extra_excludes = []
    if travel_profile == "motorcycle" or avoid_unpaved:
        extra_excludes.append("unpaved")
    if avoid_ferries:
        extra_excludes.append("ferry")
    if avoid_tolls:
        extra_excludes.append("toll")
    try:
        routes = mapbox_routes(
            slon, slat, elon, elat, travel_profile, depart_at=depart_at,
            exclusions=None, alternatives=True, extra_excludes=list(dict.fromkeys(extra_excludes)) or None,
            start_bearing=start_bearing, start_speed=start_speed, reroute=reroute_request,
        )
    except Exception as exc:
        app.logger.warning("Heavy-route Central fallback failed: %s", type(exc).__name__)
        return None
    if not routes:
        return None
    compact = [fast_route_payload(r, i, travel_profile) for i, r in enumerate(routes[:4])]
    selected = min(compact, key=lambda r: float(r.get("duration") or 10**12))
    for route in compact:
        route["fast_eta_only"] = mode == "fastest"
        if mode != "fastest":
            route["safety_level_label"] = "Contingência — análise avançada temporariamente reduzida"
    meta = remote_meta or {}
    return {
        "routes": compact,
        "selected_id": selected.get("id", 0),
        "mode": mode,
        "profile": travel_profile,
        "provider": selected.get("routing_provider") or "mapbox",
        "depart_at": depart_at,
        "engine": "rairo-heavy-central-lite-fallback-v1233",
        "distributed_routing": {
            "used": False,
            "fallback": True,
            "reason": meta.get("reason") or "nodes_unavailable",
            "strategy": meta.get("strategy") or "central-lite-fallback",
            "distance_km": meta.get("distance_km"),
        },
        "distributed_routing_meta": {
            "fallback": True,
            "attempted": meta.get("attempted", []),
            "policy": meta.get("policy", {}),
        },
        "degraded_mode": {
            "active": True,
            "reason": "route_nodes_unavailable",
            "advanced_scoring_skipped": True,
        },
        "micro_routing": False,
        "adaptive_routing": {"enabled": False, "diverse_candidates": len(compact), "variant_budget": 0},
        "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
    }


@app.route("/api/route")
def api_route():
    truthy = {"1", "true", "on", "yes"}
    prefetch_requested = str(request.args.get("prefetch", "0")).strip().lower() in truthy
    benchmark_requested = str(request.headers.get("X-VANO-Benchmark", "0")).strip().lower() in truthy
    if benchmark_requested:
        user = current_user()
        if not user or str(user["role"] or "") != "admin":
            return jsonify({"ok": False, "error": "benchmark_admin_required", "message": "Benchmark disponível somente para administradores."}), 403
        prefetch_requested = True
    rate_bucket = "route-benchmark" if benchmark_requested else ("route-prefetch" if prefetch_requested else "route")
    rate_limit_max = 120 if benchmark_requested else (36 if prefetch_requested else 30)
    if not rate_limit(rate_bucket, rate_limit_max, 60):
        return jsonify({"error": "Muitos cálculos de rota. Aguarde um instante."}), 429

    trial_id = re.sub(r"[^A-Za-z0-9_-]", "", str(request.args.get("trial_id", "") or ""))[:64]
    existing_guest_trials = guest_trial_ids() if not session.get("user_id") else []
    if not session.get("user_id") and guest_routes_remaining() <= 0 and (not trial_id or trial_id not in existing_guest_trials):
        return jsonify({
            "error": "Crie uma conta ou entre para continuar.",
            "code": "guest_route_limit_reached",
            "guest_trial": {"active": True, "limit": GUEST_ROUTE_LIMIT, "used": GUEST_ROUTE_LIMIT, "remaining": 0},
            "login_url": url_for("login", next=url_for("index")),
            "register_url": url_for("register"),
        }), 401

    try:
        slat = float(request.args["start_lat"]); slon = float(request.args["start_lon"])
        elat = float(request.args["end_lat"]); elon = float(request.args["end_lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "Origem/destino inválidos."}), 400

    if not all([-90 <= slat <= 90, -90 <= elat <= 90, -180 <= slon <= 180, -180 <= elon <= 180]):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    travel_profile = request.args.get("profile", "driving").strip().lower()
    if travel_profile not in {"walking", "cycling", "driving", "motorcycle"}:
        travel_profile = "driving"
    direct_distance_km = haversine_m(slat, slon, elat, elon) / 1000.0
    if is_motorized_profile(travel_profile) and direct_distance_km > RAIRO_HEAVY_ROUTE_MAX_KM:
        return jsonify({
            "error": f"A VANO MAPS aceita rotas motorizadas de até {int(RAIRO_HEAVY_ROUTE_MAX_KM)} km por cálculo.",
            "code": "route_distance_limit",
            "distance_km": round(direct_distance_km, 1),
            "max_distance_km": int(RAIRO_HEAVY_ROUTE_MAX_KM),
        }), 422
    depart_at = sanitize_depart_at(request.args.get("depart_at", "now"))
    try:
        local_hour = int(request.args.get("local_hour", "")); local_hour = local_hour if 0 <= local_hour <= 23 else None
    except ValueError:
        local_hour = None
    mode = str(request.args.get("mode", "safest") or "safest").strip().lower()
    if mode not in {"fastest", "safest", "quietest", "smart"}:
        mode = "safest"
    fastest_mode = mode == "fastest"
    adaptive_requested = str(request.args.get("adaptive", "1")).lower() not in {"0","false","off","no"}
    start_bearing = sanitize_start_bearing(request.args.get("start_bearing"))
    start_speed = sanitize_start_speed(request.args.get("start_speed"))
    reroute_request = str(request.args.get("reroute", "0")).strip().lower() in truthy
    avoid_ferries = str(request.args.get("avoid_ferries", "0")).strip().lower() in truthy
    avoid_tolls = str(request.args.get("avoid_tolls", "0")).strip().lower() in truthy
    avoid_unpaved = str(request.args.get("avoid_unpaved", "0")).strip().lower() in truthy
    try:
        variant_budget = max(2, min(8, int(request.args.get("variant_budget", "4"))))
    except ValueError:
        variant_budget = 4

    result_cache_key = _route_result_cache_key(session.get("user_id"))
    cached_result = _route_result_cache_get(result_cache_key)
    if cached_result is not None:
        return _finish_route_payload(
            cached_result, result_cache_key, prefetch_requested, trial_id,
            slat, slon, elat, elon, mode, cache_hit=True,
        )

    user_nav = navigation_profile(session.get("user_id"), local_hour, travel_profile)

    # V123.3 — distributed Route Nodes. The Central remains authoritative for
    # authentication, guest credits and history. Heavy motorized trips use hedged
    # workers; if the cluster fails, only a lightweight Central fallback is allowed
    # so one pathological route cannot overload the control plane.
    if is_motorized_profile(travel_profile):
        try:
            requested_safety_bias_remote = clamp(float(request.args.get("safety_bias", 68)), 0, 100)
            requested_traffic_bias_remote = clamp(float(request.args.get("traffic_bias", 62)), 0, 100)
        except ValueError:
            requested_safety_bias_remote, requested_traffic_bias_remote = 68, 62
        learned_remote = learned_route_biases(session.get("user_id"))
        history_strength_remote = min(.28, float(learned_remote.get("samples", 0)) / 36.0 * .28)
        safety_bias_remote = clamp(requested_safety_bias_remote * (1-history_strength_remote) + float(learned_remote["safety_bias"]) * history_strength_remote + user_nav["safety_delta"], 0, 100)
        traffic_bias_remote = clamp(requested_traffic_bias_remote * (1-history_strength_remote) + float(learned_remote["traffic_bias"]) * history_strength_remote + user_nav["traffic_delta"], 0, 100)
        node_job = _node_job_payload(
            slat, slon, elat, elon, travel_profile, mode, depart_at,
            start_bearing, start_speed, reroute_request, adaptive_requested,
            avoid_ferries, avoid_tolls, avoid_unpaved, local_hour, user_nav,
            safety_bias_remote, traffic_bias_remote,
            request_id=trial_id or secrets.token_urlsafe(10),
        )
        inline_context = _node_inline_context(slat, slon, elat, elon, mode)
        if inline_context is not None:
            node_job["context"] = inline_context
        remote_payload, remote_meta = dispatch_route_to_nodes(node_job, prefetch=prefetch_requested)
        if remote_payload is not None:
            remote_payload["central_engine"] = "rairo-central-v1233-distributed"
            remote_payload["distributed_routing_meta"] = {
                "fallback": False,
                "attempted": remote_meta.get("attempted", []),
                "strategy": remote_meta.get("strategy") or "single-node-failover",
                "policy": remote_meta.get("policy", {}),
            }
            # VANO AI Route Judge runs at the Central even when a Route Node did
            # the heavy geometry/safety work. The model only sees compact numeric
            # route metrics and can choose only one of the already-valid IDs.
            ai_remote = rerank_routes_with_ai(
                remote_payload.get("routes") or [],
                mode=mode, profile=travel_profile,
                safety_bias=safety_bias_remote, traffic_bias=traffic_bias_remote,
                local_hour=local_hour, night_active=bool(user_nav.get("night_active")),
                current_selected_id=remote_payload.get("selected_id"),
                prefetch=prefetch_requested, reroute=reroute_request,
            )
            remote_payload["ai_routing"] = ai_remote
            if ai_remote.get("applied") and ai_remote.get("proposed_id") is not None:
                proposed = next(
                    (r for r in (remote_payload.get("routes") or []) if str(r.get("id")) == str(ai_remote.get("proposed_id"))),
                    None,
                )
                if proposed is not None:
                    remote_payload["selected_id"] = proposed.get("id")
                    for route_row in remote_payload.get("routes") or []:
                        badges = [b for b in (route_row.get("badges") or []) if b != mode]
                        if str(route_row.get("id")) == str(proposed.get("id")) and mode in {"safest", "smart"}:
                            badges.append(mode)
                        route_row["badges"] = badges
            return _finish_route_payload(
                remote_payload, result_cache_key, prefetch_requested, trial_id,
                slat, slon, elat, elon, mode, cache_hit=False,
            )
        # Heavy requests must not collapse back into the full Central micro-route
        # engine after all workers fail. Use one lightweight base-provider call;
        # the service stays responsive and quality degrades gracefully.
        if direct_distance_km >= RAIRO_HEAVY_ROUTE_MIN_KM and direct_distance_km <= RAIRO_HEAVY_ROUTE_MAX_KM:
            lite_payload = _heavy_route_central_fallback(
                slat, slon, elat, elon, travel_profile, mode, depart_at,
                avoid_ferries=avoid_ferries, avoid_tolls=avoid_tolls, avoid_unpaved=avoid_unpaved,
                start_bearing=start_bearing, start_speed=start_speed, reroute_request=reroute_request,
                remote_meta=remote_meta,
            )
            if lite_payload is not None:
                return _finish_route_payload(
                    lite_payload, result_cache_key, prefetch_requested, trial_id,
                    slat, slon, elat, elon, mode, cache_hit=False,
                )
            # Do not execute the full micro-route/Safety pipeline on the Central
            # after the distributed cluster and the lightweight provider fallback
            # both failed. Return a controlled retryable error instead of risking
            # the Central process under a pathological long request.
            return jsonify({
                "error": "A rota está temporariamente indisponível. Tente novamente em alguns segundos.",
                "code": "heavy_route_temporarily_unavailable",
                "retryable": True,
                "distance_km": round(direct_distance_km, 1),
                "distributed_routing": {
                    "fallback": True,
                    "reason": remote_meta.get("reason") or "nodes_unavailable",
                    "attempted": len(remote_meta.get("attempted", [])),
                },
            }), 503
    else:
        remote_meta = {"enabled": False, "reason": "non_motorized_local"}

    # Rápida is deliberately ETA-only. Profile/safety exclusions must not change its result.
    hard_exclusions, exclusion_reasons = (([], []) if fastest_mode else (professional_exclusion_points(slat, slon, elat, elon, local_hour) if user_nav["professional_driver"] else ([], [])))

    try:
        motorcycle_excludes = ["unpaved"] if travel_profile == "motorcycle" else []
        professional_excludes = ["unpaved"] if (user_nav["professional_driver"] and not fastest_mode) else []
        user_excludes = []
        if avoid_ferries:
            user_excludes.append("ferry")
        if is_motorized_profile(travel_profile) and avoid_tolls:
            user_excludes.append("toll")
        if is_motorized_profile(travel_profile) and avoid_unpaved:
            user_excludes.append("unpaved")
        extra_excludes = list(dict.fromkeys(motorcycle_excludes + professional_excludes + user_excludes)) or None
        route_base_exclusions = hard_exclusions if (user_nav["professional_driver"] and not fastest_mode) else None
        route_extra_excludes = extra_excludes
        pool_key = _candidate_pool_cache_key(
            slat,slon,elat,elon,travel_profile,depart_at,adaptive_requested,variant_budget,
            route_base_exclusions,route_extra_excludes,start_bearing,start_speed,reroute_request,
        )
        candidate_pool_cache_hit = False
        candidate_pool_reuse = "none"
        if is_motorized_profile(travel_profile):
            def build_candidate_pool():
                routes_local, provider_local, base_count_local = motorized_candidate_routes(
                    slon, slat, elon, elat, travel_profile, depart_at=depart_at,
                    micro_budget=min(8, variant_budget + 3),
                    mapbox_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
                    start_bearing=start_bearing, start_speed=start_speed, reroute=reroute_request,
                )
                if adaptive_requested and provider_local == "mapbox":
                    routes_local = ensure_adaptive_route_pool(routes_local, slon, slat, elon, elat, depart_at, target=3, budget=min(2,variant_budget), base_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes)
                if provider_local == "mapbox":
                    routes_local.extend(build_dense_micro_route_pool(
                        routes_local, slon, slat, elon, elat, depart_at,
                        budget=min(6, variant_budget + 2),
                        base_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
                    ))
                    if routes_local:
                        baseline_probe=min(routes_local,key=lambda r:float(r.get("duration") or 10**12))
                        probe_traffic=route_traffic_metrics(baseline_probe)
                        if float(probe_traffic.get("traffic_score") or 0)>=72 or int(probe_traffic.get("severe_segments") or 0)>=4:
                            routes_local.extend(build_fast_micro_routes(routes_local, slon, slat, elon, elat, depart_at))
                    exact = {}
                    for candidate in routes_local:
                        sig = route_signature(candidate) or f"anon-{id(candidate)}"
                        best = exact.get(sig)
                        if best is None or float(candidate.get("duration") or 10**12) < float(best.get("duration") or 10**12): exact[sig] = candidate
                    routes_local = sorted(exact.values(), key=lambda r: float(r.get("duration", 10**12)))[:18]
                return {"routes":routes_local,"primary_provider":provider_local,"mapbox_base_count":base_count_local}
            pooled,candidate_pool_reuse=_candidate_pool_get_or_build(pool_key,build_candidate_pool,wait_timeout=30)
            candidate_pool_cache_hit=candidate_pool_reuse in {"cache","shared-inflight"}
            routes=pooled["routes"];primary_provider=pooled["primary_provider"];mapbox_base_count=int(pooled.get("mapbox_base_count") or 0)
        else:
            routes = mapbox_routes(
                slon, slat, elon, elat, travel_profile, depart_at=depart_at,
                exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
            )
            primary_provider = str((routes[0] if routes else {}).get("_provider") or "mapbox")
            mapbox_base_count=len(routes)
    except Exception as exc:
        return jsonify({"error": "Não foi possível calcular a rota agora.", "detail": str(exc)}), 502
    if not routes:
        return jsonify({"error": "Nenhuma rota encontrada."}), 404

    # V81 — Admin-configured strong-avoid areas apply to every driving mode,
    # including "Rápida". They are not demographic proxies: the admin must supply
    # an operational risk reason/source. If every candidate intersects the area,
    # routing remains possible and the zone continues as a strong risk penalty.
    zone_bounds = _candidate_bounds(routes, slat, slon, elat, elon)
    route_policy_zones = get_risk_zones_for_bounds(*zone_bounds)
    block_points = admin_blocked_zone_points(route_policy_zones, slat, slon, elat, elon, local_hour)
    if block_points and is_motorized_profile(travel_profile) and primary_provider == "mapbox":
        try:
            routes.extend(build_safety_bypass_routes(
                routes, slon, slat, elon, elat, block_points, depart_at=depart_at,
                budget=min(6, variant_budget + 2),
            ))
        except Exception:
            app.logger.exception("Could not build admin-area bypass variants")
    routes, admin_zone_policy = apply_admin_route_blocks(routes, route_policy_zones, slat, slon, elat, elon, local_hour)
    if is_motorized_profile(travel_profile):
        routes, direction_guard = apply_start_direction_guard(routes, start_bearing, start_speed)
    else:
        direction_guard = {"active": False, "rejected": 0, "bearing": None, "speed_mps": None}

    if fastest_mode:
        # Keep this path lean: no reports, risk zones, Safety Engine, user preference
        # weighting or community-risk analysis. Provider ETA is the sole selector.
        quick = []
        # The winner is chosen from every exact-distinct candidate, including tiny
        # block deviations. Diversity is a presentation concern, not a selector.
        raw_ranked = sorted(routes, key=lambda r: float(r.get("duration", 10**12)))[:12]
        for raw in raw_ranked:
            quick.append(fast_route_payload(raw, len(quick), travel_profile))
        fastest = min(quick, key=lambda r: float(r.get("duration", 10**12)))
        baseline_non_micro = min([float(r.get("duration") or 10**12) for r in quick if not r.get("micro_route")] or [float(fastest.get("duration") or 0)])
        for r in quick:
            gain = max(0.0, baseline_non_micro - float(r.get("duration") or baseline_non_micro))
            r["eta_gain_s"] = round(gain, 1)
            r["eta_gain_min"] = round(gain/60.0, 1)
        # Keep the true winner plus a few useful alternatives for the UI.
        display = [fastest]
        for r in quick:
            if r is fastest:
                continue
            if len(display) >= 6:
                break
            if r.get("micro_route") or not any(route_overlap_ratio(r, x) >= .985 for x in display):
                display.append(r)
        quick = display
        for i, r in enumerate(quick):
            r["id"] = i
        fastest = min(quick, key=lambda r: float(r.get("duration", 10**12)))
        fastest["badges"].append("fastest")
        payload = {
            "routes": quick, "selected_id": fastest["id"], "mode": "fastest", "profile": travel_profile,
            "distributed_routing": {"used": False, "fallback": bool(locals().get("remote_meta", {}).get("fallback")), "reason": locals().get("remote_meta", {}).get("reason", "local")},
            "provider": fastest.get("routing_provider") or primary_provider or "mapbox", "depart_at": depart_at,
            "engine": "rairo-fast-v90-local-fallback",
            "candidate_source": primary_provider, "mapbox_base_candidates": int(mapbox_base_count or 0),
            "candidate_pool_cache_hit": bool(candidate_pool_cache_hit),
            "candidate_pool_reuse": candidate_pool_reuse,
            "direction_guard": direction_guard,
            "micro_routing": is_motorized_profile(travel_profile),
            "adaptive_routing": {"enabled": bool(adaptive_requested), "diverse_candidates": len(quick), "variant_budget": variant_budget},
            "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
            "admin_area_policy": admin_zone_policy,
            "fast_policy": {
                "eta_only": True, "safety_engine_skipped": True, "profile_safety_skipped": True,
                "traffic_aware": is_motorized_profile(travel_profile),
                "motorcycle_policy": "motorized-traffic-graph+unpaved-avoidance" if travel_profile == "motorcycle" else None,
                "micro_candidates": sum(1 for r in quick if r.get("micro_route")),
                "parallel_block_bypass": True,
                "mapbox_base_candidates": int(mapbox_base_count or 0),
                "selector": "minimum-provider-duration",
            },
        }
        return _finish_route_payload(
            payload, result_cache_key, prefetch_requested, trial_id,
            slat, slon, elat, elon, "fastest", cache_hit=False,
        )

    all_coords = []
    for candidate in routes[:8]:
        all_coords.extend(candidate.get("geometry", {}).get("coordinates", []))
    if all_coords:
        lons = [float(c[0]) for c in all_coords]; lats = [float(c[1]) for c in all_coords]
        pad = 0.012
        min_lat, max_lat = min(lats)-pad, max(lats)+pad; min_lon, max_lon = min(lons)-pad, max(lons)+pad
    else:
        pad = 0.015
        min_lat, max_lat = min(slat, elat)-pad, max(slat, elat)+pad; min_lon, max_lon = min(slon, elon)-pad, max(slon, elon)+pad
    reports = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    risk_zones = route_policy_zones if route_policy_zones is not None else get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon)

    # Safest V4: expand the candidate pool around verified objective hazards. This
    # never uses neighborhood/favela labels or demographic proxies. The resulting
    # variants are still rescored against the complete Safety Engine evidence.
    safety_avoidance = []
    if mode == "safest" and is_motorized_profile(travel_profile) and str((routes[0] if routes else {}).get("_provider") or "mapbox") == "mapbox":
        safety_avoidance = verified_safety_avoidance_points(reports, risk_zones, local_hour, travel_profile, max_points=10)
        if safety_avoidance:
            safe_variants = build_safety_bypass_routes(
                routes, slon, slat, elon, elat, safety_avoidance, depart_at=depart_at,
                budget=min(5, variant_budget + 1),
            )
            routes.extend(safe_variants)
            # Exact dedupe only. A one-block safety detour may intentionally overlap
            # almost all of the original corridor.
            exact = {}
            for candidate in routes:
                sig = route_signature(candidate) or f"anon-{id(candidate)}"
                current = exact.get(sig)
                if current is None or float(candidate.get("duration") or 10**12) < float(current.get("duration") or 10**12):
                    exact[sig] = candidate
            routes = sorted(exact.values(), key=lambda r: float(r.get("duration") or 10**12))[:12]
    try:
        requested_safety_bias = clamp(float(request.args.get("safety_bias", 68)), 0, 100)
        requested_traffic_bias = clamp(float(request.args.get("traffic_bias", 62)), 0, 100)
    except ValueError:
        requested_safety_bias, requested_traffic_bias = 68, 62
    learned = learned_route_biases(session.get("user_id"))
    # O dispositivo tem maior peso; histórico da conta atua como ajuste suave.
    history_strength = min(.28, float(learned.get("samples", 0)) / 36.0 * .28)
    safety_bias = clamp(requested_safety_bias * (1-history_strength) + float(learned["safety_bias"]) * history_strength + user_nav["safety_delta"], 0, 100)
    traffic_bias = clamp(requested_traffic_bias * (1-history_strength) + float(learned["traffic_bias"]) * history_strength + user_nav["traffic_delta"], 0, 100)

    enriched = []
    for idx, route in enumerate(routes[:14]):
        metrics = route_risk_metrics(route, reports, risk_zones, local_hour, travel_profile)
        traffic = route_traffic_metrics(route) if is_motorized_profile(travel_profile) else {"traffic_score": 0, "traffic_level": "—", "congested_distance_km": 0, "severe_segments": 0, "traffic_segments": []}
        flow = route_live_flow_metrics(route) if is_motorized_profile(travel_profile) else {"live_flow_score": 0, "live_flow_cells": 0, "live_flow_confidence": 0, "live_flow_points": []}
        if is_motorized_profile(travel_profile) and int(flow.get("live_flow_cells") or 0) > 0:
            mapbox_score = float(traffic.get("traffic_score") or 0)
            live_score = float(flow.get("live_flow_score") or 0)
            conf = float(flow.get("live_flow_confidence") or 0) / 100.0
            blend = min(.34, .10 + conf * .24)
            combined = mapbox_score * (1.0-blend) + live_score * blend if mapbox_score > 0 else live_score
            # O fluxo colaborativo só consegue elevar muito o score quando há confiança suficiente.
            traffic["traffic_score_provider"] = round(mapbox_score, 1)
            traffic["traffic_score"] = round(clamp(combined, 0, 100), 1)
            traffic["traffic_level"] = traffic_level_from_score(traffic["traffic_score"])
        road = route_road_controls(route)
        professional = professional_route_assessment(route, metrics, road) if user_nav["professional_driver"] else {"professional_ok": True, "professional_flags": [], "exclusion_violations": []}
        enriched.append({
            "id": idx,
            "distance": route.get("distance", 0), "duration": route.get("duration", 0), "duration_min": round(float(route.get("duration", 0))/60, 1),
            "geometry": route.get("geometry"), "steps": compact_steps(route), "profile": travel_profile,
            "micro_route": bool(route.get("_micro_route")), "micro_avoided_points": int(route.get("_micro_avoided_points", 0) or 0),
            "micro_strategy": route.get("_micro_strategy") or "", "micro_streets": route.get("_micro_streets") or [],
            "micro_traffic_relief": round(float(route.get("_micro_traffic_relief") or 0), 1),
            "micro_baseline_traffic": round(float(route.get("_micro_baseline_traffic") or 0), 1),
            "micro_traffic_score": round(float(route.get("_micro_traffic_score") or 0), 1),
            "adaptive_variant": bool(route.get("_adaptive_variant")), "adaptive_avoided_points": int(route.get("_adaptive_avoided_points", 0) or 0),
            "safety_variant": bool(route.get("_safety_variant")),
            "safety_avoided_points": int(route.get("_safety_avoided_points", 0) or 0),
            "safety_avoid_reasons": route.get("_safety_avoid_reasons") or [],
            "routing_profile_used": route.get("_profile_used", ""), "routing_provider": route.get("_provider", "mapbox"), "route_signature": route_signature(route),
            "motorcycle_route": travel_profile == "motorcycle",
            "motorcycle_eta_policy": "conservative motorized ETA; no lane-splitting assumption" if travel_profile == "motorcycle" else "",
            "traffic_hotspots": (traffic.get("traffic_points") or [])[:6],
            **metrics, **{k:v for k,v in traffic.items() if k != "traffic_points"}, **flow, **road, **professional,
        })

    apply_route_intelligence(enriched, travel_profile, safety_bias=safety_bias, traffic_bias=traffic_bias)
    candidate_pool = [r for r in enriched if r.get("professional_ok", True)] if user_nav["professional_driver"] else list(enriched)
    professional_fallback = False
    if not candidate_pool:
        candidate_pool = list(enriched)
        professional_fallback = bool(user_nav["professional_driver"])
    fastest = min(candidate_pool, key=lambda r: r["duration"])
    fastest_s = max(float(fastest["duration"]), 1.0)
    # In Segura, safety is the primary objective. We still cap extreme detours, but
    # allow a wider search than balanced/Vano Maps so a meaningful safety gain can win.
    if mode == "safest":
        detour_cap = 1.62 if user_nav["night_active"] else 1.52
    else:
        detour_cap = 1.42 if user_nav["night_active"] else 1.35
    safety_pool = [r for r in candidate_pool if float(r["duration"]) <= fastest_s * detour_cap or int(r.get("safety_level", 0)) >= int(fastest.get("safety_level", 0)) + 2]
    safest = max(
        safety_pool or candidate_pool,
        key=lambda r: (
            float(r.get("safety_conservative_score", r.get("safety_score", 0)) or 0),
            int(r.get("safety_level", 0)),
            -float(r.get("risk_exposure_pct", 0) or 0),
            -float(r.get("hotspot_risk", 0) or 0),
            float(r.get("decision_confidence", 0) or 0),
            -float(r.get("duration", 0) or 0),
        ),
    )
    quietest = max(candidate_pool, key=lambda r: (r["quiet_score"], r.get("safety_level", 0), -r["duration"]))

    smart_guard_pool = list(candidate_pool)
    if is_motorized_profile(travel_profile):
        min_level = int(fastest.get("safety_level", 0)) if user_nav["night_active"] else max(1, int(fastest.get("safety_level", 0)) - 1)
        eligible = [r for r in candidate_pool if float(r["duration"]) <= fastest_s * (1.34 if user_nav["night_active"] else 1.30) and int(r.get("safety_level", 0)) >= min_level]
        smart_guard_pool = list(eligible or candidate_pool)
        smart = max(smart_guard_pool, key=lambda r: (float(r.get("rairo_score", 0)), int(r.get("safety_level", 0)), -float(r.get("duration", 0))))
        smart_micro_locked = False

        # In real congestion, Vano Maps gives a controlled preference to block-scale
        # micro-routes that ease the corridor without a large ETA/safety penalty.
        fastest_traffic = float(fastest.get("traffic_score") or 0)
        if fastest_traffic >= 32:
            micro_pool = [
                r for r in (eligible or candidate_pool)
                if r.get("micro_route")
                and float(r.get("duration") or 10**12) <= fastest_s * 1.14
                and int(r.get("safety_level", 0)) >= min_level
                and (
                    float(r.get("traffic_score") or 0) <= fastest_traffic - 5
                    or float(r.get("duration") or 10**12) <= fastest_s * 1.01
                    or float(r.get("micro_traffic_relief") or 0) >= 7
                )
            ]
            if micro_pool:
                smart = max(
                    micro_pool,
                    key=lambda r: (
                        float(r.get("rairo_score", 0)) + min(18.0, max(0.0, fastest_traffic - float(r.get("traffic_score") or 0)) * .45),
                        -float(r.get("duration", 0)),
                    ),
                )
                smart_micro_locked = True

        # Vano Maps may seek a visibly different corridor when its score stays close.
        # Segura never sacrifices its best conservative safety score just to look
        # different from the fastest route; a one-block safer deviation can overlap
        # almost all of the same trip.
        if not smart_micro_locked and (route_overlap_ratio(smart, fastest) >= .93 or route_overlap_ratio(smart, safest) >= .93):
            best_spark = float(smart.get("rairo_score",0) or 0)
            diverse_smart = [r for r in (eligible or candidate_pool) if route_overlap_ratio(r, fastest) < .93 and route_overlap_ratio(r, safest) < .93 and float(r.get("rairo_score",0) or 0) >= best_spark-10]
            if diverse_smart:
                smart = max(diverse_smart, key=lambda r:(float(r.get("rairo_score",0)), -float(r.get("duration",0))))
    else:
        smart = max(candidate_pool, key=lambda r: (float(r.get("rairo_score", 0)), int(r.get("safety_level", 0)), -float(r.get("duration", 0))))

    # VANO AI Route Judge — a bounded reranker, not a geometry generator.
    # Guardrails are computed by the deterministic engine first; the LLM can only
    # choose among IDs already admitted by the current Safest/Smart policy.
    ai_base_selected = safest if mode == "safest" else smart if mode == "smart" else None
    ai_allowed_rows = (safety_pool or candidate_pool) if mode == "safest" else smart_guard_pool if mode == "smart" else []
    ai_routing = rerank_routes_with_ai(
        enriched,
        mode=mode, profile=travel_profile,
        safety_bias=safety_bias, traffic_bias=traffic_bias,
        local_hour=local_hour, night_active=bool(user_nav.get("night_active")),
        current_selected_id=(ai_base_selected or {}).get("id"),
        allowed_ids=[r.get("id") for r in ai_allowed_rows],
        prefetch=prefetch_requested, reroute=reroute_request,
    )
    if ai_routing.get("applied") and ai_routing.get("proposed_id") is not None:
        ai_selected = next((r for r in ai_allowed_rows if str(r.get("id")) == str(ai_routing.get("proposed_id"))), None)
        if ai_selected is not None:
            if mode == "safest":
                safest = ai_selected
            elif mode == "smart":
                smart = ai_selected

    fastest_cons = float(fastest.get("safety_conservative_score", fastest.get("safety_score", 0)) or 0)
    for r in enriched:
        r["eta_delta_vs_fastest_min"] = round(max(0.0, float(r.get("duration") or 0)-fastest_s)/60.0, 1)
        r["safety_gain_vs_fastest"] = round(float(r.get("safety_conservative_score", r.get("safety_score", 0)) or 0)-fastest_cons, 1)
        r["badges"] = []
        if r["id"] == fastest["id"]: r["badges"].append("fastest")
        if r["id"] == safest["id"]: r["badges"].append("safest")
        if r["id"] == quietest["id"]: r["badges"].append("quietest")
        if r["id"] == smart["id"]: r["badges"].append("smart")

    selected = {"fastest": fastest, "safest": safest, "quietest": quietest, "smart": smart}.get(mode, safest)

    payload = {
        "routes": enriched, "selected_id": selected["id"], "mode": mode, "profile": travel_profile,
        "provider": selected.get("routing_provider") or "mapbox", "depart_at": depart_at,
        "engine": "vano-intelligence-v262-local-fallback", "safety_bias": round(safety_bias, 1), "traffic_bias": round(traffic_bias, 1),
        "ai_routing": ai_routing,
        "distributed_routing": {"used": False, "fallback": bool(locals().get("remote_meta", {}).get("fallback")), "reason": locals().get("remote_meta", {}).get("reason", "local")},
        "candidate_source": primary_provider, "mapbox_base_candidates": int(mapbox_base_count or 0),
        "candidate_pool_cache_hit": bool(candidate_pool_cache_hit),
        "candidate_pool_reuse": candidate_pool_reuse,
        "direction_guard": direction_guard,
        "adaptive_routing": {"enabled": bool(adaptive_requested), "diverse_candidates": len(enriched), "variant_budget": variant_budget, "mode_badges_distinct": len({fastest["id"], safest["id"], smart["id"]})},
        "personalization": {
            "history_samples": int(learned.get("samples", 0)), "history_strength": round(history_strength, 3),
            "professional_driver": bool(user_nav["professional_driver"]),
            "night_safety_active": bool(user_nav["night_active"]),
            "route_preference": user_nav["route_preference"],
        },
        "professional_mode": {
            "strict": bool(user_nav["professional_driver"]),
            "fallback_required": bool(professional_fallback),
            "hard_exclusions_count": len(hard_exclusions),
            "reasons": exclusion_reasons,
            "policy": "objective-hazards-only",
        },
        "micro_routing": is_motorized_profile(travel_profile),
        "motorcycle_routing": {
            "enabled": travel_profile == "motorcycle",
            "provider_graph": "mapbox-driving-traffic",
            "avoid_unpaved": bool(travel_profile == "motorcycle" or avoid_unpaved),
            "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
            "eta_policy": "conservative; no lane-splitting or speeding assumption",
        },
        "safety_routing": {
            "objective_hazard_bypass": mode == "safest" and is_motorized_profile(travel_profile),
            "verified_avoidance_points": len(safety_avoidance),
            "generated_variants": sum(1 for r in enriched if r.get("safety_variant")),
            "policy": "verified-objective-hazards-only",
        },
        "safety_engine": "vano-safety-v262-objective-corridor",
        "disclaimer": "Nível de segurança é uma estimativa conservadora baseada em exposição ao corredor, hotspots, alertas recentes, zonas verificadas, condições viárias e confiança dos dados; não garante ausência de risco. Sexo, idade e tipo de comunidade não são usados como proxy automático de perigo.",
    }
    return _finish_route_payload(
        payload, result_cache_key, prefetch_requested, trial_id,
        slat, slon, elat, elon, mode, cache_hit=False,
    )


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
        fd = open("/tmp/rairo-keepalive.lock", "a+")
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
    get_url = f"{RAIRO_KEEPALIVE_URL}/api/keepalive"
    post_url = f"{RAIRO_KEEPALIVE_URL}/api/keepalive"
    results = []
    try:
        response = session_client.get(get_url, headers=headers, timeout=RAIRO_KEEPALIVE_TIMEOUT, allow_redirects=True)
        results.append(("GET", response.status_code))
    except requests.RequestException as exc:
        results.append(("GET", type(exc).__name__))
    try:
        response = session_client.post(
            post_url,
            headers={**headers, "Content-Type": "application/json"},
            json={"source": "rairo-backend", "ts": int(time.time())},
            timeout=RAIRO_KEEPALIVE_TIMEOUT,
            allow_redirects=True,
        )
        results.append(("POST", response.status_code))
    except requests.RequestException as exc:
        results.append(("POST", type(exc).__name__))
    return results


def _keepalive_worker():
    time.sleep(RAIRO_KEEPALIVE_START_DELAY)
    client = requests.Session()
    while True:
        started = time.monotonic()
        results = _keepalive_cycle(client)
        failures = [f"{method}={status}" for method, status in results if not isinstance(status, int) or not (200 <= status < 400)]
        if failures:
            app.logger.warning("VANO MAPS keep-alive: %s", ", ".join(failures))
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, RAIRO_KEEPALIVE_INTERVAL - elapsed))


def start_keepalive_worker():
    global _KEEPALIVE_THREAD_STARTED
    if not RAIRO_KEEPALIVE_ENABLED or not RAIRO_KEEPALIVE_URL.startswith(("http://", "https://")):
        return False
    with _KEEPALIVE_THREAD_LOCK:
        if _KEEPALIVE_THREAD_STARTED:
            return True
        if not _acquire_keepalive_leader():
            return False
        thread = threading.Thread(target=_keepalive_worker, name="rairo-keepalive", daemon=True)
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

if os.environ.get("RAIRO_DB_INIT_ONLY", "0").strip().lower() not in {"1", "true", "yes", "on"}:
    start_keepalive_worker()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
