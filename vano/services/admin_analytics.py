"""Read-only, admin-only analytics derived from the existing VANO telemetry.

No new identifiers, geolocation logging, cookies or database migrations.
Counts describe recorded events, not people or physical devices.
"""
import json
from datetime import datetime, timedelta, timezone

SECTIONS = (
    ("overview", "Visão geral", "layout-dashboard"),
    ("audience", "Público e aparelhos", "smartphone"),
    ("routes", "Rotas e trajetos", "route"),
    ("events", "Interações", "mouse-pointer-click"),
    ("health", "Erros e desempenho", "activity"),
)
ALLOWED_DAYS = (1, 7, 30, 90)
EVENT_TYPES = (
    "all", "click", "ui", "search", "route", "gps", "traffic",
    "alert", "performance", "connectivity", "safety",
)
# Exclude administrative page views from product counts and anonymous IP estimates.
PRODUCT_SCOPE = "path NOT LIKE '/admin%' AND path NOT LIKE '/api/admin/%'"


def _one(db, query, params=()):
    row = db.execute(query, params).fetchone()
    return dict(row) if row else {}


def _many(db, query, params=()):
    return [dict(r) for r in db.execute(query, params).fetchall()]


def _number(value):
    return int(value or 0)


def _safe_label(value, length=160):
    return str(value or "").replace("\x00", "").strip()[:length]


def _event_label(raw):
    try:
        payload = json.loads(raw or "{}")
        if not isinstance(payload, dict):
            return "Evento"
        return _safe_label(
            payload.get("label") or payload.get("element_id")
            or payload.get("target") or payload.get("action") or "Evento"
        )
    except (TypeError, ValueError):
        return "Evento"


def _percentile(values, fraction):
    if not values:
        return None
    data = sorted(_number(v) for v in values)
    return data[min(len(data) - 1, max(0, round((len(data) - 1) * fraction)))]


def build_admin_analytics(db, section, days, *, now=None):
    """Return only data required by the requested admin category.

    All queries use bounded, indexed time windows and capped result lists.
    Python never exports raw IPs, precise coordinates or user-agent strings.
    """
    if section not in {item[0] for item in SECTIONS}:
        raise ValueError("Invalid analytics category")
    if days not in ALLOWED_DAYS:
        raise ValueError("Invalid analytics interval")
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat()
    active_cutoff = (now - timedelta(minutes=5)).isoformat()
    data = {"section": section, "days": days, "sections": SECTIONS,
            "period_label": "24 horas" if days == 1 else f"{days} dias"}

    # Basic counts are shared by every section, without fetching individual events.
    data["summary"] = _one(db, f"""
        SELECT COUNT(*) AS events,
               COUNT(*) FILTER (WHERE event_type='click') AS clicks,
               COUNT(*) FILTER (WHERE event_type='request') AS requests,
               COUNT(*) FILTER (WHERE event_type='request' AND status_code>=400) AS http_errors,
               COUNT(DISTINCT user_id) AS known_users,
               COUNT(DISTINCT CASE WHEN ip_address<>'unknown' THEN ip_address END) AS unique_ips,
               COUNT(DISTINCT CASE WHEN ip_address<>'unknown' AND user_agent<>''
                 THEN ip_address || '|' || user_agent END) AS browser_signatures,
               COUNT(*) FILTER (WHERE event_type='route') AS route_events
        FROM request_activity_logs WHERE created_at>=? AND {PRODUCT_SCOPE}
    """, (cutoff,))
    data["active"] = _one(db, f"""
        SELECT COUNT(DISTINCT user_id) AS signed_in_users,
               COUNT(DISTINCT CASE WHEN ip_address<>'unknown' THEN ip_address END) AS active_ips,
               COUNT(*) AS recent_events
        FROM request_activity_logs
        WHERE created_at>=? AND {PRODUCT_SCOPE}
    """, (active_cutoff,))

    if section == "overview":
        data["daily"] = _many(db, f"""
            SELECT SUBSTR(created_at,1,10) AS day,
                   COUNT(*) AS events,
                   COUNT(DISTINCT user_id) AS signed_in_users,
                   COUNT(*) FILTER (WHERE event_type='request' AND status_code>=400) AS errors
            FROM request_activity_logs WHERE created_at>=? AND {PRODUCT_SCOPE}
            GROUP BY SUBSTR(created_at,1,10) ORDER BY day ASC
        """, (cutoff,))
        data["peak"] = max([_number(item["events"]) for item in data["daily"]] or [1])
        data["top_pages"] = _many(db, f"""
            SELECT path,COUNT(*) AS visits FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE}
              AND event_type='request' AND method='GET'
              AND path NOT LIKE '/api/%' AND SUBSTR(path,1,8) <> '/static/'
            GROUP BY path ORDER BY visits DESC LIMIT 7
        """, (cutoff,))
        data["route_calls"] = _one(db, """
            SELECT COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) AS successes,
                   COUNT(*) FILTER (WHERE status_code>=400) AS failures
            FROM request_activity_logs
            WHERE created_at>=? AND event_type='request' AND path='/api/route'
        """, (cutoff,))

    elif section == "audience":
        data["platforms"] = _many(db, f"""
            SELECT CASE
                  WHEN LOWER(user_agent) LIKE '%android%' THEN 'Android'
                  WHEN LOWER(user_agent) LIKE '%iphone%' OR LOWER(user_agent) LIKE '%ipad%'
                    OR LOWER(user_agent) LIKE '%ios%' THEN 'iOS / iPadOS'
                  WHEN LOWER(user_agent) LIKE '%windows%' THEN 'Windows'
                  WHEN LOWER(user_agent) LIKE '%mac os%' OR LOWER(user_agent) LIKE '%macintosh%' THEN 'macOS'
                  WHEN LOWER(user_agent) LIKE '%linux%' THEN 'Linux'
                  ELSE 'Outros / não identificado' END AS platform,
              COUNT(DISTINCT ip_address || '|' || user_agent) AS signatures
            FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE}
              AND ip_address<>'unknown' AND user_agent<>''
            GROUP BY 1 ORDER BY signatures DESC LIMIT 8
        """, (cutoff,))
        data["recent_clients"] = _many(db, f"""
            SELECT l.created_at, l.user_agent, l.path,
                   COALESCE(u.name,'Visitante') AS user_name
            FROM request_activity_logs l LEFT JOIN users u ON u.id=l.user_id
            WHERE l.created_at>=? AND l.event_type='request'
              AND l.path NOT LIKE '/admin%' AND l.path NOT LIKE '/api/admin/%'
            ORDER BY l.id DESC LIMIT 28
        """, (cutoff,))
        # Expose a coarse platform label, never the raw user-agent or IP.
        for item in data["recent_clients"]:
            ua = str(item.pop("user_agent", "")).lower()
            item["platform"] = (
                "Android" if "android" in ua else
                "iOS / iPadOS" if any(x in ua for x in ("iphone", "ipad", "ios")) else
                "Windows" if "windows" in ua else
                "macOS" if "macintosh" in ua or "mac os" in ua else
                "Linux" if "linux" in ua else "Não identificado"
            )

    elif section == "routes":
        data["api_calls"] = _one(db, """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) AS success,
                   COUNT(*) FILTER (WHERE status_code>=400) AS failed
            FROM request_activity_logs WHERE created_at>=?
              AND event_type='request' AND path='/api/route'
        """, (cutoff,))
        data["history_stats"] = _one(db, """
            SELECT COUNT(*) AS saved, COALESCE(AVG(distance_m),0) AS avg_distance_m,
                   COALESCE(AVG(duration_s),0) AS avg_duration_s
            FROM route_history WHERE created_at>=?
        """, (cutoff,))
        data["route_modes"] = _many(db, """
            SELECT mode,COUNT(*) AS total FROM route_history WHERE created_at>=?
            GROUP BY mode ORDER BY total DESC LIMIT 10
        """, (cutoff,))
        data["recent_routes"] = _many(db, """
            SELECT rh.origin_label,rh.destination_label,rh.mode,rh.distance_m,
                   rh.duration_s,rh.created_at,COALESCE(u.name,'Visitante') AS user_name
            FROM route_history rh LEFT JOIN users u ON u.id=rh.user_id
            WHERE rh.created_at>=? ORDER BY rh.id DESC LIMIT 35
        """, (cutoff,))
        data["journey"] = _many(db, f"""
            SELECT metadata, event_type FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE} AND event_type='route'
            ORDER BY id DESC LIMIT 4000
        """, (cutoff,))
        totals = {"navigation-start": 0, "navigation-complete": 0,
                  "reroute": 0, "alternative": 0}
        for item in data.pop("journey"):
            label = _event_label(item.get("metadata"))
            if label == "navigation-start":
                totals["navigation-start"] += 1
            elif label.startswith("navigation-complete:"):
                totals["navigation-complete"] += 1
            elif label.startswith("reroute-"):
                totals["reroute"] += 1
            elif label.startswith("alternative-"):
                totals["alternative"] += 1
        data["journey_counts"] = totals
        data["journey_sampled"] = _number(data["summary"].get("route_events")) > 4000

    elif section == "events":
        data["event_types"] = _many(db, f"""
            SELECT event_type, COUNT(*) AS total
            FROM request_activity_logs WHERE created_at>=? AND {PRODUCT_SCOPE}
              AND event_type <> 'request'
            GROUP BY event_type ORDER BY total DESC LIMIT 15
        """, (cutoff,))
        data["filter_type"] = "all"
        data["recent_events"] = []  # Filled by the route with an allowlisted category.

    elif section == "health":
        data["status_codes"] = _many(db, f"""
            SELECT status_code,COUNT(*) AS total FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE}
              AND event_type='request' AND status_code>=400
            GROUP BY status_code ORDER BY total DESC LIMIT 12
        """, (cutoff,))
        data["error_paths"] = _many(db, f"""
            SELECT path, COUNT(*) AS total FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE}
              AND event_type='request' AND status_code>=400
            GROUP BY path ORDER BY total DESC LIMIT 10
        """, (cutoff,))
        durations = _many(db, f"""
            SELECT duration_ms FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE} AND event_type='request'
              AND duration_ms >= 0
            ORDER BY id DESC LIMIT 2000
        """, (cutoff,))
        ms = [x["duration_ms"] for x in durations]
        data["latencies"] = {
            "p50": _percentile(ms, .50),
            "p95": _percentile(ms, .95),
            "p99": _percentile(ms, .99),
            "sample": len(ms),
        }
        data["client_errors"] = _one(db, f"""
            SELECT COUNT(*) AS total FROM request_activity_logs
            WHERE created_at>=? AND {PRODUCT_SCOPE} AND event_type='performance'
              AND metadata LIKE '%client-error:%'
        """, (cutoff,))

    return data


def load_recent_events(db, days, event_type, *, now=None):
    """Filtered admin feed, with no raw IP/UA or arbitrary metadata output."""
    if days not in ALLOWED_DAYS:
        raise ValueError("Invalid analytics interval")
    if event_type not in EVENT_TYPES:
        event_type = "all"
    now = now or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat()
    filter_clause = "" if event_type == "all" else " AND l.event_type=?"
    params = (cutoff,) if event_type == "all" else (cutoff, event_type)
    rows = _many(db, f"""
        SELECT l.created_at,l.event_type,l.path,l.metadata,
               COALESCE(u.name,'Visitante') AS user_name
        FROM request_activity_logs l LEFT JOIN users u ON u.id=l.user_id
        WHERE l.created_at>=? AND l.event_type<>'request'
          AND l.path NOT LIKE '/admin%' AND l.path NOT LIKE '/api/admin/%'
          {filter_clause}
        ORDER BY l.id DESC LIMIT 100
    """, params)
    for row in rows:
        row["label"] = _event_label(row.pop("metadata", "{}"))
    return rows
