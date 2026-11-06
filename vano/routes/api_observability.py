"""Administrative API quality and partner-consumption observability.

Counts come from server-observed HTTP attempts, not invented availability
checks. Partner attribution only accepts an identity set by trusted server-side
credential verification (g.vano_authenticated_partner_id).
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
import math
import os
import re
import time

from vano.bootstrap import inject as _vano_inject
from vano.infrastructure.api_metering import record_api_sample
_vano_inject(globals())
del _vano_inject

API_SOURCE_CATALOG = (
    ("mapbox", "Mapbox", "Rotas e geocodificação", "MAPBOX_ACCESS_TOKEN"),
    ("open-meteo", "Open-Meteo", "Meteorologia", "OPEN_METEO_URL"),
    ("overpass", "OpenStreetMap / Overpass", "Contexto viário", "OVERPASS_URL"),
    ("viacep", "ViaCEP", "Endereços e CEP", "VIACEP_URL"),
    ("brasilapi", "BrasilAPI", "Endereços e CEP", "BRASILAPI_CEP_URL"),
    ("openrouteservice", "OpenRouteService", "Fallback de rotas", "OPENROUTESERVICE_API_KEY"),
    ("osrm", "OSRM", "Fallback de rotas", "OSRM_BASE_URL"),
)
_API_RANGE_DAYS = {"24h": 1, "7d": 7, "30d": 30}
_API_MAX_ROWS = 50000


@app.after_request
def observe_authenticated_partner_requests(response):
    """Never trust X-Partner-ID or any other client-provided attribution.

    The authenticated partner API middleware must set
    g.vano_authenticated_partner_id *after* checking the partner credential.
    """
    try:
        partner_id = getattr(g, "vano_authenticated_partner_id", None)
        if not partner_id:
            return response
        if not request.path.startswith(("/v1/", "/api/partner/")):
            return response
        partner_id = str(partner_id).strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", partner_id):
            return response
        started = getattr(g, "vano_request_started", None)
        ms = int((time.monotonic() - started) * 1000) if started else 0
        rule = str(getattr(request.url_rule, "rule", "") or request.path)[:100]
        incoming = max(0, int(request.content_length or 0))
        outgoing = 0 if response.direct_passthrough else max(0, int(response.calculate_content_length() or 0))
        record_api_sample(
            "partner", partner_id, f"{request.method} {rule}",
            response.status_code, ms, incoming, outgoing,
        )
    except Exception:
        pass
    return response


def _api_tariff(kind, identity):
    """Optional explicitly configured BRL per 1,000 calls; no guessed prices."""
    try:
        raw = json.loads(os.environ.get("VANO_API_TARIFFS_JSON", "") or "{}")
        values = raw.get(kind, {})
        n = float(values.get(identity)) if isinstance(values, dict) and identity in values else None
        if n is None or not math.isfinite(n) or n < 0 or n > 1000000:
            return None
        return n
    except (ValueError, TypeError, AttributeError):
        return None


def _api_metric(identity, label, description="", configured=None):
    return {
        "id": identity, "label": label, "description": description,
        "configured": configured, "requests": 0, "successes": 0,
        "errors": 0, "rate_limits": 0, "request_bytes": 0,
        "response_bytes": 0, "last_at": None, "last_http_status": None,
        "p95_ms": None, "avg_ms": None, "success_pct": None,
        "estimated_cost_brl": None, "status": "sem-medicoes",
        "operations": {}, "durations": [],
    }


def _api_summarize_metric(m, kind):
    n = m["requests"]
    durations = m.pop("durations")
    if n:
        durations.sort()
        m["success_pct"] = round(100 * m["successes"] / n, 1)
        m["avg_ms"] = round(sum(durations) / len(durations), 1) if durations else None
        m["p95_ms"] = durations[max(0, math.ceil(len(durations) * 0.95) - 1)] if durations else None
        m["status"] = "degradado" if n >= 5 and m["errors"] / n >= .10 else "com-medicoes"
    price = _api_tariff(kind, m["id"])
    if price is not None:
        m["estimated_cost_brl"] = round(n * price / 1000, 5)
    m["operations"] = [
        {"name": name, "count": count}
        for name, count in sorted(m["operations"].items(), key=lambda kv: (-kv[1], kv[0]))[:8]
    ]
    return m


def _api_report(interval="24h"):
    interval = interval if interval in _API_RANGE_DAYS else "24h"
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=_API_RANGE_DAYS[interval])).isoformat()
    rows = get_db().execute(
        """SELECT event_type, status_code, duration_ms, metadata, created_at
           FROM request_activity_logs
           WHERE event_type IN ('upstream-api','partner-api') AND created_at >= ?
           ORDER BY id DESC LIMIT ?""",
        (cutoff, _API_MAX_ROWS + 1),
    ).fetchall()
    truncated = len(rows) > _API_MAX_ROWS
    rows = rows[:_API_MAX_ROWS]
    providers = {}
    for identity, label, description, env_var in API_SOURCE_CATALOG:
        configured = bool(os.environ.get(env_var, "").strip())
        # URLs with built-in defaults are preconfigured even without a new env var.
        if identity == "mapbox":
            configured = bool(mapbox_ready())
        elif identity in {"open-meteo", "overpass", "viacep", "brasilapi"}:
            configured = bool(globals().get(env_var) or os.environ.get(env_var, ""))
        providers[identity] = _api_metric(identity, label, description, configured)
    partners = {}
    trend = defaultdict(int)
    for row in rows:
        try:
            meta = json.loads(row["metadata"] or "{}")
            if not isinstance(meta, dict):
                continue
        except (ValueError, TypeError):
            continue
        kind = "provider" if row["event_type"] == "upstream-api" else "partner"
        identity = str(meta.get("provider" if kind == "provider" else "partner_id") or "").strip()[:64]
        if not identity or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", identity):
            continue
        if kind == "provider":
            metric = providers.setdefault(identity, _api_metric(identity, identity))
        else:
            metric = partners.setdefault(identity, _api_metric(identity, identity))
        try:
            status = int(row["status_code"] or 599)
            duration = max(0, int(row["duration_ms"] or 0))
        except (ValueError, TypeError):
            status, duration = 599, 0
        metric["requests"] += 1
        metric["successes"] += int(200 <= status < 400)
        metric["errors"] += int(status >= 400 or status < 200)
        metric["rate_limits"] += int(status == 429)
        metric["durations"].append(duration)
        for key in ("request_bytes", "response_bytes"):
            try:
                metric[key] += max(0, int(meta.get(key) or 0))
            except (ValueError, TypeError):
                pass
        stamp = str(row["created_at"] or "")
        if metric["last_at"] is None or stamp > metric["last_at"]:
            metric["last_at"] = stamp
            metric["last_http_status"] = status
        operation = str(meta.get("operation") or "não categorizado")[:100]
        metric["operations"][operation] = metric["operations"].get(operation, 0) + 1
        bucket = stamp[:13] if interval == "24h" else stamp[:10]
        if bucket:
            trend[(kind, bucket)] += 1

    providers_out = [_api_summarize_metric(v, "providers") for v in providers.values()]
    partners_out = [_api_summarize_metric(v, "partners") for v in partners.values()]
    providers_out.sort(key=lambda m: (-m["requests"], m["label"]))
    partners_out.sort(key=lambda m: (-m["requests"], m["label"]))
    if interval == "24h":
        bucket_start = now.replace(minute=0, second=0, microsecond=0)
        buckets = [(bucket_start - timedelta(hours=i)).strftime("%Y-%m-%dT%H") for i in range(23, -1, -1)]
    else:
        bucket_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        days = _API_RANGE_DAYS[interval]
        buckets = [(bucket_start - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]
    return {
        "ok": True, "range": interval, "generated_at": now.isoformat(),
        "truncated": truncated, "record_limit": _API_MAX_ROWS,
        "counts": {
            "outbound_requests": sum(m["requests"] for m in providers_out),
            "partner_requests": sum(m["requests"] for m in partners_out),
            "partners_observed": len(partners_out),
        },
        "sources": providers_out, "partners": partners_out,
        "trend": [{"bucket": b, "outbound": trend[("provider", b)], "partners": trend[("partner", b)]} for b in buckets],
        "partner_instrumentation": "requires_server_verified_partner_identity",
        "caveats": [
            "Registra chamadas observadas no backend; chamadas Mapbox diretas do navegador/app não são incluídas.",
            "Tráfego atendido por cache não gera consumo externo.",
            "Custos exibidos somente quando VANO_API_TARIFFS_JSON possui preço em BRL por 1.000 chamadas; não equivalem à fatura.",
            "Sem chamadas registradas significa sem medição, não comprova indisponibilidade.",
        ],
    }


@app.route("/admin/apis")
@admin_required
def admin_api_monitor():
    return render_template("admin_api_monitor.html")


@app.route("/api/admin/apis/stats")
@admin_required
def api_admin_api_monitor_stats():
    interval = str(request.args.get("range") or "24h")
    if interval not in _API_RANGE_DAYS:
        return jsonify({"ok": False, "error": "Intervalo inválido."}), 400
    payload = jsonify(_api_report(interval))
    payload.headers["Cache-Control"] = "private, no-store"
    return payload
