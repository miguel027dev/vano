"""VANO request/activity observability.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

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
USER_ACCESS_QUEUE = queue.Queue(maxsize=max(256, min(10000, int(os.environ.get("VANO_USER_ACCESS_QUEUE", "2048") or 2048))))
USER_ACCESS_WORKER_LOCK = threading.Lock()
USER_ACCESS_WORKER_STARTED = False
ACTIVITY_LOG_QUEUE = queue.Queue(maxsize=max(1000, min(50000, int(os.environ.get("VANO_ACTIVITY_LOG_QUEUE", "12000") or 12000))))
ACTIVITY_LOG_RETENTION_DAYS = max(7, min(3650, int(os.environ.get("VANO_ACTIVITY_LOG_RETENTION_DAYS", "90") or 90)))
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
    configured in ``VANO_PROXY_HOPS``. We intentionally do not trust arbitrary
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
        threading.Thread(target=_activity_log_worker, name="vano-activity-audit", daemon=True).start()
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
        "proxy_hops": VANO_PROXY_HOPS,
        "forwarded_for": chain,
        "forwarded_proto": (request.headers.get("X-Forwarded-Proto") or "")[:24],
    }


@app.before_request
def start_request_activity_timer():
    g.vano_request_started = time.monotonic()


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
            started = getattr(g, "vano_request_started", None)
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


def _user_access_worker():
    db = None
    while True:
        item = USER_ACCESS_QUEUE.get()
        try:
            try:
                if db is None:
                    db = connect_db()
                db.execute(
                    """INSERT INTO user_access_log(user_id,ip_address,user_agent,first_seen_at,last_seen_at,request_count)
                       VALUES(?,?,?,?,?,1)
                       ON CONFLICT (user_id,ip_address) DO UPDATE SET
                         user_agent=EXCLUDED.user_agent,
                         last_seen_at=EXCLUDED.last_seen_at,
                         request_count=user_access_log.request_count+1""",
                    (item["user_id"], item["ip"], item["user_agent"], item["seen_at"], item["seen_at"]),
                )
                db.commit()
            except Exception:
                try:
                    if db is not None:
                        db.rollback()
                        db.close()
                except Exception:
                    pass
                db = None
                app.logger.exception("Could not persist authenticated user IP")
        finally:
            USER_ACCESS_QUEUE.task_done()


def _ensure_user_access_worker():
    global USER_ACCESS_WORKER_STARTED
    if USER_ACCESS_WORKER_STARTED:
        return
    with USER_ACCESS_WORKER_LOCK:
        if USER_ACCESS_WORKER_STARTED:
            return
        threading.Thread(target=_user_access_worker, name="vano-user-access", daemon=True).start()
        USER_ACCESS_WORKER_STARTED = True


def record_user_access(user_id, force=False):
    """Queue IP-history persistence without delaying the page response."""
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return
    ip = client_ip()
    if ip == "unknown":
        return
    now_ts = time.time()
    key = (uid, ip)
    with USER_IP_LOG_LOCK:
        if not force and now_ts - USER_IP_LOG_CACHE.get(key, 0) < USER_IP_LOG_INTERVAL:
            return
        USER_IP_LOG_CACHE[key] = now_ts
    _ensure_user_access_worker()
    item = {
        "user_id": uid,
        "ip": ip,
        "user_agent": (request.headers.get("User-Agent") or "")[:500],
        "seen_at": utcnow_iso(),
    }
    try:
        USER_ACCESS_QUEUE.put_nowait(item)
    except queue.Full:
        app.logger.warning("VANO user access queue full; dropping telemetry event")


