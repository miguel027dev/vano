"""VANO node infrastructure and distributed dispatch.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

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

